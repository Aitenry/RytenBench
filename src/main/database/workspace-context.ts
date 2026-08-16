/**
 * 全局活动工作区上下文（供 AI 工具层与 IPC 层共用）。
 * 由主进程启动时注入 provider；聊天工具运行在主进程内，
 * 通过此模块读取当前活动工作区，与 IPC 层保持一致的数据隔离。
 */
let provider: () => number = () => 0

export function setActiveWorkspaceIdProvider(fn: () => number): void {
  provider = fn
}

export function getActiveWorkspaceId(): number {
  return provider()
}
