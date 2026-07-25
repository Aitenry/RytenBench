/** 工具调用 */
export interface ToolCall {
  name: string
  input: object
  output: string
  status?: 'preparing' | 'executing' | 'completed'
  id?: string
}

/** 子代理活动事件 */
export interface SubAgentEvent {
  name: string
  /** 派遣此子代理的 task 工具调用唯一 ID */
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

/** 消息块 */
export interface MessageBlock {
  type: 'text' | 'tool' | 'reasoning' | 'image' | 'document' | 'subagent'
  text?: string
  tool?: ToolCall
  reasoning?: string
  image_url?: string
  fileName?: string
  subagent?: SubAgentEvent
  /** 子代理嵌套的子块（仅 subagent 类型使用，用于流式构建子代理的 text/tool/reasoning） */
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
