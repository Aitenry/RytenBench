import logger from 'electron-log'
import { StructuredMessage } from '../types'

/** deepagents streamEvents 返回的 run 对象的结构化契约 */
export interface StreamRun {
  messages: AsyncIterable<StreamMessage>
  toolCalls: AsyncIterable<StreamToolCall>
  subagents?: AsyncIterable<StreamSubAgent>
}

interface StreamMessage {
  reasoning?: AsyncIterable<unknown>

  [Symbol.asyncIterator](): AsyncIterator<StreamEvent>
}

interface StreamEvent {
  event: string
  index: number
  delta?: unknown
  content?: { type?: string; name?: unknown; id?: unknown }
}

interface StreamToolCall {
  name: string
  input: unknown
  callId: string
  output: unknown
}

interface StreamSubAgent {
  name: string
  cause?: { type: string; tool_call_id: string }
  messages?: AsyncIterable<StreamMessage>
  toolCalls?: AsyncIterable<StreamToolCall>
}

type EnqueueFn = (item: StructuredMessage) => void
type MarkDoneFn = () => void
type SafeGetOutputFn = (call: { output: unknown }) => Promise<unknown>

/**
 * 生产者1：流式输出文本和推理内容
 */
export async function produceMessages(
  run: StreamRun,
  signal: AbortSignal | undefined,
  enqueue: EnqueueFn,
  markDone: MarkDoneFn
): Promise<void> {
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
}

/**
 * 生产者2：工具调用 — 同一源发 executing 和 completed，callId 天然一致
 */
export async function produceToolCalls(
  run: StreamRun,
  signal: AbortSignal | undefined,
  enqueue: EnqueueFn,
  markDone: MarkDoneFn,
  safeGetOutput: SafeGetOutputFn
): Promise<void> {
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
}

/**
 * 生产者3：智能体流式输出 — 消费 run.subagents，逐 token / tool call 下发
 * 注意：生命周期事件（started/completed）由 toolProducer 统一发送，此处只发内容事件。
 *
 * 关键同步策略：逐条消息处理，每条消息中统计工具调用数量，处理完后
 * 立即从 sa.toolCalls 中消费等量的 executing/completed 事件，再处理下一条消息。
 * 这保证 thinking → context → tool → context 的自然交替顺序不被打破。
 */
export async function produceSubAgents(
  run: StreamRun,
  signal: AbortSignal | undefined,
  enqueue: EnqueueFn,
  markDone: MarkDoneFn,
  safeGetOutput: SafeGetOutputFn
): Promise<void> {
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
              const reasoning = msg.reasoning
              if (reasoning) {
                drains.push(
                  (async () => {
                    let acc = ''
                    for await (const token of reasoning) {
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
                      const id = typeof block.id === 'string' && block.id ? block.id : undefined
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
                  const input = call.input as Record<string, unknown>
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
}
