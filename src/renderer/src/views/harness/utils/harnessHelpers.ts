import type { TFunction } from 'i18next'
import type { ToolCall, MessageBlock } from '@renderer/types/harness'
import type { StreamChunk } from '../../../../../main/harness/types'

/** 判断工具块与工具事件是否为同一次调用。
 *  优先按 callId 精确匹配；content-block-start 的 id 与 run.toolCalls 的 callId 来源不同
 *  可能不一致，此时按名称+状态回退：同名且未完成的块视为同一次调用 */
export const isSameToolCall = (
  blockTool: ToolCall,
  incoming: { id?: string; name: string }
): boolean => {
  if (incoming.id) {
    if (blockTool.id === incoming.id) return true
    // preparing 阶段还没有 id，按名称匹配
    if (!blockTool.id && blockTool.status === 'preparing' && blockTool.name === incoming.name)
      return true
    // ID 不同但名称相同且块未完成：content-block-start 与 call.callId 来源不同，回退按名称
    return !!(
      blockTool.id &&
      blockTool.status &&
      blockTool.status !== 'completed' &&
      blockTool.name === incoming.name
    )
  }
  return blockTool.name === incoming.name || blockTool.name === ''
}

/**
 * 计算文本增量：兼容 provider 下发完整文本而非增量的场景。
 * - 若 incoming 是 previous 的扩展，仅返回新增后缀；
 * - 否则按增量处理，返回 incoming 本身。
 *
 * 注意：不再做「previous.endsWith(incoming) → ''」的后缀去重——主进程已按形态去重，
 * 增量形态下后缀相同往往是模型真实输出的重复内容（如表格相邻相同行、"好的，好的，…"），
 * 误判为重复发送会导致真实内容被丢弃，且后续增量全部错位。
 */
export const computeTextDelta = (incoming: string, previous: string): string => {
  if (incoming.startsWith(previous) && incoming.length > previous.length) {
    return incoming.slice(previous.length)
  }
  return incoming
}

/**
 * 将新块追加到数组末尾；只做追加，不根据智能体状态做重排。
 * 合并/去重由调用方负责，确保最终顺序严格等于事件流顺序。
 */
export const pushBlock = (blocks: MessageBlock[], block: MessageBlock): void => {
  blocks.push(block)
}

/**
 * 工具进行中/完成态标签（与 AssistantMessage 渲染共用，测试断言同源）：
 * - preparing：模型已吐出工具名、正在生成参数（阶段二「参数构建中」）
 * - executing：系统正在执行参数
 * - 其余：静态工具名
 * 非组件函数：译文由调用方传入 t（hook 只能在组件/自定义 Hook 内调用）
 */
export const getToolStatusLabel = (
  t: TFunction,
  toolName: string,
  phase: 'preparing' | 'executing' | undefined
): string => {
  if (phase === 'preparing') return t('harness.helpers.toolPreparing', { name: toolName })
  if (phase === 'executing') return t('harness.helpers.toolExecuting', { name: toolName })
  return toolName
}

/**
 * 占位名兜底：部分 provider 首个工具块不携带工具名（以占位名 'tool' 登记）。
 * executing 未按名称匹配到 preparing 块时，并入最近的占位块并改名为真实工具名，
 * 避免「tool · 参数构建中…」幽灵块与真实工具块并存。返回下标，未找到返回 -1。
 */
export const findPlaceholderPreparingTool = (blocks: MessageBlock[]): number => {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]
    if (b.type === 'tool' && b.tool?.status === 'preparing' && b.tool.name === 'tool') return i
  }
  return -1
}

/**
 * 流式静默窗口阈值：已有可见输出、loading 中、超过该时长无任何新 chunk 时，
 * 视为「模型仍在生成但流内无事件」（推理型模型生成大参数期间 SSE 静默的典型表现），
 * 由 UI 显示「正在生成…」光泽指示行（诚实不冒充工具名）。
 */
export const STREAM_SILENCE_MS = 2500

/** 流式静默指示判定（纯逻辑，测试脚本与渲染同源） */
export const shouldShowSilenceIndicator = (args: {
  loading: boolean
  /** 已有任何可见输出（正文/推理/工具块/子代理块等） */
  hasStartedContent: boolean
  now: number
  /** 最后收到 chunk 的时间戳（缺省用消息创建时间） */
  lastChunkAt: number
}): boolean => {
  if (!args.loading || !args.hasStartedContent) return false
  return args.now - args.lastChunkAt >= STREAM_SILENCE_MS
}

/**
 * chunk 是否「只带正文」/「只带思考」：任何其它载荷（工具、子代理、记忆注入、压缩、重试、
 * 错误、目标轮标记）都算边界，不能并进同一段文本增量里。
 */
const isPureTextChunk = (chunk: StreamChunk): boolean =>
  Boolean(chunk.content) &&
  !chunk.tool &&
  !chunk.reasoning_content &&
  !chunk.subAgent &&
  !chunk.memoryInjected &&
  !chunk.historyCompacted &&
  !chunk.historyCompacting &&
  !chunk.retrying &&
  !chunk.streamError &&
  !chunk.goalRound

const isPureReasoningChunk = (chunk: StreamChunk): boolean =>
  Boolean(chunk.reasoning_content) &&
  !chunk.content &&
  !chunk.tool &&
  !chunk.subAgent &&
  !chunk.memoryInjected &&
  !chunk.historyCompacted &&
  !chunk.historyCompacting &&
  !chunk.retrying &&
  !chunk.streamError &&
  !chunk.goalRound

/**
 * 单条助手消息内的「任务分段」——供消息内容按任务折叠使用。
 *
 * 背景：一条长回复里工具卡/思考段可以累积到几百块，而渲染开销与**同时挂载的块数**成正比
 * （仿真台实测：375 块 253~305KB/次刷入，80 块 77KB/次）。按任务折叠后，折起的任务整组
 * 不渲染，开销随可见块数下降。
 *
 * 归属规则（块与任务在存储层没有关联，只能从流里推导）：
 * - `write_todos` 的工具块是**分段边界**：它带着当时的完整清单快照；
 * - 快照里标为 `in_progress` 的那一项，就是**紧随其后**那批块所属的任务（模型先开任务再干活）；
 * - 快照里没有 in_progress（例如最后那次「全部完成」的收尾写入）时**不开新段**，
 *   后续块并入当前段，避免出现一个没有意义的空任务头；
 * - 首个 write_todos 之前的块（记忆注入卡、收尾前的正文等）归属 `task: null` 段，不显示任务头。
 */
export interface TaskSegment {
  /** 稳定 key：任务名 + 该任务第几次出现（同名任务被重新开始时不会串） */
  key: string
  /** 任务名；null = 不属于任何任务（头部内容 / 未规划的块） */
  task: string | null
  /** 该任务在快照里的状态；null 段为 null */
  status: 'completed' | 'in_progress' | 'pending' | null
  /** 段内块在合并后块数组里的下标（保持原顺序） */
  blockIndices: number[]
  /** 段内 write_todos 块的下标：正文里不再渲染（改由折叠头的「清单」按需展开） */
  writeIndices: number[]
  /** 段内**最后一次** write_todos 快照：点开「清单」时显示的内容 */
  snapshot: { content: string; status: string }[]
}

/** 取 write_todos 快照里的清单项（非 write_todos 块返回 null） */
const todoSnapshotOf = (block: MessageBlock): { content: string; status: string }[] | null => {
  if (block.type !== 'tool' || block.tool?.name !== 'write_todos') return null
  const todos = (
    block.tool.input as { todos?: { content?: string; status?: string }[] } | undefined
  )?.todos
  if (!Array.isArray(todos)) return null
  return todos.map((t) => ({ content: String(t?.content ?? ''), status: String(t?.status ?? '') }))
}

/** 取出 write_todos 快照里「正在进行的任务」 */
const inProgressTaskOf = (block: MessageBlock): string | null => {
  const todos = todoSnapshotOf(block)
  if (!todos) return null
  return todos.find((t) => t.status === 'in_progress')?.content ?? null
}

/** 把块序列切成任务段（纯函数：输入块数组，输出段划分，不改动入参） */
export function buildTaskSegments(blocks: MessageBlock[]): TaskSegment[] {
  const segments: TaskSegment[] = []
  const seen = new Map<string, number>()
  const fresh = (extra: Partial<TaskSegment>): TaskSegment => ({
    key: 'segment-head',
    task: null,
    status: null,
    blockIndices: [],
    writeIndices: [],
    snapshot: [],
    ...extra
  })
  let current = fresh({})

  for (let i = 0; i < blocks.length; i += 1) {
    const snapshot = todoSnapshotOf(blocks[i])
    const started = inProgressTaskOf(blocks[i])
    if (started) {
      // 已有内容的段先收口（空段不产出，避免连续 write_todos 造出空任务头）
      if (current.blockIndices.length > 0) segments.push(current)
      const nth = (seen.get(started) ?? 0) + 1
      seen.set(started, nth)
      current = fresh({ key: `segment-${nth}-${started}`, task: started, status: 'in_progress' })
    }
    current.blockIndices.push(i)
    if (snapshot) {
      current.writeIndices.push(i)
      current.snapshot = snapshot
    }
  }
  if (current.blockIndices.length > 0) segments.push(current)

  // 任务状态按「最后一个块是否仍在该任务名下」推断：段结束后若出现了新的 write_todos，
  // 说明该任务已收尾（快照里它不再是 in_progress）——这里用「后面还有别的段」来判定
  return segments.map((segment, index) => {
    if (!segment.task) return segment
    const isLast = index === segments.length - 1
    return { ...segment, status: isLast ? segment.status : 'completed' }
  })
}

/**
 * 合批内合并「累积形态」的同类增量（正文 / 思考各自成段）。
 *
 * 背景（2026-09-18 渲染进程内存实测）：合批只减少了 React commit 次数，逐 chunk 应用时
 * 每一步仍要做 `(已累积文本) + 增量`——累积形态的 provider 下这是 O(L) 的整块复制，
 * 一条几十万字符的回复配两万条增量 = O(L²) 的瞬时分配（实测 workingSet 从 534MB 涨到
 * 5991MB，长时间目标轮次下必然 OOM）。累积形态里「一批的最后一条」本身即这批的全量结果，
 * 用它代表整段：下游 computeTextDelta 仍按原规则算出本批增量，分配量降到每批一次。
 *
 * 只合并能确认是累积形态的段（末条以首条开头且更长）。增量形态（每条只带新增片段）合并
 * 会与 computeTextDelta 的累积判定语义冲突，一律原样保留。
 */
export function coalesceChunks(batch: StreamChunk[]): StreamChunk[] {
  const out: StreamChunk[] = []
  let i = 0
  while (i < batch.length) {
    const head = batch[i]
    const kind: 'content' | 'reasoning_content' | null = isPureTextChunk(head)
      ? 'content'
      : isPureReasoningChunk(head)
        ? 'reasoning_content'
        : null

    if (!kind) {
      out.push(head)
      i += 1
      continue
    }

    let j = i + 1
    while (
      j < batch.length &&
      (kind === 'content' ? isPureTextChunk(batch[j]) : isPureReasoningChunk(batch[j]))
    ) {
      j += 1
    }

    const run = batch.slice(i, j)
    if (run.length > 1) {
      const first = String(run[0][kind] ?? '')
      const last = String(run[run.length - 1][kind] ?? '')
      if (last.length > first.length && last.startsWith(first)) {
        // 累积形态：末条即全量，整段收敛成一条
        out.push({ ...run[run.length - 1] })
        i = j
        continue
      }
    }

    // 单条 / 增量形态：保持逐条，语义与合批前完全一致
    out.push(...run)
    i = j
  }
  return out
}
