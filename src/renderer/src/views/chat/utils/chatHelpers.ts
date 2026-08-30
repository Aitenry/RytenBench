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
