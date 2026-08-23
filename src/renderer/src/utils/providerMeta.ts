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
  'text-generation': '对话',
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

/* ======== 供应商品牌色（唯一来源，图标/字母徽章共用；改色只改这里） ======== */

/**
 * provider 协议标识 → 官方品牌色（亮色主题用）。
 * 已验证来源：UIColours 官方品牌页 / 2025 官方品牌重塑新闻 / 厂商官网主色。
 */
export const PROVIDER_BRAND_COLORS: Record<string, string> = {
  // —— 黑白单色品牌：官方早已弃用彩色，暗色主题下自动换浅色（见 MONOCHROME_PROVIDERS） ——
  // OpenAI：2025 品牌重塑后为黑白单色（旧绿 #10a37f 已废弃）
  openai: '#1e1f22',
  // xAI (Grok)：官方 Near Black #1E1F22 / Warm White #F9F8F7（UIColours）
  xai: '#1e1f22',
  // Ollama：黑色羊驼标
  ollama: '#1e1f22',
  // OpenRouter：2025 包豪斯品牌焕新为黑白几何标识
  openrouter: '#1e1f22',
  // —— 彩色品牌（UIColours 官方值） ——
  deepseek: '#4d6bfe', // DeepSeek Blue
  mistral: '#ff7000', // Mistral 官方橙（旧 #ff9900 偏黄）
  anthropic: '#d97757', // Anthropic Burnt Orange
  'google-genai': '#4285f4', // Google Blue
  'google-vertexai': '#4285f4',
  groq: '#f55036', // Groq 橙红
  perplexity: '#20808d', // Perplexity 青绿
  // —— 国内厂商：近似官方主色的常用值（如有出入可在此微调） ——
  minimax: '#4e28f5',
  moonshot: '#2d5bff', // Kimi 星光蓝紫（原误用 OpenAI 旧绿）
  zhipu: '#3859ff',
  aliyun: '#ff6a00',
  qianfan: '#2932e1',
  volcengine: '#3370ff',
  tencent: '#006cff',
  siliconflow: '#5d2cff',
  together: '#7700ff',
  lmstudio: '#4d4d4d'
}

/** 官方为黑白单色的品牌：暗色主题下用浅色以保证可见性 */
const MONOCHROME_PROVIDERS = new Set(['openai', 'xai', 'ollama', 'openrouter'])

/** 暗色主题下的品牌色（黑白单色品牌换暖白，与编辑部暖纸+墨体系一致） */
const PROVIDER_DARK_COLORS: Record<string, string> = {
  openai: '#f9f8f7',
  xai: '#f9f8f7',
  ollama: '#e4e4e7',
  openrouter: '#f9f8f7'
}

/**
 * 供应商图标/徽章品牌色：亮色取官方色，黑白单色品牌在暗色下换浅色。
 * 未收录的协议返回 undefined，调用方自行降级。
 */
export function getProviderColor(
  providerType: string | undefined,
  isDark: boolean
): string | undefined {
  if (!providerType) return undefined
  if (isDark && MONOCHROME_PROVIDERS.has(providerType)) {
    return PROVIDER_DARK_COLORS[providerType]
  }
  return PROVIDER_BRAND_COLORS[providerType]
}

/** 供应商无图标时的字母 monogram：连字符/下划线/驼峰分词，多词各取词首字母，单词取前两字母（大写） */
export function getProviderMonogram(providerType: string): string {
  if (!providerType) return '?'
  const tokens = providerType
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => /[a-zA-Z]/.test(t))
  if (tokens.length === 0) return providerType.slice(0, 1).toUpperCase()
  if (tokens.length === 1) {
    // 数字开头的词（如 '123ai'）取首个字母簇，避免 '12' 式哑字
    const word = tokens[0]
    const letterCluster = word.match(/[a-zA-Z]+/)
    const cluster = letterCluster && letterCluster.index ? letterCluster[0] : word
    return cluster.slice(0, 2).toUpperCase()
  }
  return (tokens[0][0] + tokens[1][0]).toUpperCase()
}
