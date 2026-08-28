import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import vm from 'node:vm'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'
import logger from 'electron-log'
import { buildAgentGraph } from './agent'
import { invokeGraph } from './graph'
import type { SpillStore } from './spill'

/**
 * 工作流工具（workflow）— 对应 deepseek-harness 的 dsh-workflow / dsh-tool-workflow 体系
 *
 * 机制（参考 DSH，v1 主进程内执行）：
 * - 模型编写一段 JavaScript 编排脚本（纯脚本体，支持顶层 await，以 return 结束），
 *   用 agent / pipeline / parallel / phase / log / args 六个钩子做多代理 fan-out；
 * - 脚本在主进程 node:vm 沙箱执行（无 fs/网络/定时器/Node 全局），初始同步切片 5s 超时；
 * - 所有错误码都是 fatal（误用钩子/非法选项/超上限 → 整个脚本终止），
 *   而 pipeline 的 stage 抛错只丢弃该项、parallel 的 thunk 抛错解析为 null；
 * - agent() 启动一次性子代理（业务工具 + 文件工具，不含 task/goal/jobs/ask，
 *   防止递归嵌套）；有 opts.schema 时校验为对象（失败/非对象 → null）；
 * - 上限：并发（默认 4）、总代理数（默认 50）；
 * - 工具前台阻塞直至运行结束，返回 { stopReason, value, error?, agentsStarted }。
 */

/** 工作流运行结果 */
export interface WorkflowRunResult {
  stopReason: 'completed' | 'cancelled' | 'error'
  value?: unknown
  error?: string
  agentsStarted: number
}

/** 工作流工具上下文（由 Runtime 注入，复用主运行时组件） */
export interface WorkflowToolContext {
  mainModel: BaseChatModel
  resolveModel: (spec: string | undefined) => Promise<BaseChatModel | undefined>
  /** 工作流子代理工具集（业务工具 + 文件工具；不含任务/目标/提问/续接控制） */
  buildAgentTools: () => StructuredToolInterface[]
  recursionLimit: number
  spillRef?: { current?: SpillStore }
}

/** JSON Schema 子集校验（仅 DSH 允许的关键字） */
const ALLOWED_SCHEMA_KEYS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'oneOf'
])

function assertSchemaSubset(schema: Record<string, unknown>, path = 'schema'): void {
  for (const key of Object.keys(schema)) {
    if (!ALLOWED_SCHEMA_KEYS.has(key)) {
      throw new Error(
        `UNSUPPORTED_SCHEMA: ${path}.${key}（仅支持 type/properties/required/additionalProperties/items/enum/const/oneOf）`
      )
    }
  }
  const props = schema.properties
  if (props != null && typeof props === 'object') {
    for (const [key, sub] of Object.entries(props as Record<string, unknown>)) {
      assertSchemaSubset(sub as Record<string, unknown>, `${path}.properties.${key}`)
    }
  }
  if (schema.items && typeof schema.items === 'object') {
    assertSchemaSubset(schema.items as Record<string, unknown>, `${path}.items`)
  }
  for (const sub of (schema.oneOf as unknown[] | undefined) ?? []) {
    if (sub && typeof sub === 'object') {
      assertSchemaSubset(sub as Record<string, unknown>, `${path}.oneOf[]`)
    }
  }
}

function validateSubset(schema: Record<string, unknown>, value: unknown, path = 'value'): boolean {
  const type = schema.type
  if (type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
    const record = value as Record<string, unknown>
    const required = (schema.required as string[] | undefined) ?? []
    for (const key of required) {
      if (!(key in record)) return false
    }
    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>
    for (const [key, sub] of Object.entries(props)) {
      if (key in record && !validateSubset(sub, record[key], `${path}.${key}`)) return false
    }
    const additional = schema.additionalProperties
    if (additional === false) {
      for (const key of Object.keys(record)) {
        if (!(key in props)) return false
      }
    } else if (additional && typeof additional === 'object') {
      for (const [key, v] of Object.entries(record)) {
        if (key in props) continue
        if (!validateSubset(additional as Record<string, unknown>, v, `${path}.${key}`))
          return false
      }
    }
    return true
  }
  if (type === 'array') {
    if (!Array.isArray(value)) return false
    const items = schema.items
    if (items && typeof items === 'object') {
      for (let i = 0; i < value.length; i++) {
        if (!validateSubset(items as Record<string, unknown>, value[i], `${path}[${i}]`))
          return false
      }
    }
    return true
  }
  if ('const' in schema) return value === schema.const
  if (Array.isArray(schema.enum)) return (schema.enum as unknown[]).includes(value)
  if (Array.isArray(schema.oneOf)) {
    return (schema.oneOf as Array<Record<string, unknown>>).some((sub) =>
      validateSubset(sub, value, path)
    )
  }
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'null':
      return value === null
    default:
      return false
  }
}

/** 并发上限（desktop 保守值；DSH 为 min(16, CPU-2)） */
const MAX_CONCURRENT_AGENTS = 4
/** 总代理数上限 */
const DEFAULT_MAX_TOTAL_AGENTS = 50

/** 运行一次工作流脚本 */
export async function runWorkflow(
  script: string,
  meta: Record<string, unknown>,
  args: unknown,
  ctx: WorkflowToolContext,
  signal?: AbortSignal,
  maxTotalAgents = DEFAULT_MAX_TOTAL_AGENTS
): Promise<WorkflowRunResult> {
  // meta 前置校验（DSH start() 同步校验：meta 非法 → META_INVALID）
  if (!meta || typeof meta !== 'object') {
    return { stopReason: 'error', error: 'META_INVALID: meta 必须是对象', agentsStarted: 0 }
  }
  const name = (meta as { name?: unknown }).name
  if (typeof name !== 'string' || !name.trim()) {
    return {
      stopReason: 'error',
      error: 'META_INVALID: meta.name 必须是非空字符串',
      agentsStarted: 0
    }
  }
  const phases = (meta as { phases?: unknown }).phases
  if (phases != null) {
    if (
      !Array.isArray(phases) ||
      phases.some((p) => !p || typeof (p as { title?: unknown }).title !== 'string')
    ) {
      return {
        stopReason: 'error',
        error: 'META_INVALID: meta.phases 必须是 {title} 数组',
        agentsStarted: 0
      }
    }
  }

  let agentsStarted = 0
  let cancelled = false
  const onSignalAbort = (): void => {
    cancelled = true
  }
  if (signal) {
    if (signal.aborted) cancelled = true
    else signal.addEventListener('abort', onSignalAbort, { once: true })
  }

  // 并发信号量
  let active = 0
  const waiters: Array<() => void> = []
  const acquire = async (): Promise<void> => {
    while (active >= MAX_CONCURRENT_AGENTS) {
      await new Promise<void>((resolve) => waiters.push(resolve))
    }
    active++
  }
  const release = (): void => {
    active--
    waiters.shift()?.()
  }

  const checkCancelled = (): void => {
    if (cancelled) throw new Error('CANCELLED')
  }

  /** agent 钩子：启动一次性子代理，返回最终文本或校验对象 */
  const agentHook = async (prompt: string, opts?: Record<string, unknown>): Promise<unknown> => {
    checkCancelled()
    if (agentsStarted >= maxTotalAgents) {
      throw new Error(`AGENT_CAP: 代理总数超过上限（${maxTotalAgents}）`)
    }
    // 选项白名单（DSH：其余如 effort/isolation/agentType 一律拒绝杀脚本）
    if (opts) {
      const allowed = new Set(['label', 'phase', 'schema', 'model'])
      for (const key of Object.keys(opts)) {
        if (!allowed.has(key)) {
          throw new Error(
            `UNSUPPORTED_OPTION: agent 选项 "${key}" 不受支持（仅 label/phase/schema/model）`
          )
        }
      }
    }
    const schema = opts?.schema as Record<string, unknown> | undefined
    if (schema) {
      assertSchemaSubset(schema)
    }
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('agent() 需要非空的字符串 prompt')
    }

    agentsStarted++
    await acquire()
    try {
      const modelSpec = typeof opts?.model === 'string' ? (opts.model as string) : undefined
      const model = modelSpec
        ? ((await ctx.resolveModel(modelSpec)) ?? ctx.mainModel)
        : ctx.mainModel
      const tools = ctx.buildAgentTools()
      const graph = buildAgentGraph({
        model,
        tools,
        systemPrompt:
          '你是工作流中的一个独立执行单元。专注于完成交给你的单一任务，直接给出结果文本；若调用方声明了 schema，请输出符合 schema 的 JSON。不要向用户提问，不要委托他人，不要复述任务要求。',
        spill: ctx.spillRef?.current
      })
      const messages = await invokeGraph(
        graph,
        { messages: [new HumanMessage(prompt)] },
        { recursionLimit: ctx.recursionLimit, signal }
      )
      const last = messages[messages.length - 1]
      const text =
        typeof last?.content === 'string'
          ? last.content.trim()
          : Array.isArray(last?.content)
            ? (last.content as Array<{ type?: string; text?: string }>)
                .filter((c) => c.type === 'text')
                .map((c) => c.text || '')
                .join('')
                .trim()
            : ''
      if (schema) {
        try {
          const parsed = JSON.parse(text) as unknown
          return validateSubset(schema, parsed) ? parsed : null
        } catch {
          return null
        }
      }
      return text
    } catch (err) {
      if (cancelled) throw new Error('CANCELLED')
      // 子代理失败 → null（DSH：子失败/未完成 → null，调用方 .filter(Boolean)）
      logger.warn('[Workflow] agent 执行失败（返回 null）:', err)
      return null
    } finally {
      release()
    }
  }

  const hooks = {
    agent: agentHook,
    pipeline: async (
      items: unknown[],
      ...stages: Array<(prev: unknown, item: unknown, index: number) => Promise<unknown>>
    ): Promise<unknown[]> => {
      const results: unknown[] = []
      for (let i = 0; i < items.length; i++) {
        checkCancelled()
        let current: unknown
        let failed = false
        for (const stage of stages) {
          try {
            current = await stage(current, items[i], i)
          } catch {
            failed = true
            break
          }
        }
        results.push(failed ? null : current)
      }
      return results
    },
    parallel: async (thunks: Array<() => Promise<unknown>>): Promise<unknown[]> => {
      return await Promise.all(
        thunks.map(async (thunk) => {
          try {
            return await thunk()
          } catch {
            return null
          }
        })
      )
    },
    phase: (title: string): void => {
      logger.info(`[Workflow] phase: ${title}`)
    },
    log: (message: string): void => {
      logger.info(`[Workflow] ${message}`)
    },
    args
  }

  const sandbox = { ...hooks, console: undefined }
  const code = `(async () => {\n${script}\n})()`
  const context = vm.createContext(sandbox)

  try {
    const value = await vm.runInContext(code, context, { timeout: 5000 })
    signal?.removeEventListener('abort', onSignalAbort)
    return { stopReason: 'completed', value, agentsStarted }
  } catch (err) {
    signal?.removeEventListener('abort', onSignalAbort)
    const message = err instanceof Error ? err.message : String(err)
    if (cancelled || message.includes('CANCELLED')) {
      return { stopReason: 'cancelled', error: message, agentsStarted }
    }
    return { stopReason: 'error', error: message, agentsStarted }
  }
}

/** 构建工作流工具（仅注入主代理） */
export function buildWorkflowTool(ctx: WorkflowToolContext): StructuredToolInterface {
  return tool(
    async ({ script, meta, args }, config) => {
      try {
        const result = await runWorkflow(script, meta, args, ctx, config?.signal)
        return JSON.stringify(result)
      } catch (err) {
        return JSON.stringify({
          stopReason: 'error',
          error: `SCRIPT_PARSE: ${(err as Error).message}`,
          agentsStarted: 0
        })
      }
    },
    {
      name: 'workflow',
      description: `运行一个 JavaScript 编排脚本，把工作扇出给多个一次性子代理并行/流水线执行（适合批量审计、多角度研究、大规模独立任务）。

脚本契约（纯 JavaScript 函数体，支持顶层 await，以 return <值> 结束；返回值须可 JSON 序列化）：
- agent(prompt, opts?)：启动一个子代理执行到完成。无 opts.schema 时返回其最终文本；有 opts.schema（对象根 JSON Schema，仅支持 type/properties/required/additionalProperties/items/enum/const/oneOf）时返回校验后的对象。子代理失败返回 null（用 .filter(Boolean) 过滤）。opts 可选 label（展示用）/phase/schema/model（如 'provider:model'）；其它选项一律报错。
- pipeline(items, ...stages)：每个元素依次通过全部 stage（stage 签名为 (prev, item, index)），元素间无屏障；单个 stage 抛错 = 该元素变 null 并跳过其剩余 stage。
- parallel(thunks)：并发执行全部 thunk 并等待全部完成（屏障）；thunk 抛错解析为 null。
- phase(title) / log(message)：进度记录；args：工具调用的 args 原样传入。

错误语义：误用钩子（坏参数/不支持选项/超上限）会抛出并终止整个脚本；结果 JSON 为 { stopReason: 'completed'|'cancelled'|'error', value?, error?, agentsStarted }。`,
      schema: z.object({
        script: z
          .string()
          .describe('纯 JavaScript 脚本体（非 TypeScript；顶层 await 允许；以 return 结束）'),
        meta: z
          .object({
            name: z.string().describe('工作流名称（kebab-case）'),
            description: z.string().optional().describe('一句话说明'),
            whenToUse: z.string().optional().describe('使用场景说明'),
            phases: z
              .array(z.object({ title: z.string() }))
              .optional()
              .describe('阶段声明（phase(title) 匹配展示）')
          })
          .describe('工作流身份信息'),
        args: z
          .unknown()
          .optional()
          .describe('传给脚本的输入（脚本内以 args 全局变量读取，原样透传）')
      })
    }
  )
}
