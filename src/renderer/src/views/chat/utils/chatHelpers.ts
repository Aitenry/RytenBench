import type { ToolCall, MessageBlock } from '@renderer/types/chat'

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
 */
export const getToolStatusLabel = (
  toolName: string,
  phase: 'preparing' | 'executing' | undefined
): string => {
  if (phase === 'preparing') return `${toolName} · 参数构建中…`
  if (phase === 'executing') return `${toolName} · 执行中…`
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
