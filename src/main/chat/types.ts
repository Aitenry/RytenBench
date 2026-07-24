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
}

/** Available tool definition for the frontend dropdown */
export interface ToolInfo {
  name: string
  label: string
  description: string
  icon: string
  color: string
}
