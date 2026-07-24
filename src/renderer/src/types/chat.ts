/** 工具调用 */
export interface ToolCall {
  name: string
  input: object
  output: string
  status?: 'preparing' | 'executing' | 'completed'
  id?: string
}

/** 消息块 */
export interface MessageBlock {
  type: 'text' | 'tool' | 'reasoning' | 'image' | 'document'
  text?: string
  tool?: ToolCall
  reasoning?: string
  image_url?: string
  fileName?: string
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
