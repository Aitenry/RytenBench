/** 思考模式：auto 跟随模型默认配置（与主进程共用同一份定义） */
import type { ThinkingMode } from '../../../shared/model-params'

export type { ThinkingMode }

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
  /** 采样温度：null = 未设置，使用供应商最佳默认值 */
  temperature: number | null
  max_tokens: number | null
  top_p: number | null
  top_k: number | null
  thinking_mode: ThinkingMode
  /** 工具调用轮数：单次对话工具调用总次数上限 */
  max_tool_rounds: number
  extra_config: Record<string, unknown> | null
  metadata: ModelMetadata | null
  is_default: boolean
  is_enabled: boolean
  /** 置顶排序值（>0 即置顶，由主进程 SQL 取 max+1）；仅供列表排序 */
  sort_order: number
  /** 是否置顶（编辑弹窗的「置顶」开关读它） */
  is_pinned: boolean
}

/** LLM 供应商输入（新建/编辑表单） */
export interface LlmProviderInput {
  name: string
  provider: string
  base_url?: string | null
  api_key?: string | null
  model: string
  /** 采样参数：留空(undefined/null) = 不下发，使用供应商最佳默认值 */
  temperature?: number | null
  max_tokens?: number | null
  top_p?: number | null
  top_k?: number | null
  thinking_mode?: ThinkingMode
  max_tool_rounds?: number
  extra_config?: Record<string, unknown> | null
  metadata?: ModelMetadata | null
  is_default?: boolean
  is_enabled?: boolean
  /** 是否置顶：排序值由主进程用 SQL 取 max+1，前端不传排序号 */
  pinned?: boolean
}

/** 拉取模型接口返回项 */
export interface FetchedModel {
  id: string
  metadata: ModelMetadata | null
}
