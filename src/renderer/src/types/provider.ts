/** LLM 供应商配置 */
export interface LlmProviderConfig {
  id: number
  name: string
  provider: string
  base_url: string | null
  api_key: string | null
  model: string
  temperature: number
  max_tokens: number | null
  extra_config: Record<string, unknown> | null
  tags: string[] | null
  is_default: boolean
  is_enabled: boolean
  sort_order: number
}

/** LLM 供应商输入（新建/编辑表单） */
export interface LlmProviderInput {
  name: string
  provider: string
  base_url?: string | null
  api_key?: string | null
  model: string
  temperature?: number
  max_tokens?: number | null
  extra_config?: Record<string, unknown> | null
  tags?: string[] | null
  is_default?: boolean
  is_enabled?: boolean
  sort_order?: number
}
