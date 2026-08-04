import type { StructuredToolInterface } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage } from '@langchain/core/messages'
import { createDeepAgent } from 'deepagents'
import type { SubAgent } from 'deepagents'
import logger from 'electron-log'
import { ChatOptions, StructuredMessage, SubAgentConfig } from '../types'
import { buildSubAgentTools } from '../tools/builders'
import { SafeFilesystemBackend } from './safe-backend'
import type { HistoryDialogue, LoadHistoryFn } from './history'
import { extractStructuredMessages, convertDialoguesToMessages } from './history'
import { buildHumanMessage } from './message-builder'

class ChatService {
  private readonly model: BaseChatModel
  private readonly tools: StructuredToolInterface[]
  private readonly subAgents: SubAgentConfig[]
  private readonly _maxIterations: number
  private readonly loadHistory?: LoadHistoryFn
  private readonly historyWindowSize: number
  private readonly skillsPath?: string
  private readonly enabledSkills?: string[]
  private readonly workspacePath?: string

  /**
   * @param model 已创建的 BaseChatModel 实例（由外部 ProviderService 提供）
   * @param tools 工具列表
   * @param subAgents 智能体定义列表
   * @param maxIterations 工具调用最大轮次（保留兼容性，deepAgents 内部自动管理）
   * @param loadHistory 从数据库加载历史对话的回调（由主进程注入，避免循环依赖）
   * @param historyWindowSize 历史对话轮次上限（0 = 不限制），默认 10
   * @param skillsPath 技能存储目录（deepAgents skills），空表示不启用
   * @param enabledSkills 启用的技能 ID 列表，undefined 表示全部启用
   * @param workspacePath AI 工作区目录，挂载为 FilesystemBackend 根目录（虚拟 /）
   */
  constructor(
    model: BaseChatModel,
    tools: StructuredToolInterface[] = [],
    subAgents: SubAgentConfig[] = [],
    maxIterations = 5,
    loadHistory?: LoadHistoryFn,
    historyWindowSize = 10,
    skillsPath?: string,
    enabledSkills?: string[],
    workspacePath?: string
  ) {
    this.model = model
    this.tools = tools
    this.subAgents = subAgents
    this._maxIterations = maxIterations
    this.loadHistory = loadHistory
    this.historyWindowSize = historyWindowSize
    this.skillsPath = skillsPath
    this.enabledSkills = enabledSkills
    this.workspacePath = workspacePath
    logger.info(
      `ChatService initialized with DeepAgents (maxIterations=${this._maxIterations}, historyWindow=${this.historyWindowSize}, skillsPath=${this.skillsPath ?? 'disabled'}, workspacePath=${this.workspacePath ?? 'disabled'}, subAgents=${this.subAgents.length})`
    )
  }

  /**
   * 创建 DeepAgent 实例；配置工作区目录时挂载 FilesystemBackend，配置技能目录时启用 skills 加载。
   * 路径需转换为 POSIX 正斜杠（deepAgents 内部使用 path.resolve，Windows 反斜杠会被误解析）。
   * 智能体将工具组合为专用智能体，主代理通过 task() 工具委托任务。
   */
  private createAgent(): ReturnType<typeof createDeepAgent> {
    // 构建 deepAgents SubAgent 字典，解析工具名称为实际工具实例
    const deepSubAgents: SubAgent[] = this.subAgents.map((sa) => ({
      name: sa.name,
      description: sa.description,
      systemPrompt: sa.systemPrompt,
      model: sa.model,
      tools: buildSubAgentTools(sa) as SubAgent['tools']
    }))

    const baseConfig = {
      model: this.model,
      tools: this.tools,
      systemPrompt: `Your name is Rita. You are a helpful assistant.

You are in a continuous conversation with the user. All messages in the chat history are genuine prior exchanges between you and this same user — treat them as real conversation context.
- When the user asks about "previous" or "last time", refer to the conversation history provided.
- Do NOT claim you cannot see or remember earlier messages. You have full access to the chat history.
- Keep your responses concise and natural in Chinese unless the user writes in another language.`,
      subagents: deepSubAgents.length > 0 ? deepSubAgents : undefined
    }

    // 确定 FilesystemBackend 的根目录：优先 workspacePath，回退到 skillsPath
    const backendRoot = this.workspacePath || this.skillsPath
    const config: Record<string, unknown> = { ...baseConfig }

    if (backendRoot) {
      const posixPath = backendRoot.replace(/\\/g, '/')
      config.backend = new SafeFilesystemBackend({ rootDir: posixPath, virtualMode: true })
    }

    if (this.skillsPath) {
      const skillPaths = this.enabledSkills ? this.enabledSkills.map((s) => '/' + s) : ['/']
      if (skillPaths.length > 0) {
        config.skills = skillPaths
      }
    }

    return createDeepAgent(config as Parameters<typeof createDeepAgent>[0])
  }

  /**
   * 从数据库加载历史消息上下文
   * @param topicId 话题 ID
   * @returns 转换后的 LangChain BaseMessage 数组
   */
  private async loadContextMessages(topicId: number): Promise<BaseMessage[]> {
    if (!this.loadHistory) {
      logger.warn('[Chat] loadHistory callback not provided, skipping history')
      return []
    }
    if (topicId <= 0) {
      logger.warn(`[Chat] Invalid topicId=${topicId}, skipping history`)
      return []
    }

    try {
      const dialogues = await this.loadHistory(topicId)
      logger.info(`[Chat] Fetched ${dialogues.length} dialogues for topic ${topicId}`)
      // 排除最后一条（当前用户消息），只取之前的对话
      const historyDialogues = dialogues.slice(0, -1)
      if (historyDialogues.length === 0) {
        logger.info(
          `[Chat] No prior dialogues for topic ${topicId} after excluding current message`
        )
        return []
      }

      const messages = convertDialoguesToMessages(historyDialogues, this.historyWindowSize)
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
      const agent = this.createAgent()

      const userMessage = buildHumanMessage(message, options?.images, options?.documents)
      const contextMessages = options?.topicId
        ? await this.loadContextMessages(options.topicId)
        : []
      logger.info(
        `[Chat] Passing ${contextMessages.length} context messages + 1 user message to deepagent (topicId=${options?.topicId})`
      )
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
    const signal = options?.signal

    try {
      const agent = this.createAgent()

      const userMessage = buildHumanMessage(message, options?.images, options?.documents)
      const contextMessages = options?.topicId
        ? await this.loadContextMessages(options.topicId)
        : []
      logger.info(
        `[Chat] Passing ${contextMessages.length} context messages + 1 user message to deepagent (topicId=${options?.topicId})`
      )
      if (contextMessages.length > 0) {
        logger.info(`[Chat] Context roles: ${contextMessages.map((m) => m._getType()).join(' → ')}`)
      }
      const run = await agent.streamEvents(
        { messages: [...contextMessages, userMessage] },
        { version: 'v3', signal }
      )

      // 使用队列实现消息和工具调用的并发流式输出
      const queue: StructuredMessage[] = []
      let waiting: (() => void) | null = null
      let producersAlive = 3

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

      /** 安全获取 tool call output，捕获 abort 触发的 rejection */
      const safeGetOutput = async (call: { output: unknown }): Promise<unknown> => {
        try {
          return await call.output
        } catch (err) {
          if (signal?.aborted) {
            const abortErr = new Error('Tool call aborted')
            abortErr.name = 'AbortError'
            throw abortErr
          }
          throw err
        }
      }

      // 生产者1：流式输出文本和推理内容
      const msgProducer = (async (): Promise<void> => {
        // lastSent 提升到跨所有 msg 共享：某些 provider / deepAgents 会把整段文本拆成多个 msg 重复发送
        let lastSentReasoning = ''
        let lastSentContent = ''
        try {
          for await (const msg of run.messages) {
            if (signal?.aborted) break
            // 推理流和文本流必须并发消费：对部分只发 delta 事件的 provider，
            // reasoning 流要到整条消息结束才关闭，顺序消费会把正文扣留到消息完成后才下发
            const reasoning = msg.reasoning
            const drains: Promise<void>[] = []
            if (reasoning) {
              drains.push(
                (async () => {
                  let acc = ''
                  for await (const token of reasoning) {
                    if (signal?.aborted) break
                    const tokenText = String(token ?? '')
                    if (!tokenText) continue
                    if (
                      tokenText.startsWith(lastSentReasoning) &&
                      tokenText.length > lastSentReasoning.length
                    ) {
                      acc += tokenText.slice(lastSentReasoning.length)
                    } else if (tokenText !== lastSentReasoning) {
                      acc += tokenText
                    }
                    lastSentReasoning = tokenText
                  }
                  // 批量发送：避免与 text 流 token 级交替造成 reasoning 块的碎片化
                  if (acc) {
                    enqueue({ reasoning_content: acc })
                  }
                })()
              )
            }
            // text + tool 统一迭代：单次遍历 msg 事件，按时间顺序产出 text 和 tool preparing
            // 不再使用独立的 msg.text / msg[Symbol.asyncIterator] 两路消费
            {
              const toolBlocks = new Map<number, { id?: string; name: string }>()
              let lastProgressAt = 0
              for await (const event of msg) {
                if (signal?.aborted) break
                if (event.event === 'content-block-delta') {
                  const d = event.delta as unknown as Record<string, unknown>
                  // 文本增量：检测 text 属性（兼容 delta.type 为 text_delta / text 等）
                  if (typeof d.text === 'string' && d.text) {
                    const tokenText = d.text
                    if (
                      tokenText.startsWith(lastSentContent) &&
                      tokenText.length > lastSentContent.length
                    ) {
                      const delta = tokenText.slice(lastSentContent.length)
                      enqueue({ content: delta })
                    } else if (tokenText !== lastSentContent) {
                      enqueue({ content: tokenText })
                    }
                    lastSentContent = tokenText
                  }
                  // 工具参数增量
                  else if (
                    d.type === 'block-delta' &&
                    (d.fields as Record<string, unknown>)?.type === 'tool_call_chunk'
                  ) {
                    const now = Date.now()
                    if (now - lastProgressAt < 500) continue
                    lastProgressAt = now
                    const info = toolBlocks.get(event.index)
                    if (!info || info.name === 'task') continue
                    enqueue({
                      tool: {
                        name: info.name,
                        input: {},
                        output: '',
                        status: 'preparing',
                        id: info.id
                      }
                    })
                  }
                } else if (event.event === 'content-block-start') {
                  const block = event.content as { type?: string; name?: unknown; id?: unknown }
                  if (block.type === 'tool_call_chunk' || block.type === 'tool_call') {
                    const name = typeof block.name === 'string' ? block.name : ''
                    if (name === 'task') continue
                    const id = typeof block.id === 'string' && block.id ? block.id : undefined
                    toolBlocks.set(event.index, { id, name })
                    lastProgressAt = Date.now()
                    enqueue({ tool: { name, input: {}, output: '', status: 'preparing', id } })
                  }
                }
              }
            }
            await Promise.all(drains)
          }
        } catch (err) {
          if ((err as Error)?.name !== 'AbortError') {
            logger.error('Stream message error:', err)
          }
        } finally {
          markDone()
        }
      })().catch(() => {})

      // 生产者2：工具调用 — 同一源发 executing 和 completed，callId 天然一致
      const toolProducer = (async (): Promise<void> => {
        try {
          for await (const call of run.toolCalls) {
            if (signal?.aborted) break
            const input = call.input as Record<string, unknown>
            // task 工具是智能体派遣器：转换为 subAgent 事件下发，前端只看到智能体块
            if (call.name === 'task') {
              const saName =
                (typeof input?.subagent_type === 'string' && input.subagent_type) || 'subAgent'
              const taskDesc = (typeof input?.description === 'string' && input.description) || ''
              const causeId = call.callId
              // executing → 下发 started 智能体事件（携带任务描述）
              enqueue({
                subAgent: { name: saName, causeId, status: 'started', taskDescription: taskDesc }
              })
              await new Promise<void>((resolve) => setTimeout(resolve, 100))
              if (signal?.aborted) break
              const raw = await safeGetOutput(call)
              const output = typeof raw === 'string' ? raw : JSON.stringify(raw)
              // completed → 下发 completed 智能体事件
              enqueue({
                subAgent: {
                  name: saName,
                  causeId,
                  status: 'completed',
                  output,
                  taskDescription: taskDesc
                }
              })
              continue
            }
            // 先发"执行中"状态
            enqueue({
              tool: {
                name: call.name,
                input,
                output: '',
                status: 'executing',
                id: call.callId
              }
            })
            // 延迟 100ms 确保渲染进程有时间渲染 loading 状态
            await new Promise<void>((resolve) => setTimeout(resolve, 100))
            if (signal?.aborted) break
            const raw = await safeGetOutput(call)
            const output = typeof raw === 'string' ? raw : JSON.stringify(raw)
            // 再发"已完成"状态
            enqueue({
              tool: {
                name: call.name,
                input,
                output,
                status: 'completed',
                id: call.callId
              }
            })
          }
        } catch (err) {
          if ((err as Error)?.name !== 'AbortError') {
            logger.error('Stream tool call error:', err)
          }
        } finally {
          markDone()
        }
      })().catch(() => {})

      // 生产者3：智能体流式输出 — 消费 run.subagents，逐 token / tool call 下发
      // 注意：生命周期事件（started/completed）由 toolProducer 统一发送，此处只发内容事件。
      //
      // 关键同步策略：逐条消息处理，每条消息中统计工具调用数量，处理完后
      // 立即从 sa.toolCalls 中消费等量的 executing/completed 事件，再处理下一条消息。
      // 这保证 thinking → context → tool → context 的自然交替顺序不被打破。
      const subAgentProducer = (async (): Promise<void> => {
        try {
          if (run.subagents) {
            for await (const sa of run.subagents) {
              if (signal?.aborted) break
              const causeId: string | undefined =
                sa.cause?.type === 'toolCall' ? sa.cause.tool_call_id : undefined
              try {
                let lastSentReasoning = ''
                let lastSentContent = ''

                // 手动迭代器：逐条处理消息，工具调用按需消费
                const toolIter = sa.toolCalls?.[Symbol.asyncIterator]()
                if (sa.messages) {
                  for await (const msg of sa.messages) {
                    if (signal?.aborted) break
                    const drains: Promise<void>[] = []
                    let pendingToolCount = 0

                    // 推理 drain：独立运行，批量发送
                    if (msg.reasoning) {
                      drains.push(
                        (async () => {
                          let acc = ''
                          for await (const token of msg.reasoning) {
                            if (signal?.aborted) return
                            const tokenText = String(token ?? '')
                            if (!tokenText) continue
                            if (
                              tokenText.startsWith(lastSentReasoning) &&
                              tokenText.length > lastSentReasoning.length
                            ) {
                              acc += tokenText.slice(lastSentReasoning.length)
                            } else if (tokenText !== lastSentReasoning) {
                              acc += tokenText
                            }
                            lastSentReasoning = tokenText
                          }
                          if (acc) {
                            enqueue({
                              subAgent: {
                                name: sa.name,
                                causeId,
                                status: 'running',
                                reasoning_content: acc
                              }
                            })
                          }
                        })()
                      )
                    }

                    // 统一迭代 msg 内容块：按时间顺序产出 text 和 tool preparing
                    {
                      const toolBlocks = new Map<number, { id?: string; name: string }>()
                      let lastProgressAt = 0
                      for await (const event of msg) {
                        if (signal?.aborted) break
                        if (event.event === 'content-block-delta') {
                          const d = event.delta as unknown as Record<string, unknown>
                          if (typeof d.text === 'string' && d.text) {
                            const tokenText = d.text
                            if (
                              tokenText.startsWith(lastSentContent) &&
                              tokenText.length > lastSentContent.length
                            ) {
                              const delta = tokenText.slice(lastSentContent.length)
                              enqueue({
                                subAgent: {
                                  name: sa.name,
                                  causeId,
                                  status: 'running',
                                  content: delta
                                }
                              })
                            } else if (tokenText !== lastSentContent) {
                              enqueue({
                                subAgent: {
                                  name: sa.name,
                                  causeId,
                                  status: 'running',
                                  content: tokenText
                                }
                              })
                            }
                            lastSentContent = tokenText
                          } else if (
                            d.type === 'block-delta' &&
                            (d.fields as Record<string, unknown>)?.type === 'tool_call_chunk'
                          ) {
                            const now = Date.now()
                            if (now - lastProgressAt < 500) continue
                            lastProgressAt = now
                            const info = toolBlocks.get(event.index)
                            if (!info || info.name === 'task') continue
                            enqueue({
                              subAgent: {
                                name: sa.name,
                                causeId,
                                status: 'running',
                                tool: {
                                  name: info.name,
                                  input: {},
                                  output: '',
                                  status: 'preparing',
                                  id: info.id
                                }
                              }
                            })
                          }
                        } else if (event.event === 'content-block-start') {
                          const block = event.content as {
                            type?: string
                            name?: unknown
                            id?: unknown
                          }
                          if (block.type === 'tool_call_chunk' || block.type === 'tool_call') {
                            const name = typeof block.name === 'string' ? block.name : ''
                            if (name === 'task') continue
                            const id =
                              typeof block.id === 'string' && block.id ? block.id : undefined
                            toolBlocks.set(event.index, { id, name })
                            lastProgressAt = Date.now()
                            pendingToolCount++
                            enqueue({
                              subAgent: {
                                name: sa.name,
                                causeId,
                                status: 'running',
                                tool: { name, input: {}, output: '', status: 'preparing', id }
                              }
                            })
                          }
                        }
                      }
                    }

                    await Promise.all(drains)

                    // 本消息中的工具调用全部就绪后，立即从 toolCalls 消费相应数量的
                    // executing/completed 事件，再处理下一条消息
                    if (toolIter && pendingToolCount > 0) {
                      for (let i = 0; i < pendingToolCount; i++) {
                        if (signal?.aborted) break
                        const callResult = await toolIter.next()
                        if (callResult.done) break
                        const call = callResult.value
                        const input = call.input
                        enqueue({
                          subAgent: {
                            name: sa.name,
                            causeId,
                            status: 'running',
                            tool: {
                              name: call.name,
                              input,
                              output: '',
                              status: 'executing',
                              id: call.callId
                            }
                          }
                        })
                        await new Promise<void>((resolve) => setTimeout(resolve, 100))
                        if (signal?.aborted) break
                        const raw = await safeGetOutput(call)
                        const output = typeof raw === 'string' ? raw : JSON.stringify(raw)
                        enqueue({
                          subAgent: {
                            name: sa.name,
                            causeId,
                            status: 'running',
                            tool: {
                              name: call.name,
                              input,
                              output,
                              status: 'completed',
                              id: call.callId
                            }
                          }
                        })
                      }
                    }
                  }
                }
              } catch (err) {
                if ((err as Error)?.name !== 'AbortError') {
                  logger.warn(`SubAgent ${sa.name} stream ended:`, err)
                }
              }

              // 内容流已结束（messages + toolCalls 全处理完），立即发送 early completed
              // 避免 toolProducer 的 call.output 延迟导致前端 spinner 一直转
              enqueue({
                subAgent: { name: sa.name, causeId, status: 'completed' }
              })
            }
          }
        } catch (err) {
          if ((err as Error)?.name !== 'AbortError') {
            logger.error('Stream subAgent error:', err)
          }
        } finally {
          markDone()
        }
      })().catch(() => {})

      // 主消费者循环：从队列中取出并 yield
      while (producersAlive > 0 || queue.length > 0) {
        if (signal?.aborted) {
          break
        }
        if (queue.length > 0) {
          yield queue.shift()!
        } else if (producersAlive > 0) {
          await new Promise<void>((resolve) => {
            waiting = resolve
          })
        }
      }

      // 等待所有生产者完成（捕获潜在错误）
      await Promise.allSettled([msgProducer, toolProducer, subAgentProducer])
    } catch (error) {
      logger.error('Error in sendMessageStream:', error)
      yield {
        content: `Failed to get response: ${error}`
      }
    }
  }
}

export { ChatService }
export type { HistoryDialogue, LoadHistoryFn }
