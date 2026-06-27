import type { StructuredToolInterface } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Runnable } from '@langchain/core/runnables'
import { BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import * as fs from 'fs'
import logger from 'electron-log'
import { ChatOptions, StructuredMessage } from './types'

/** 适配 DeepSeek-R1 等模型在 additional_kwargs 中返回的推理内容 */
interface ReasoningMessage {
  additional_kwargs?: {
    reasoning_content?: string
    reasoning?: string
  }
}

class ChatService {
  private modelWithTools: Runnable
  private toolsMap: Map<string, StructuredToolInterface> = new Map()
  private readonly maxIterations: number

  /**
   * @param model 已创建的 BaseChatModel 实例（由外部 ProviderService 提供）
   * @param tools 工具列表
   * @param maxIterations 工具调用最大轮次（默认5）
   */
  constructor(model: BaseChatModel, tools: StructuredToolInterface[] = [], maxIterations = 5) {
    this.maxIterations = maxIterations

    for (const tool of tools) {
      this.toolsMap.set(tool.name, tool)
    }

    if (tools.length > 0 && typeof model.bindTools === 'function') {
      this.modelWithTools = model.bindTools(tools)
    } else {
      this.modelWithTools = model
    }

    logger.info(`ChatService initialized (maxIterations=${maxIterations})`)
  }

  /**
   * 发送消息并返回结构化的消息列表
   * @param message 用户输入
   * @param options 可选配置
   * @returns 结构化消息数组，每个元素包含工具调用信息或文本内容
   */
  async sendMessage(message: string, options?: ChatOptions): Promise<StructuredMessage[]> {
    const structuredMessages: StructuredMessage[] = []

    try {
      const userMessage = buildHumanMessage(message, options?.images, options?.documents)
      const messages: BaseMessage[] = [userMessage]
      let remaining = this.maxIterations

      while (remaining-- > 0) {
        const response = await this.modelWithTools.invoke(messages)
        messages.push(response)

        // 处理模型响应的文本内容（如果有）
        const content = response.content as string
        if (content) {
          structuredMessages.push({ content })
        }

        const toolCalls = response.tool_calls || []
        if (toolCalls.length === 0) {
          break
        }

        // 处理每个工具调用
        for (const toolCall of toolCalls) {
          const { name, args, id } = toolCall
          logger.info(`Tool called: ${name}, args: ${JSON.stringify(args)}`)

          let toolOutput: string
          const tool = this.toolsMap.get(name)
          if (tool) {
            try {
              toolOutput = await tool.invoke(args)
            } catch (err) {
              toolOutput = `Error executing tool ${name}: ${err}`
              logger.error(toolOutput)
            }
          } else {
            toolOutput = `Tool ${name} not found.`
            logger.warn(toolOutput)
          }

          // 将工具调用结果添加到结构化消息中
          structuredMessages.push({
            tool: {
              name,
              input: args,
              output: toolOutput
            }
          })

          // 将工具结果加入消息历史，供下一轮使用
          messages.push(
            new ToolMessage({
              content: toolOutput,
              tool_call_id: id
            })
          )
        }
      }

      // 如果有工具调用但没有最终文本响应，那是正常的
      // 因为工具调用本身就是一个完整的响应
      return structuredMessages
    } catch (error) {
      logger.error('Error in sendMessage:', error)
      return [
        {
          content: `Failed to get response: ${error}`
        }
      ]
    }
  }

  /**
   * 发送消息并以流式方式返回内容
   * @param message 用户输入
   * @param options 可选配置
   * @returns 异步生成器，返回 StructuredMessage
   */
  async *sendMessageStream(
    message: string,
    options?: ChatOptions
  ): AsyncGenerator<StructuredMessage> {
    logger.info(`options: ${JSON.stringify(options)}`)

    try {
      const userMessage = buildHumanMessage(message, options?.images, options?.documents)
      const messages: BaseMessage[] = [userMessage]
      let remaining = this.maxIterations

      while (remaining-- > 0) {
        // 首先用 invoke 获取完整响应以检查工具调用
        const fullResponse = await this.modelWithTools.invoke(messages)
        messages.push(fullResponse)

        // 如果有文本内容或推理内容，使用 stream 来流式输出
        const content = fullResponse.content as string
        const fullReasoning = (fullResponse as unknown as ReasoningMessage).additional_kwargs
          ?.reasoning_content
        if (content || fullReasoning) {
          const stream = await this.modelWithTools.stream(messages.slice(0, -1))
          let hasYieldedContent = false
          for await (const chunk of stream) {
            // 处理思考/推理内容（DeepSeek-R1 等模型在 additional_kwargs 中返回）
            const reasoningMsg = chunk as unknown as ReasoningMessage
            const reasoningContent =
              reasoningMsg.additional_kwargs?.reasoning_content ||
              reasoningMsg.additional_kwargs?.reasoning
            if (reasoningContent) {
              yield {
                reasoning_content: reasoningContent
              }
            }

            // 处理正常文本内容
            if (chunk.content && typeof chunk.content === 'string') {
              hasYieldedContent = true
              yield {
                content: chunk.content
              }
            }
          }

          // 如果 stream 产生的内容为空但 invoke 有内容（某些模型不返回流式 token），
          // 回退为一次性输出全部 invoke 结果
          if (!hasYieldedContent && content) {
            yield {
              content
            }
          }
        }

        const toolCalls = fullResponse.tool_calls || []
        if (toolCalls.length === 0) {
          break
        }

        // 处理每个工具调用
        for (const toolCall of toolCalls) {
          const { name, args, id } = toolCall
          logger.info(`Tool called: ${name}, args: ${JSON.stringify(args)}`)

          let toolOutput: string
          const tool = this.toolsMap.get(name)
          if (tool) {
            try {
              toolOutput = await tool.invoke(args)
            } catch (err) {
              toolOutput = `Error executing tool ${name}: ${err}`
              logger.error(toolOutput)
            }
          } else {
            toolOutput = `Tool ${name} not found.`
            logger.warn(toolOutput)
          }

          // 将工具调用结果添加到结构化消息中
          yield {
            tool: {
              name,
              input: args,
              output: toolOutput
            }
          }

          // 将工具结果加入消息历史，供下一轮使用
          messages.push(
            new ToolMessage({
              content: toolOutput,
              tool_call_id: id
            })
          )
        }
      }

      // 如果有工具调用但没有最终文本响应，那是正常的
      // 因为工具调用本身就是一个完整的响应
    } catch (error) {
      logger.error('Error in sendMessageStream:', error)
      yield {
        content: `Failed to get response: ${error}`
      }
    }
  }
}

export { ChatService }

/**
 * 构建 HumanMessage，支持多模态（图片 + 文本）及文档附件
 */
function buildHumanMessage(
  text: string,
  images?: string[],
  documents?: { fileName: string; filePath: string }[]
): HumanMessage {
  let fullText = text

  // 将文档内容拼接到消息文本中
  if (documents && documents.length > 0) {
    for (const doc of documents) {
      try {
        const content = fs.readFileSync(doc.filePath, 'utf-8')
        // 截断过大的文件（限制 50KB，避免超出 token 上限）
        const truncated =
          content.length > 5000 ? content.slice(0, 5000) + '\n...(内容已截断)' : content
        fullText += `\n\n--- 附件文档: ${doc.fileName} ---\n${truncated}\n--- 文档结束 ---`
      } catch (err) {
        logger.warn(`Failed to read document ${doc.fileName}:`, err)
        fullText += `\n\n[无法读取文件: ${doc.fileName}]`
      }
    }
  }

  if (!images || images.length === 0) {
    return new HumanMessage(fullText)
  }

  // 多模态消息：文本 + 图片
  const content: { type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }[] = [
    { type: 'text', text: fullText }
  ]

  for (const img of images) {
    content.push({
      type: 'image_url',
      image_url: { url: img }
    })
  }

  return new HumanMessage({ content })
}
