export interface ChatOptions {
  tools?: string[]
  images?: string[]
  documents?: { fileName: string; filePath: string }[]
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
