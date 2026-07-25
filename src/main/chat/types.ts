export interface ChatOptions {
  tools?: string[]
  images?: string[]
  documents?: { fileName: string; filePath: string }[]
  /** 话题 ID，ChatService 内部会根据此 ID 从数据库加载历史对话 */
  topicId?: number
  /** 用于取消流式输出的 AbortSignal */
  signal?: AbortSignal
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ToolCallDetail {
  name: string
  input: Record<string, unknown>
  output: string
  status?: 'preparing' | 'executing' | 'completed'
  id?: string
}

export interface StructuredMessage {
  tool?: ToolCallDetail
  content?: string
  reasoning_content?: string
  /** 子代理活动事件 */
  subagent?: SubAgentEvent
}

/** 子代理定义 */
export interface SubAgentConfig {
  /** 唯一标识符，主代理通过 task() 工具调用时使用 */
  name: string
  /** 描述子代理的功能，主代理用于决定何时委托 */
  description: string
  /** 子代理的系统提示词 */
  systemPrompt: string
  /** 子代理可用的工具名称列表（从主代理工具集中选取） */
  tools?: string[]
  /** 可选：覆盖主代理的模型，格式 'provider:model' */
  model?: string
}

/** 子代理活动事件 */
export interface SubAgentEvent {
  /** 子代理名称 */
  name: string
  /** 派遣此子代理的 task 工具调用唯一 ID（用于区分同名子代理的多次调用） */
  causeId?: string
  /** 事件类型 */
  status: 'started' | 'running' | 'completed' | 'error'
  /** 子代理的输出内容（completed 时） */
  output?: string
  /** 子代理执行过程中的消息 */
  message?: string
  /** 错误信息 */
  error?: string
  /** 子代理流式输出的文本增量 */
  content?: string
  /** 子代理流式输出的推理内容增量 */
  reasoning_content?: string
  /** 子代理的工具调用 */
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
