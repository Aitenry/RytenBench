import type { ModelCapabilities, ModelMetadata } from '../types/provider'

/** metadata 的 capabilities 中可选能力项（与 models-profile.json 字段一致） */
export interface CapabilityOption {
  key: keyof ModelCapabilities
  label: string
}

/** 编辑表单中用到的能力选项 */
export const CAPABILITY_OPTIONS: CapabilityOption[] = [
  { key: 'supports_image_input', label: '视觉输入' },
  { key: 'supports_audio_input', label: '音频输入' },
  { key: 'supports_video_input', label: '视频输入' },
  { key: 'supports_image_output', label: '图像输出' },
  { key: 'supports_function_calling', label: '工具调用' },
  { key: 'supports_thinking', label: '思考/推理' },
  { key: 'supports_streaming', label: '流式输出' },
  { key: 'supports_json_mode', label: 'JSON 模式' },
  { key: 'supports_structured_output', label: '结构化输出' },
  { key: 'supports_batch', label: '批量处理' },
  { key: 'supports_fine_tuning', label: '微调' },
  { key: 'supports_embeddings', label: '嵌入能力' }
]

/** 表格行内展示的关键能力标签（仅取对功能影响最大的几项） */
export const CAPABILITY_BADGES: CapabilityOption[] = [
  { key: 'supports_image_input', label: '视觉' },
  { key: 'supports_function_calling', label: '工具' },
  { key: 'supports_thinking', label: '思考' },
  { key: 'supports_streaming', label: '流式' },
  { key: 'supports_embeddings', label: '嵌入' }
]

/** 模型类型中文标签（metadata.type） */
export const MODEL_TYPE_LABELS: Record<string, string> = {
  'text-generation': '文本生成',
  'image-generation': '图像生成',
  'audio-generation': '音频生成',
  'video-generation': '视频生成',
  embedding: '嵌入',
  rerank: '重排',
  other: '其他'
}

/** 安全读取能把 capabilities 对象；非对象（缺失/异常）返回空对象 */
export function getCapabilities(metadata: ModelMetadata | null | undefined): ModelCapabilities {
  const caps = metadata?.capabilities
  return caps && typeof caps === 'object' ? caps : {}
}

/** 是否为向量/嵌入模型：元数据声明 type=embedding 或 supports_embeddings，或以名称/模型名兜底 */
export function isEmbeddingProvider(p: {
  name?: string
  model?: string
  metadata?: ModelMetadata | Record<string, unknown> | null
}): boolean {
  const meta = p?.metadata as ModelMetadata | null | undefined
  if (meta) {
    if (typeof meta.type === 'string' && meta.type.toLowerCase() === 'embedding') return true
    if (getCapabilities(meta).supports_embeddings === true) return true
  }
  const lowered = ((p?.name ?? '') + (p?.model ?? '')).toLowerCase()
  return lowered.includes('embedding')
}

/** 工具栏/视觉等能力判断：元数据缺失时为 false（由用户自行填写元数据后生效） */
export function supportsCapability(
  metadata: ModelMetadata | Record<string, unknown> | null | undefined,
  key: keyof ModelCapabilities
): boolean {
  const caps = getCapabilities(metadata as ModelMetadata | null | undefined)
  return caps[key] === true
}

/** 模型展示名称：优先使用元数据里的 display_name（档案/用户填写），缺省回退 name */
export function getProviderDisplayName(p: {
  name?: string
  metadata?: ModelMetadata | Record<string, unknown> | null
}): string {
  const meta = p?.metadata as ModelMetadata | null | undefined
  if (meta && typeof meta.display_name === 'string' && meta.display_name.trim()) {
    return meta.display_name
  }
  return p?.name ?? ''
}
