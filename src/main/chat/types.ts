export interface ChatOptions {
  images?: string[]
  documents?: { fileName: string; filePath: string }[]
  /** 话题 ID，ChatService 内部会根据此 ID 从数据库加载历史对话 */
  topicId?: number
  /** 用于取消流式输出的 AbortSignal */
  signal?: AbortSignal
  /** 本轮来源元信息（目标系统 authority 校验用；用户消息为空缺省，自动续跑轮由驱动器注入） */
  turnMeta?: TurnMeta
}

/** 本轮来源元信息（经图 configurable 注入工具层，供目标工具做执行期权限校验） */
export interface TurnMeta {
  /** 来源：user=用户直接发起的轮次（缺省）；goal-round=目标自动续跑轮 */
  source?: 'user' | 'goal-round'
  /** goal-round 时携带的目标身份（精确匹配当前目标轮才有 complete/blocked 权威） */
  goalId?: string
  goalRevision?: number
  goalRound?: number
  /** goal-round 时的目标描述（前端横幅展示用） */
  objective?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/** 工具定制化卡片数据（deepagent 内置工具专用） */
export interface ToolCard {
  /** 文件/目录路径（read_file / write_file / edit_file / ls） */
  path?: string
  /** 搜索模式（glob / grep） */
  pattern?: string
  /** 结果数量（ls / glob / grep） */
  count?: number
  /** 执行命令（execute） */
  command?: string
}

export interface ToolCallDetail {
  name: string
  input: Record<string, unknown>
  output: string
  status?: 'preparing' | 'executing' | 'completed'
  id?: string
  /** 定制化卡片数据，仅 deepagent 内置工具设置 */
  card?: ToolCard
}

/** 每轮注入系统提示词的热记忆内容（用于前端展示「注入记忆」） */
export interface MemoryInjection {
  /** 用户画像条目（target=user） */
  user: string[]
  /** 项目记忆条目（target=memory） */
  memory: string[]
  /** 容量信息（user/memory 的 used/limit 展示串，如 "512/4096"） */
  usage: { user: string; memory: string }
}

export interface StructuredMessage {
  tool?: ToolCallDetail
  content?: string
  reasoning_content?: string
  /** 智能体活动事件 */
  subAgent?: SubAgentEvent
  /** 本轮注入的热记忆内容（Mnemon 启用且热记忆非空时，由流开头下发） */
  memoryInjected?: MemoryInjection
}

/** IPC 发送的流式 chunk（StructuredMessage + 主进程注入的 topicId） */
export interface StreamChunk extends StructuredMessage {
  __topicId?: number
  /** 目标自动续跑轮的起始标记（流首 chunk；前端据此挂载新的用户消息与助手占位） */
  goalRound?: { round: number; objective: string }
}

/** 智能体定义 */
export interface SubAgentConfig {
  /** 唯一标识符，主代理通过 task() 工具调用时使用 */
  name: string
  /** 中文显示名（可选） */
  rename?: string
  /** 描述智能体的功能，主代理用于决定何时委托 */
  description: string
  /** 智能体的系统提示词 */
  systemPrompt: string
  /** 智能体可用的工具名称列表（从主代理工具集中选取） */
  tools?: string[]
  /** 可选：覆盖主代理的模型，格式 'provider:model' */
  model?: string
  /** 可选：可用的技能 ID 列表（从技能目录中选取），留空则无技能 */
  skills?: string[]
}

/** 智能体活动事件 */
export interface SubAgentEvent {
  /** 智能体名称 */
  name: string
  /** 派遣此智能体的 task 工具调用唯一 ID（用于区分同名智能体的多次调用） */
  causeId?: string
  /** 事件类型 */
  status: 'started' | 'running' | 'completed' | 'error'
  /** 智能体的输出内容（completed 时） */
  output?: string
  /** 智能体执行过程中的消息 */
  message?: string
  /** 错误信息 */
  error?: string
  /** 智能体流式输出的文本增量 */
  content?: string
  /** 智能体流式输出的推理内容增量 */
  reasoning_content?: string
  /** 智能体的工具调用 */
  tool?: ToolCallDetail
  /** task 工具调用时携带的任务描述（frontend / persistence 从 task 工具输入转换） */
  taskDescription?: string
}

/** Available tool definition for the frontend dropdown */
export interface ToolInfo {
  name: string
  label: string
  description: string
  icon: string
  color: string
}
