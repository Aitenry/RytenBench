/** 模型能力字段（与 models-profile.json 的 capabilities 结构一致） */
export interface ModelCapabilities {
  supports_text_input?: boolean
  supports_text_output?: boolean
  supports_image_input?: boolean
  supports_image_output?: boolean
  supports_audio_input?: boolean
  supports_audio_output?: boolean
  supports_video_input?: boolean
  supports_thinking?: boolean
  supports_function_calling?: boolean
  supports_streaming?: boolean
  supports_json_mode?: boolean
  supports_structured_output?: boolean
  supports_batch?: boolean
  supports_fine_tuning?: boolean
  supports_embeddings?: boolean
  reasoning_effort_levels?: string[]
  [key: string]: boolean | string[] | undefined
}

/** 模型元数据（models-profile.json 单个条目；未收录/未填写时为 null） */
export interface ModelMetadata {
  id?: string
  vendor?: string
  display_name?: string
  type?: string
  status?: string
  release_date?: string | null
  knowledge_cutoff?: string | null
  capabilities?: ModelCapabilities
  context_window?: number | null
  max_output_tokens?: number | null
  image_options?: Record<string, unknown> | null
  [key: string]: unknown
}

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
  metadata: ModelMetadata | null
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
  metadata?: ModelMetadata | null
  is_default?: boolean
  is_enabled?: boolean
  sort_order?: number
}

/** 拉取模型接口返回项 */
export interface FetchedModel {
  id: string
  metadata: ModelMetadata | null
}
