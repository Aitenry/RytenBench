import logger from 'electron-log'
import { StructuredMessage, ToolCard } from '../types'
import type { RuntimeStream, MessageRecord, ToolCallRecord, SubAgentRecord } from '../runtime/types'

/**
 * 流式生产者 — 消费 LangChain 运行时的三路记录流，转换为前端协议 StructuredMessage。
 *
 * 与旧版 deepagents streamEvents(v3) 版本的行为保持一致：
 * - 消息生产者：推理/文本增量去重（兼容 delta 与整段两种形态）+ 工具 preparing 节流；
 * - 工具生产者：executing → completed + 定制卡片；task 工具转换为子代理 started/completed；
 * - 子代理生产者：按 (name, causeId) 分组，逐记录转发 running 事件，结束时发 early completed。
 */

type EnqueueFn = (item: StructuredMessage) => void
type MarkDoneFn = () => void
type SafeGetOutputFn = (call: { output: unknown }) => Promise<unknown>

/** 延迟 100ms 确保渲染进程有时间渲染 loading 状态 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// 定制化工具卡片生成
// ============================================================================

/** 从工具名称、输入和输出中提取定制化卡片数据 */
function buildToolCard(
  name: string,
  input: Record<string, unknown>,
  output: string
): ToolCard | undefined {
  switch (name) {
    case 'read_file':
    case 'write_file':
    case 'edit_file': {
      const filePath = typeof input.file_path === 'string' ? input.file_path : undefined
      if (!filePath) return undefined
      return { path: filePath }
    }
    case 'ls': {
      const dirPath = typeof input.path === 'string' ? input.path : '/'
      let count: number | undefined
      try {
        const parsed = JSON.parse(output)
        if (Array.isArray(parsed.files)) {
          count = parsed.files.length
        } else if (parsed.files === undefined && parsed.error) {
          // 失败时不显示计数
        }
      } catch {
        // 非 JSON 输出（字符串列表），按行估算
        const trimmed = output.trim()
        if (trimmed) {
          count = trimmed.split('\n').length
        }
      }
      return { path: dirPath, count }
    }
    case 'glob': {
      const pattern = typeof input.pattern === 'string' ? input.pattern : undefined
      let count: number | undefined
      try {
        const parsed = JSON.parse(output)
        if (Array.isArray(parsed.files)) {
          count = parsed.files.length
        }
      } catch {
        const trimmed = output.trim()
        if (trimmed) {
          count = trimmed.split('\n').length
        }
      }
      return { pattern, count }
    }
    case 'grep': {
      const pattern = typeof input.pattern === 'string' ? input.pattern : undefined
      let count: number | undefined
      try {
        const parsed = JSON.parse(output)
        if (Array.isArray(parsed.matches)) {
          count = parsed.matches.length
        }
      } catch {
        const trimmed = output.trim()
        if (trimmed) {
          count = trimmed.split('\n').length
        }
      }
      return { pattern, count }
    }
    case 'execute': {
      const command = typeof input.command === 'string' ? input.command : undefined
      return command ? { command } : undefined
    }
    default:
      return undefined
  }
}

// ============================================================================
// 消息流生产者：推理增量 / 文本增量 / 工具块
// ============================================================================

/** 流式增量形态：unknown=未确定 / cumulative=累积全文 / incremental=纯增量 */
type DeltaMode = 'unknown' | 'cumulative' | 'incremental'

/**
 * 文本增量计算器（带形态锁定）：
 * - 前两条 chunk 确定 provider 形态：第二条是第一条的扩展 → 累积全文，否则纯增量；
 * - 累积全文形态：仅返回新增后缀；等长重复 = 无新内容，跳过；
 * - 纯增量形态：一律下发——包括与前一条相同的「重复短语」（"好的，好的，…"是模型
 *   真实输出）与「后者恰好以前者开头」的相邻 chunk（如 '\n' 与 '\n| 表格行'），
 *   误做 startsWith/slice 会吃掉真实内容。
 */
function makeDeltaComputer(): (tokenText: string, lastSent: string) => string | undefined {
  let mode: DeltaMode = 'unknown'
  return (tokenText: string, lastSent: string): string | undefined => {
    if (!tokenText) return undefined
    if (mode === 'incremental') return tokenText
    if (mode === 'cumulative') {
      if (tokenText.startsWith(lastSent)) {
        if (tokenText.length > lastSent.length) {
          return tokenText.slice(lastSent.length)
        }
        return undefined
      }
      // 异常（形态中途变化）：按增量下发，避免丢内容
      return tokenText
    }
    // unknown：首条直接下发；第二条起确定形态
    if (!lastSent) return tokenText
    if (tokenText.startsWith(lastSent)) {
      if (tokenText.length > lastSent.length) {
        mode = 'cumulative'
        return tokenText.slice(lastSent.length)
      }
      // 与上一条完全相同：仍无法确定形态（增量形态的重复短语），按增量下发
      return tokenText
    }
    mode = 'incremental'
    return tokenText
  }
}

export async function produceMessages(
  run: RuntimeStream,
  signal: AbortSignal | undefined,
  enqueue: EnqueueFn,
  markDone: MarkDoneFn
): Promise<void> {
  // lastSent 跨所有记录共享：某些 provider 会把整段文本拆成多条重复发送
  let lastSentReasoning = ''
  let lastSentContent = ''
  const reasoningDelta = makeDeltaComputer()
  const contentDelta = makeDeltaComputer()
  const toolBlocks = new Map<number, { id?: string; name: string }>()
  let lastProgressAt = 0
  try {
    for await (const rec of run.messages as AsyncIterable<MessageRecord>) {
      if (signal?.aborted) break
      if (rec.kind === 'reasoning') {
        const delta = reasoningDelta(rec.text, lastSentReasoning)
        if (delta) {
          enqueue({ reasoning_content: delta })
        }
        lastSentReasoning = rec.text
      } else if (rec.kind === 'retry_attempt') {
        // 模型单次请求失败后在原调用处自动重试（不整轮重跑），转发进度给前端展示
        enqueue({ retrying: { attempt: rec.attempt, retries: rec.retries } })
      } else if (rec.kind === 'text') {
        const delta = contentDelta(rec.text, lastSentContent)
        if (delta) {
          enqueue({ content: delta })
        }
        lastSentContent = rec.text
      } else if (rec.kind === 'tool_block_start') {
        if (rec.name === 'task') continue
        toolBlocks.set(rec.index, { id: rec.id, name: rec.name })
        lastProgressAt = Date.now()
        enqueue({
          tool: { name: rec.name, input: {}, output: '', status: 'preparing', id: rec.id }
        })
      } else if (rec.kind === 'tool_args') {
        // 工具参数增量：节流 500ms，只刷状态不刷内容
        const now = Date.now()
        if (now - lastProgressAt < 500) continue
        lastProgressAt = now
        const info = toolBlocks.get(rec.index)
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
    }
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      logger.error('Stream message error:', err)
    }
  } finally {
    markDone()
  }
}

// ============================================================================
// 工具调用流生产者：executing → completed
// ============================================================================

export async function produceToolCalls(
  run: RuntimeStream,
  signal: AbortSignal | undefined,
  enqueue: EnqueueFn,
  markDone: MarkDoneFn,
  safeGetOutput: SafeGetOutputFn
): Promise<void> {
  try {
    for await (const call of run.toolCalls as AsyncIterable<ToolCallRecord>) {
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
        await sleep(100)
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
      await sleep(100)
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
          id: call.callId,
          card: buildToolCard(call.name, input, output)
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

// ============================================================================
// 子代理流生产者：running 事件（reasoning / content / tool）
// ============================================================================

/** 子代理流式分组状态（按 name + causeId 区分同名子代理的多次调用） */
interface SubAgentGroupState {
  lastSentReasoning: string
  lastSentContent: string
  reasoningDelta: (tokenText: string, lastSent: string) => string | undefined
  contentDelta: (tokenText: string, lastSent: string) => string | undefined
}

export async function produceSubAgents(
  run: RuntimeStream,
  signal: AbortSignal | undefined,
  enqueue: EnqueueFn,
  markDone: MarkDoneFn,
  safeGetOutput: SafeGetOutputFn
): Promise<void> {
  const groups = new Map<string, SubAgentGroupState>()
  try {
    for await (const rec of run.subagents as AsyncIterable<SubAgentRecord>) {
      if (signal?.aborted) break
      const key = `${rec.name}:${rec.causeId ?? ''}`
      let group = groups.get(key)
      if (!group) {
        group = {
          lastSentReasoning: '',
          lastSentContent: '',
          reasoningDelta: makeDeltaComputer(),
          contentDelta: makeDeltaComputer()
        }
        groups.set(key, group)
      }

      if (rec.kind === 'sub_start') {
        // started 生命周期事件由 toolCalls 流的 task 记录发出，此处跳过
        continue
      } else if (rec.kind === 'sub_reasoning') {
        const delta = group.reasoningDelta(rec.text, group.lastSentReasoning)
        if (delta) {
          enqueue({
            subAgent: {
              name: rec.name,
              causeId: rec.causeId,
              status: 'running',
              reasoning_content: delta
            }
          })
        }
        group.lastSentReasoning = rec.text
      } else if (rec.kind === 'sub_text') {
        const delta = group.contentDelta(rec.text, group.lastSentContent)
        if (delta) {
          enqueue({
            subAgent: { name: rec.name, causeId: rec.causeId, status: 'running', content: delta }
          })
        }
        group.lastSentContent = rec.text
      } else if (rec.kind === 'sub_tool_call') {
        const call = rec.tool
        const input = call.input as Record<string, unknown>
        enqueue({
          subAgent: {
            name: rec.name,
            causeId: rec.causeId,
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
        await sleep(100)
        if (signal?.aborted) break
        const raw = await safeGetOutput(call)
        const output = typeof raw === 'string' ? raw : JSON.stringify(raw)
        enqueue({
          subAgent: {
            name: rec.name,
            causeId: rec.causeId,
            status: 'running',
            tool: {
              name: call.name,
              input,
              output,
              status: 'completed',
              id: call.callId,
              card: buildToolCard(call.name, input, output)
            }
          }
        })
      } else if (rec.kind === 'sub_end') {
        // 内容流已结束，立即发送 early completed（完整输出由 toolCalls 流的 task 记录补充）
        enqueue({
          subAgent: { name: rec.name, causeId: rec.causeId, status: 'completed' }
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
