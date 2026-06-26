import type { StructuredToolInterface } from '@langchain/core/tools'
import { ChatOpenAI } from '@langchain/openai'
import { Runnable } from '@langchain/core/runnables'
import { BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import logger from 'electron-log'
import { ChatOptions, StructuredMessage } from './types'

class ChatService {
  private model: ChatOpenAI | null = null
  private modelWithTools: Runnable | null = null
  private toolsMap: Map<string, StructuredToolInterface> = new Map()

  constructor(tools: StructuredToolInterface[] = [], modelConfig?: Partial<ChatOpenAI['fields']>) {
    this.initializeModel(tools, modelConfig)
  }

  private initializeModel(
    tools: StructuredToolInterface[],
    modelConfig?: Partial<ChatOpenAI['fields']>
  ): void {
    try {
      for (const tool of tools) {
        this.toolsMap.set(tool.name, tool)
      }

      this.model = new ChatOpenAI({
        model: 'deepseek-v4-flash',
        configuration: {
          baseURL: 'https://api.deepseek.com/v1'
        },
        apiKey: 'sk-528729a68e224c06848e7971fba9ddba',
        temperature: 0.7,
        ...modelConfig
      })

      if (tools.length > 0) {
        this.modelWithTools = this.model.bindTools(tools)
      } else {
        this.modelWithTools = this.model
      }

      logger.info('Chat model initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize chat model:', error)
      throw new Error('Chat model initialization failed')
    }
  }

  /**
   * 发送消息并返回结构化的消息列表
   * @param message 用户输入
   * @param options 可选配置
   * @returns 结构化消息数组，每个元素包含工具调用信息或文本内容
   */
  async sendMessage(message: string, options?: ChatOptions): Promise<StructuredMessage[]> {
    if (!this.modelWithTools) {
      throw new Error('Chat model is not initialized')
    }

    logger.info(`options: ${JSON.stringify(options)}`)
    const structuredMessages: StructuredMessage[] = []

    try {
      const messages: BaseMessage[] = [new HumanMessage(message)]
      let maxIterations = 5

      while (maxIterations-- > 0) {
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
    if (!this.modelWithTools) {
      throw new Error('Chat model is not initialized')
    }

    logger.info(`options: ${JSON.stringify(options)}`)

    try {
      const messages: BaseMessage[] = [new HumanMessage(message)]
      let maxIterations = 5

      while (maxIterations-- > 0) {
        // 首先用 invoke 获取完整响应以检查工具调用
        const fullResponse = await this.modelWithTools.invoke(messages)
        messages.push(fullResponse)

        // 如果有文本内容，使用 stream 来流式输出
        const content = fullResponse.content as string
        if (content) {
          const stream = await this.modelWithTools.stream(messages.slice(0, -1))
          for await (const chunk of stream) {
            if (chunk.content && typeof chunk.content === 'string') {
              yield {
                content: chunk.content
              }
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
