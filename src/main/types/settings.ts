export interface Lock {
  code: string
  view: boolean
}

export interface GraphSettings {
  maxConcurrency: number
  enableGleaning: boolean
  gleaningThreshold: number
  maxChunkSize: number
}

export interface ChatSettings {
  maxIterations: number
  /** 历史对话上下文窗口大小（轮次），0 表示不限制 */
  historyWindowSize: number
  /** 工具调用上下文窗口大小（条数），0 表示不限制 */
  toolCallWindowSize: number
}

export type ThemeMode = 'light' | 'dark' | 'auto'

export interface SystemSettings {
  ip?: Record<string, unknown>
  lock: Lock
  graph: GraphSettings
  chat: ChatSettings
  defaultModelId?: number
  defaultEmbeddingModelId?: number
  musicDirectory?: string
  theme?: ThemeMode
}
