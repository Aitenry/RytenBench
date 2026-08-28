import {
  Annotation,
  CompiledStateGraph,
  END,
  START,
  StateGraph,
  type LangGraphRunnableConfig,
  type OverwriteValue
} from '@langchain/langgraph'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, BaseMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import logger from 'electron-log'
import type { RuntimeRecord, ToolCallRecord } from './types'
import { formatOutput } from './fs-backend'
import type { SpillStore } from './spill'

/**
 * LangGraph Agent 图 — 替代 deepagents createDeepAgent
 *
 * 图结构（显式可审计）：
 *   START → model（LLM，绑定工具）→ 有工具调用 ? tools（自定义工具节点）→ model
 *                                       └ 无工具调用 → END
 *
 * 工具节点通过闭包共享的 RecordQueue 推送 tool_call 记录（output 为 Promise），
 * 驱动前端 executing → completed 状态；AbortSignal 在中途检查并抛错终止。
 */

/** 图状态：消息列表（追加式 reducer） */
export const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => []
  })
})

export type AgentStateType = typeof AgentState

/** 工具节点上下文字段：在子代理图中标记记录归属 */
export interface SubAgentToolContext {
  name: string
  causeId: string
}

/** 可变队列引用：图在请求级构建，队列在 stream 时创建并注入 */
export interface QueueRef {
  current?: {
    push(record: RuntimeRecord): void
  }
}

export interface BuildGraphOptions {
  model: BaseChatModel
  tools: StructuredToolInterface[]
  systemPrompt: string
  /** 记录队列引用（流式时注入 current；非流式 invoke 为 undefined） */
  queue?: QueueRef
  /** 子代理上下文（子代理图专用；主代理图不设置） */
  subagentCtx?: SubAgentToolContext
  /** 工具结果溢出存储（超长输出保存为文件 + 返回预览/定位符；未配置则保持截断行为） */
  spill?: SpillStore
}

/** 安全绑定工具：不支持工具调用的模型退化为纯对话（组件降级而非报错） */
function bindToolsSafely(model: BaseChatModel, tools: StructuredToolInterface[]): BaseChatModel {
  if (tools.length === 0) return model
  try {
    const bound = model.bindTools?.(tools)
    return bound ? (bound as BaseChatModel) : model
  } catch (err) {
    logger.warn('[Agent] 模型不支持工具调用，退化为纯对话模式:', err)
    return model
  }
}

/** 轻量消息块接口：流式 chunk（AIMessageChunk）的兼容形状 */
export interface StreamMessageLike {
  content?: unknown
  additional_kwargs?: Record<string, unknown>
  tool_call_chunks?: Array<{ index?: number; name?: string; id?: string; args?: string }>
  tool_calls?: Array<{ name?: string; id?: string; args?: unknown }>
  /** chunk 类型（'ai' / 'tool' / ...），用于过滤非模型消息 */
  _getType?: () => string
}

/** 将模型 chunk 转换为消息流记录（推理/文本/工具块） */
export function pushMessageRecords(
  chunk: StreamMessageLike,
  queue: { push(record: RuntimeRecord): void },
  seenIndexes: Set<number>,
  subagentCtx?: SubAgentToolContext
): void {
  // 只处理 AI 消息 chunk：messages 模式下工具结果（ToolMessage）等也会以 chunk 流出，需过滤
  const chunkType = chunk._getType?.()
  if (chunkType && chunkType !== 'ai') return

  const kwargs = (chunk.additional_kwargs ?? {}) as Record<string, unknown>
  const reasoning = kwargs.reasoning_content ?? kwargs.reasoning
  if (typeof reasoning === 'string' && reasoning) {
    pushRecord(queue, { kind: 'reasoning', text: reasoning }, subagentCtx)
  }

  // 文本内容（字符串或多模态内容块中的文本部分）
  const content = chunk.content
  if (typeof content === 'string' && content) {
    pushRecord(queue, { kind: 'text', text: content }, subagentCtx)
  } else if (Array.isArray(content)) {
    const text = (content as Array<{ type?: string; text?: string }>)
      .filter((c) => c && c.type === 'text')
      .map((c) => c.text || '')
      .join('')
    if (text) {
      pushRecord(queue, { kind: 'text', text }, subagentCtx)
    }
  }

  // 工具调用增量（流式）
  const toolCallChunks = chunk.tool_call_chunks
  if (Array.isArray(toolCallChunks)) {
    for (const tc of toolCallChunks) {
      if (tc.index == null) continue
      if (!seenIndexes.has(tc.index)) {
        seenIndexes.add(tc.index)
        pushRecord(
          queue,
          { kind: 'tool_block_start', index: tc.index, name: tc.name || 'tool', id: tc.id },
          subagentCtx
        )
      } else if (tc.args) {
        pushRecord(queue, { kind: 'tool_args', index: tc.index }, subagentCtx)
      }
    }
  }

  // 完整工具调用（非流式形态，部分 provider 一次给全）。
  // 仅当尚未通过增量块登记任何工具时处理，避免与 tool_call_chunks 重复。
  const fullCalls = chunk.tool_calls
  if (Array.isArray(fullCalls) && fullCalls.length > 0 && seenIndexes.size === 0) {
    for (const tc of fullCalls) {
      if (!tc.name) continue
      const index = seenIndexes.size
      seenIndexes.add(index)
      pushRecord(queue, { kind: 'tool_block_start', index, name: tc.name, id: tc.id }, subagentCtx)
    }
  }
}

/** 按上下文推送记录（主代理直推；子代理包一层 sub_* 记录） */
function pushRecord(
  queue: { push(record: RuntimeRecord): void } | ((record: RuntimeRecord) => void),
  record: RuntimeRecord,
  subagentCtx?: SubAgentToolContext
): void {
  const doPush = typeof queue === 'function' ? queue : (r: RuntimeRecord) => queue.push(r)
  if (!subagentCtx) {
    doPush(record)
    return
  }
  const { name, causeId } = subagentCtx
  if (record.kind === 'reasoning') {
    doPush({ kind: 'sub_reasoning', name, causeId, text: record.text })
  } else if (record.kind === 'text') {
    doPush({ kind: 'sub_text', name, causeId, text: record.text })
  } else if (record.kind === 'tool_call') {
    doPush({ kind: 'sub_tool_call', name, causeId, tool: record })
  }
  // tool_block_start / tool_args 为展示性事件，子代理内部不转发（保持简洁）
}

/**
 * 工程内部工具调用总次数护栏（不暴露为设置项）：
 * 工具调用次数不设用户可见上限（体验上「无限」），由本护栏 + 防循环护栏兜底，
 * 用户可随时通过「停止」按钮终止。200 次 ≈ 100+ 轮模型往返，正常任务远达不到，
 * 仅拦截真正失控的循环（如换着参数反复调用）；接近上限时先温和引导收尾，避免
 * 合法长任务被生硬截断。
 */
export const MAX_TOOL_CALLS = 200

/** 渐进提醒阈值：累计调用达到该次数时引导模型收尾一次（不拦截，仅提示一次） */
export const SOFT_TOOL_CALL_WARN = 150

/** 工具调用去重键：名称 + 规范化参数（用于防循环护栏） */
function toolCallKey(name: string, args: unknown): string {
  let argsText = ''
  try {
    argsText = JSON.stringify(args ?? {})
  } catch {
    argsText = String(args ?? '')
  }
  return `${name}:${argsText}`
}

/**
 * 溢出策略豁免工具集：文件读取/搜索工具自带输出边界（read_file 20K + offset/limit、
 * grep 100 条匹配上限等），不再二次溢出——否则「读溢出文件 → 再次溢出」会无限套娃
 * （参考 dsh-spill-policy 对 read 类工具的豁免）。
 */
const SPILL_EXEMPT_TOOLS = new Set(['read_file', 'grep', 'ls', 'glob'])

/** 创建工具执行器：执行工具调用并推送生命周期记录 */
function createToolRunner(
  tools: StructuredToolInterface[],
  queue?: QueueRef,
  subagentCtx?: SubAgentToolContext,
  spill?: SpillStore
) {
  const toolsByName = new Map(tools.map((t) => [t.name, t]))

  // 防循环护栏状态（每次图执行为一个实例，无跨请求泄漏）：
  // - 同一 (工具, 参数) 累计调用 >= 3 次，或连续重复 >= 2 次 → 拦截并提示模型收尾，
  //   避免模型卡死在重复调用中烧光递归预算（GraphRecursionError）。
  const callCounts = new Map<string, number>()
  let prevCallKey: string | undefined
  // 总调用次数护栏：累计达到 SOFT_TOOL_CALL_WARN 时温和提醒一次；超过 MAX_TOOL_CALLS 后一律拦截
  let totalCalls = 0
  let warnedSoft = false

  return async (
    state: { messages: BaseMessage[] },
    config: LangGraphRunnableConfig
  ): Promise<{ messages: ToolMessage[] }> => {
    const lastMessage = state.messages[state.messages.length - 1]
    const toolCalls = (lastMessage as AIMessage).tool_calls
    if (!toolCalls || toolCalls.length === 0) {
      return { messages: [] }
    }

    const push = queue?.current
    const outputs: ToolMessage[] = []
    for (const call of toolCalls) {
      if (config.signal?.aborted) {
        const err = new Error('Tool call aborted')
        err.name = 'AbortError'
        throw err
      }

      // 兜底：部分 provider 可能缺 name / id
      const name = call.name ?? 'tool'
      const callId = call.id ?? `call_${Math.random().toString(36).slice(2, 10)}`
      const tool = toolsByName.get(name)

      // 渐进提醒：接近上限时引导收尾一次（不拦截后续调用，避免合法长任务被生硬截断）
      totalCalls++
      if (!warnedSoft && totalCalls >= SOFT_TOOL_CALL_WARN) {
        warnedSoft = true
        const msg = `本次对话已执行 ${totalCalls} 次工具调用，任务较长。如非必要，请尽快基于已有信息给出最终回答。`
        outputs.push(new ToolMessage({ content: msg, tool_call_id: callId }))
        if (push) {
          const record: ToolCallRecord = {
            kind: 'tool_call',
            name,
            input: call.args,
            callId,
            output: Promise.resolve(msg)
          }
          pushRecord(push, record, subagentCtx)
        }
        continue
      }

      // 总次数护栏：累计调用超过工程上限后一律拦截，指示模型直接回答
      if (totalCalls > MAX_TOOL_CALLS) {
        const msg = `本次对话的工具调用总数已达到 ${MAX_TOOL_CALLS} 次（工程安全上限）。请立即停止调用工具，直接基于已有信息给出最终回答。`
        outputs.push(new ToolMessage({ content: msg, tool_call_id: callId }))
        if (push) {
          const record: ToolCallRecord = {
            kind: 'tool_call',
            name,
            input: call.args,
            callId,
            output: Promise.resolve(msg)
          }
          pushRecord(push, record, subagentCtx)
        }
        continue
      }

      // 防循环护栏：识别重复调用（相同工具 + 完全相同参数），不执行并指示模型收尾
      const key = toolCallKey(name, call.args)
      const count = (callCounts.get(key) ?? 0) + 1
      callCounts.set(key, count)
      const isLoop = key === prevCallKey ? count >= 2 : count >= 3
      prevCallKey = key
      if (isLoop) {
        const msg = `工具 "${name}" 已被重复调用 ${count} 次且参数完全相同。请停止重复调用，直接基于已有信息给出最终回答。`
        outputs.push(new ToolMessage({ content: msg, tool_call_id: callId }))
        if (push) {
          const record: ToolCallRecord = {
            kind: 'tool_call',
            name,
            input: call.args,
            callId,
            output: Promise.resolve(msg)
          }
          pushRecord(push, record, subagentCtx)
        }
        continue
      }

      if (!tool) {
        const msg = `工具 "${name}" 不存在或未启用。可用工具：${[...toolsByName.keys()].join(', ')}`
        outputs.push(new ToolMessage({ content: msg, tool_call_id: callId }))
        if (push) {
          const record: ToolCallRecord = {
            kind: 'tool_call',
            name,
            input: call.args,
            callId,
            output: Promise.resolve(msg)
          }
          pushRecord(push, record, subagentCtx)
        }
        continue
      }

      // 工具执行异步进行；output Promise 驱动前端 executing → completed
      const outputPromise = (async () => {
        try {
          const result = await tool.invoke(call.args, {
            ...config,
            configurable: { ...(config.configurable ?? {}), toolCallId: callId }
          })
          // 溢出策略：超长输出保存为溢出文件，模型拿到「预览 + 定位符」而非硬截断。
          // 文件读取/搜索工具自带边界，豁免溢出（防 read 循环）；spill 未配置时保持原有截断行为
          const formatted = formatOutput(result)
          return spill && !SPILL_EXEMPT_TOOLS.has(name) ? spill.trySpill(formatted) : formatted
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          logger.warn(`[Agent] 工具 ${name} 执行失败:`, err)
          return `工具执行失败: ${message}`
        }
      })()

      if (push) {
        const record: ToolCallRecord = {
          kind: 'tool_call',
          name,
          input: call.args,
          callId,
          output: outputPromise
        }
        pushRecord(push, record, subagentCtx)
      }

      const output = await outputPromise
      outputs.push(new ToolMessage({ content: output, tool_call_id: callId }))
    }

    return { messages: outputs }
  }
}

/** 构建编译后的 Agent 图 */
export function buildAgentGraph(
  options: BuildGraphOptions
): CompiledStateGraph<
  { messages: BaseMessage[] },
  { messages?: BaseMessage[] | OverwriteValue<BaseMessage[]> | undefined },
  'model' | 'tools' | typeof START
> {
  const { model, tools, systemPrompt } = options
  const queue = options.queue
  const subagentCtx = options.subagentCtx
  const spill = options.spill

  const modelWithTools = bindToolsSafely(model, tools)
  const runTools = createToolRunner(tools, queue, subagentCtx, spill)

  async function callModel(
    state: { messages: BaseMessage[] },
    config: LangGraphRunnableConfig
  ): Promise<{ messages: BaseMessage[] }> {
    const response = await modelWithTools.invoke(
      [new SystemMessage(systemPrompt), ...state.messages],
      config
    )
    return { messages: [response] }
  }

  async function callTools(
    state: { messages: BaseMessage[] },
    config: LangGraphRunnableConfig
  ): Promise<{ messages: ToolMessage[] }> {
    return await runTools(state, config)
  }

  function shouldContinue(state: { messages: BaseMessage[] }): string {
    const last = state.messages[state.messages.length - 1]
    if (last && (last as AIMessage).tool_calls && (last as AIMessage).tool_calls!.length > 0) {
      return 'tools'
    }
    return END
  }

  return new StateGraph(AgentState)
    .addNode('model', callModel)
    .addNode('tools', callTools)
    .addEdge(START, 'model')
    .addConditionalEdges('model', shouldContinue)
    .addEdge('tools', 'model')
    .compile()
}

/** 构造图输入 */
export function buildGraphInput(messages: BaseMessage[]): { messages: BaseMessage[] } {
  return { messages: [...messages] }
}

/** 编译后 Agent 图的类型（避免直接依赖 LangGraph 泛型参数） */
export type CompiledAgentGraph = ReturnType<typeof buildAgentGraph>
