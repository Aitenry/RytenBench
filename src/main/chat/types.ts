export interface ChatOptions {
  deepThinking?: boolean
  smartSearch?: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ToolCallDetail {
  name: string
  input: Record<string, unknown>
  output: string
}

export interface StructuredMessage {
  tool?: ToolCallDetail
  content?: string
}
