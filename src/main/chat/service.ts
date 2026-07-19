import type { StructuredToolInterface } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages'
import { createDeepAgent } from 'deepagents'
import * as fs from 'fs'
import logger from 'electron-log'
import { ChatOptions, StructuredMessage, ToolCallDetail } from './types'

/** 适配 DeepSeek-R1 等模型在 additional_kwargs 中返回的推理内容 */
interface ReasoningMessage {
  additional_kwargs?: {
    reasoning_content?: string
    reasoning?: string
  }
}

/** 数据库中的对话记录（精简版，避免循环依赖） */
export interface HistoryDialogue {
  id: number
  topic_id: number
  role: 'user' | 'assistant'
  content: string
  blocks: string | null
  created_at: string
}

/** 历史加载回调：根据 topicId 返回对话记录 */
export type LoadHistoryFn = (topicId: number) => Promise<HistoryDialogue[]>

class ChatService {
  private readonly model: BaseChatModel
  private readonly tools: StructuredToolInterface[]
  private readonly _maxIterations: number
  private readonly loadHistory?: LoadHistoryFn
  private readonly historyWindowSize: number
  private readonly toolCallWindowSize: number

  /**
   * @param model 已创建的 BaseChatModel 实例（由外部 ProviderService 提供）
   * @param tools 工具列表
   * @param maxIterations 工具调用最大轮次（保留兼容性，deepagents 内部自动管理）
   * @param loadHistory 从数据库加载历史对话的回调（由主进程注入，避免循环依赖）
   * @param historyWindowSize 历史对话轮次上限（0 = 不限制），默认 10
   * @param toolCallWindowSize 历史工具调用条数上限（0 = 不限制），默认 20
   */
  constructor(
    model: BaseChatModel,
    tools: StructuredToolInterface[] = [],
    maxIterations = 5,
    loadHistory?: LoadHistoryFn,
    historyWindowSize = 10,
    toolCallWindowSize = 20
  ) {
    this.model = model
    this.tools = tools
    this._maxIterations = maxIterations
    this.loadHistory = loadHistory
    this.historyWindowSize = historyWindowSize
    this.toolCallWindowSize = toolCallWindowSize
    logger.info(
      `ChatService initialized with DeepAgents (maxIterations=${this._maxIterations}, historyWindow=${this.historyWindowSize}, toolCallWindow=${this.toolCallWindowSize})`
    )
  }

  /**
   * 从数据库加载历史消息上下文
   * @param topicId 话题 ID
   * @returns 转换后的 LangChain BaseMessage 数组
   */
  private async loadContextMessages(topicId: number): Promise<BaseMessage[]> {
    if (!this.loadHistory || topicId <= 0) return []

    try {
      const dialogues = await this.loadHistory(topicId)
      // 排除最后一条（当前用户消息），只取之前的对话
      const historyDialogues = dialogues.slice(0, -1)
      if (historyDialogues.length === 0) return []

      const messages = convertDialoguesToMessages(
        historyDialogues,
        this.historyWindowSize,
        this.toolCallWindowSize
      )
      logger.info(`[Chat] Loaded ${messages.length} history messages for topic ${topicId}`)
      return messages
    } catch (err) {
      logger.error('Failed to load chat history:', err)
      return []
    }
  }

  /**
   * 发送消息并返回结构化的消息列表
   * @param message 用户输入
   * @param options 可选配置（含 topicId 用于加载历史）
   * @returns 结构化消息数组，每个元素包含工具调用信息或文本内容
   */
  async sendMessage(message: string, options?: ChatOptions): Promise<StructuredMessage[]> {
    try {
      const agent = createDeepAgent({
        model: this.model,
        tools: this.tools,
        systemPrompt: 'You are a helpful assistant.'
      })

      const userMessage = buildHumanMessage(message, options?.images, options?.documents)
      const contextMessages = options?.topicId
        ? await this.loadContextMessages(options.topicId)
        : []
      const result = await agent.invoke({ messages: [...contextMessages, userMessage] })

      return extractStructuredMessages(result.messages || [])
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
   * @param options 可选配置（含 topicId 用于加载历史）
   * @returns 异步生成器，返回 StructuredMessage
   */
  async *sendMessageStream(
    message: string,
    options?: ChatOptions
  ): AsyncGenerator<StructuredMessage> {
    logger.info(`options: ${JSON.stringify(options)}`)

    try {
      const agent = createDeepAgent({
        model: this.model,
        tools: this.tools,
        systemPrompt: 'You are a helpful assistant.'
      })

      const userMessage = buildHumanMessage(message, options?.images, options?.documents)
      const contextMessages = options?.topicId
        ? await this.loadContextMessages(options.topicId)
        : []
      const run = await agent.streamEvents(
        { messages: [...contextMessages, userMessage] },
        { version: 'v3' }
      )

      // 使用队列实现消息和工具调用的并发流式输出
      const queue: StructuredMessage[] = []
      let waiting: (() => void) | null = null
      let producersAlive = 2

      const enqueue = (item: StructuredMessage): void => {
        queue.push(item)
        if (waiting) {
          waiting()
          waiting = null
        }
      }

      const markDone = (): void => {
        producersAlive--
        if (waiting) {
          waiting()
          waiting = null
        }
      }

      // 生产者1：流式输出文本和推理内容
      const msgProducer = (async (): Promise<void> => {
        try {
          for await (const msg of run.messages) {
            // 流式输出推理内容（DeepSeek-R1 等模型的思考过程）
            if (msg.reasoning) {
              for await (const token of msg.reasoning) {
                enqueue({ reasoning_content: token })
              }
            }
            // 流式输出文本内容
            if (msg.text) {
              for await (const token of msg.text) {
                enqueue({ content: token })
              }
            }
          }
        } catch (err) {
          logger.error('Stream message error:', err)
        } finally {
          markDone()
        }
      })()

      // 生产者2：工具调用
      const toolProducer = (async (): Promise<void> => {
        try {
          for await (const call of run.toolCalls) {
            const input = call.input
            const output = await call.output
            enqueue({
              tool: {
                name: call.name,
                input,
                output
              }
            })
          }
        } catch (err) {
          logger.error('Stream tool call error:', err)
        } finally {
          markDone()
        }
      })()

      // 主消费者循环：从队列中取出并 yield
      while (producersAlive > 0 || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!
        } else if (producersAlive > 0) {
          await new Promise<void>((resolve) => {
            waiting = resolve
          })
        }
      }

      // 等待两个生产者完成（捕获潜在错误）
      await Promise.allSettled([msgProducer, toolProducer])
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
 * 从 LangChain 消息列表中提取结构化的消息输出
 */
function extractStructuredMessages(messages: BaseMessage[]): StructuredMessage[] {
  const result: StructuredMessage[] = []
  const toolOutputs = new Map<string, string>()

  // 第一遍：收集所有工具输出
  for (const msg of messages) {
    if (msg.type === 'tool') {
      const tm = msg as unknown as { tool_call_id: string; content: string }
      toolOutputs.set(tm.tool_call_id, tm.content)
    }
  }

  // 第二遍：提取内容和工具调用
  for (const msg of messages) {
    if (msg.type === 'human') continue

    // 推理内容
    const reasoningContent = (msg as unknown as ReasoningMessage).additional_kwargs
      ?.reasoning_content
    if (reasoningContent) {
      result.push({ reasoning_content: reasoningContent })
    }

    // 文本内容
    const content = typeof msg.content === 'string' ? msg.content : ''
    if (content) {
      result.push({ content })
    }

    // 工具调用
    const toolCalls = (
      msg as unknown as {
        tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>
      }
    ).tool_calls
    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        result.push({
          tool: {
            name: tc.name,
            input: tc.args,
            output: toolOutputs.get(tc.id) || ''
          }
        })
      }
    }
  }

  return result
}

/**
 * 将数据库中的对话记录转换为 LangChain BaseMessage 数组，
 * 支持窗口限制（历史轮数 + 工具调用条数）
 */
function convertDialoguesToMessages(
  dialogues: HistoryDialogue[],
  historyWindowSize: number,
  toolCallWindowSize: number
): BaseMessage[] {
  // historyWindowSize=0 表示不限制
  const effectiveHistory = historyWindowSize > 0 ? historyWindowSize : Number.MAX_SAFE_INTEGER
  // toolCallWindowSize=0 表示不限制
  const effectiveToolCalls = toolCallWindowSize > 0 ? toolCallWindowSize : Number.MAX_SAFE_INTEGER

  // 从后往前取最多 effectiveHistory 轮对话
  const selected: HistoryDialogue[] = []
  let pairCount = 0
  for (let i = dialogues.length - 1; i >= 0 && pairCount < effectiveHistory; i--) {
    selected.unshift(dialogues[i])
    if (dialogues[i].role === 'user') {
      pairCount++
    }
  }

  const messages: BaseMessage[] = []
  let toolCallCount = 0

  for (const d of selected) {
    if (d.role === 'user') {
      messages.push(new HumanMessage(d.content))
    } else if (d.role === 'assistant') {
      const blocks: { type: string; text?: string; tool?: ToolCallDetail; reasoning?: string }[] =
        d.blocks ? JSON.parse(d.blocks) : []

      const textBlocks = blocks.filter((b) => b.type === 'text')
      const toolBlocks = blocks.filter((b) => b.type === 'tool')
      const content = textBlocks.map((b) => b.text || '').join('\n') || d.content

      if (toolBlocks.length > 0) {
        // 构建 AIMessage 的 tool_calls 数组
        const toolCalls: { name: string; args: Record<string, unknown>; id: string }[] = []
        for (const tb of toolBlocks) {
          if (toolCallCount >= effectiveToolCalls) break
          const callId = `hist_${d.id}_${toolCallCount}`
          toolCalls.push({
            id: callId,
            name: tb.tool!.name,
            args: tb.tool!.input
          })
          toolCallCount++
        }

        if (toolCalls.length > 0) {
          messages.push(
            new AIMessage({
              content,
              tool_calls: toolCalls.map((tc) => ({
                id: tc.id,
                name: tc.name,
                args: tc.args
              }))
            })
          )
          // 每个工具调用后跟一个 ToolMessage
          for (let ti = 0; ti < toolCalls.length; ti++) {
            const tb = toolBlocks[ti]
            const output = tb.tool!.output
            messages.push(
              new ToolMessage({
                content: output,
                tool_call_id: toolCalls[ti].id
              })
            )
          }
        } else {
          // 所有工具调用都被窗口截断了，只保留文本
          messages.push(new AIMessage(content))
        }
      } else {
        messages.push(new AIMessage(content))
      }
    }
  }

  return messages
}

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
        // 截断过大的文件（限制 5KB，避免超出 token 上限）
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
