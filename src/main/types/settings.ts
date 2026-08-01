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
  /** 技能（Skills）存储目录，空/未设置表示不启用；目录下每个含 SKILL.md 的子目录即一个技能 */
  skillsPath?: string
  /** 启用的技能 ID 列表，undefined 表示全部启用，[] 表示全部禁用 */
  enabledSkills?: string[]
  /** AI 工作区目录，挂载为 FilesystemBackend 的根目录（虚拟 /）；未设置时回退到 skillsPath */
  workspacePath?: string
  /** 当前活跃的工作区 ID，用于按工作区筛选话题 */
  activeWorkspaceId?: number
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
  /** 天气缓存数据 */
  weatherData?: Record<string, unknown>
  /** 天气自动刷新间隔（分钟），默认 60 */
  weatherRefreshInterval?: number
  /** 上次天气数据获取时间戳 */
  weatherLastFetched?: number
}
