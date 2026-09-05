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
  /** dispatched=后台任务已派发（轻量卡：仅名称+简述+会话 id，结果在顶部栏查看） */
  status: 'started' | 'running' | 'dispatched' | 'completed' | 'error'
  output?: string
  message?: string
  error?: string
  content?: string
  reasoning_content?: string
  tool?: ToolCall
  /** task 工具调用时携带的任务描述（仅由前端从 task 工具输入转换而来） */
  taskDescription?: string
  /** 后台派发（status='dispatched'）时的会话 ID（subagent-N） */
  subagentId?: string
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

/** 模型请求失败后自动重试进度（retrying 过渡块：仅当轮展示，不落库） */
export interface RetryInfoBlock {
  /** 当前第几次重试（从 1 开始，如 1/2、2/2） */
  attempt: number
  /** 本轮最多重试次数 */
  retries: number
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
    | 'retrying'
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
  /** 模型请求失败后自动重试进度（retrying 类型使用，过渡块不落库） */
  retrying?: RetryInfoBlock
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
  /** 最后收到流式 chunk 的时间戳（渲染端瞬时字段，不落库；供静默指示判定） */
  lastChunkAt?: number
}

/** 附件 */
export interface Attachment {
  dataUrl: string
  fileName: string
  isImage: boolean
}
