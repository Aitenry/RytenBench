/** 工具定制化卡片数据 */
export interface ToolCard {
  path?: string
  pattern?: string
  count?: number
  command?: string
}

/** 工具调用 */
export interface ToolCall {
  name: string
  input: object
  output: string
  status?: 'preparing' | 'executing' | 'completed'
  id?: string
  card?: ToolCard
}

/** 智能体活动事件 */
export interface SubAgentEvent {
  name: string
  /** 派遣此智能体的 task 工具调用唯一 ID */
  causeId?: string
  status: 'started' | 'running' | 'completed' | 'error'
  output?: string
  message?: string
  error?: string
  content?: string
  reasoning_content?: string
  tool?: ToolCall
  /** task 工具调用时携带的任务描述（仅由前端从 task 工具输入转换而来） */
  taskDescription?: string
}

/** 记忆注入块数据（主进程 MemoryInjection 透传） */
export interface MemoryInjectionBlock {
  /** 用户画像条目（USER） */
  user: string[]
  /** 项目记忆条目（MEMORY） */
  memory: string[]
  /** 容量信息展示串 */
  usage: { user: string; memory: string }
}

/** 早期对话摘要压缩块数据（主进程 HistoryCompaction 透传） */
export interface HistoryCompactionBlock {
  /** 被压缩为 checkpoint 摘要的早期对话条数 */
  compressedCount: number
  /** 保持原样的最近对话条数 */
  retainedCount: number
  /** 压缩边界（被压缩段最后一条对话的 ID） */
  boundaryId: number
}

/** 消息块 */
export interface MessageBlock {
  type:
    | 'text'
    | 'tool'
    | 'reasoning'
    | 'image'
    | 'document'
    | 'subAgent'
    | 'memoryInjected'
    | 'historyCompacting'
    | 'historyCompacted'
    | 'goalRound'
  text?: string
  tool?: ToolCall
  reasoning?: string
  image_url?: string
  fileName?: string
  subAgent?: SubAgentEvent
  /** 本轮注入的热记忆内容（memoryInjected 类型使用） */
  memory?: MemoryInjectionBlock
  /** 本轮早期对话摘要压缩信息（historyCompacted 类型使用） */
  compaction?: HistoryCompactionBlock
  /** 目标自动续跑轮次号（goalRound 类型使用） */
  round?: number
  /** 智能体嵌套的子块（仅 subAgent 类型使用，用于流式构建智能体的 text/tool/reasoning） */
  children?: MessageBlock[]
}

/** 聊天消息 */
export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  blocks: MessageBlock[]
  timestamp: number
  toolCalls?: ToolCall[]
  loading?: boolean
  reasoning_content?: string
}

/** 附件 */
export interface Attachment {
  dataUrl: string
  fileName: string
  isImage: boolean
}
