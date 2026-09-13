/**
 * 模型请求参数预设（主进程与渲染进程共用，避免两处各自维护一份魔法数字）。
 *
 * - 渲染层：设置页「高级配置」里的上下文窗口快速填充胶囊、采样参数范围校验；
 * - 主进程：拉取模型列表时，对 models-profile 未收录的模型取每档最低值兜底。
 *
 * 注意：本文件不得引入 electron / node / react 依赖，两侧构建都要能直接打包。
 */

/** 上下文窗口（Token）预设 —— 输入侧（模型能读入的最大上下文） */
export const CONTEXT_WINDOW_PRESETS = [128_000, 256_000, 512_000, 1_000_000] as const

/** 上下文窗口（Token）预设 —— 输出侧（模型单次最大输出，同时作为请求生成上限） */
export const MAX_OUTPUT_PRESETS = [4_000, 16_000, 32_000, 128_000] as const

/** 未收录模型的兜底上下文窗口：取预设档位中的最低值 */
export const FALLBACK_CONTEXT_WINDOW: number = CONTEXT_WINDOW_PRESETS[0]

/** 未收录模型的兜底最大输出：取预设档位中的最低值 */
export const FALLBACK_MAX_OUTPUT_TOKENS: number = MAX_OUTPUT_PRESETS[0]

/** 未收录模型的兜底类型：按语言（对话）模型处理 */
export const FALLBACK_MODEL_TYPE = 'text-generation'

/**
 * 未收录模型的兜底能力：语言模型 + 流式 + 可调用工具；
 * 视觉输入默认关闭（未收录的模型无从判断，交由用户在「支持图片输入」里显式开启）。
 */
export const FALLBACK_MODEL_CAPABILITIES: Record<string, boolean> = {
  supports_text_input: true,
  supports_text_output: true,
  supports_streaming: true,
  supports_function_calling: true,
  supports_image_input: false
}

/** 单次对话工具调用总次数上限的默认值（可在模型「高级配置」里逐模型覆盖） */
export const DEFAULT_MAX_TOOL_ROUNDS = 500

/** 思考模式：auto = 跟随模型默认配置（不注入任何参数） */
export type ThinkingMode = 'auto' | 'on' | 'off'

/** 思考模式下拉/单选选项 */
export const THINKING_MODE_OPTIONS: ReadonlyArray<{ value: ThinkingMode; label: string }> = [
  { value: 'auto', label: '跟随模型默认配置' },
  { value: 'on', label: '开启' },
  { value: 'off', label: '关闭' }
]

/** 采样参数：留空即「使用最佳配置」，范围与占位提示一一对应 */
export const SAMPLING_PARAM_SPECS = [
  {
    name: 'temperature',
    label: 'Temperature',
    min: 0,
    max: 2,
    step: 0.1,
    placeholder: '留空使用最佳配置，或输入 0 ~ 2 之间的数值'
  },
  {
    name: 'top_p',
    label: 'Top P',
    min: 0,
    max: 1,
    step: 0.05,
    placeholder: '留空使用最佳配置，或输入 0 ~ 1 之间的数值'
  },
  {
    name: 'top_k',
    label: 'Top K',
    min: 1,
    max: 100,
    step: 1,
    placeholder: '留空使用最佳配置，或输入 1 ~ 100 之间的数值'
  }
] as const

/** 采样参数名（与 SAMPLING_PARAM_SPECS 同源） */
export type SamplingParamName = (typeof SAMPLING_PARAM_SPECS)[number]['name']

/**
 * 接受 Top K 的供应商协议：其余协议的 SDK / 接口没有该参数，
 * 设置值只保存不下发（设置界面据此给出提示，主进程据此决定是否注入）。
 */
export const TOP_K_PROVIDERS: readonly string[] = [
  'anthropic',
  'ollama',
  'google',
  'google-genai',
  'google-vertexai',
  'vertexai'
]

/**
 * 思考模式适配族：各家「开/关思考」的参数名并不统一，按协议族映射；
 * 'none' 表示该协议未适配，选择开启/关闭都不会往请求里塞参数。
 */
export type ThinkingParamFamily =
  'anthropic' | 'ollama' | 'google' | 'thinking-type' | 'openrouter' | 'enable-thinking' | 'none'

/** 协议 → 思考参数族 */
export const THINKING_FAMILY_BY_PROVIDER: Readonly<Record<string, ThinkingParamFamily>> = {
  anthropic: 'anthropic',
  ollama: 'ollama',
  google: 'google',
  'google-genai': 'google',
  'google-vertexai': 'google',
  vertexai: 'google',
  deepseek: 'thinking-type',
  zhipu: 'thinking-type',
  volcengine: 'thinking-type',
  openrouter: 'openrouter',
  aliyun: 'enable-thinking',
  qwen: 'enable-thinking',
  siliconflow: 'enable-thinking',
  moonshot: 'enable-thinking',
  tencent: 'enable-thinking'
}

/** 解析协议对应的思考参数族（自定义端点按兼容协议判定；入参大小写不敏感） */
export function resolveThinkingFamily(
  provider: string,
  anthropicFormat = false
): ThinkingParamFamily {
  const key = (provider ?? '').toLowerCase()
  if (key === 'custom') return anthropicFormat ? 'anthropic' : 'none'
  return THINKING_FAMILY_BY_PROVIDER[key] ?? 'none'
}

/** 该协议是否支持控制思考模式（设置界面提示 + 主进程注入共用同一判断） */
export function supportsThinkingControl(provider: string, anthropicFormat = false): boolean {
  return resolveThinkingFamily(provider, anthropicFormat) !== 'none'
}
