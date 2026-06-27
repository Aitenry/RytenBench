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
}

export interface SystemSettings {
  ip?: Record<string, unknown>
  lock: Lock
  graph: GraphSettings
  chat: ChatSettings
  defaultModelId?: number
}
