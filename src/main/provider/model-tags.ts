/**
 * 拉取模型的能力标签推导（provider-fetch-models 使用）。
 * 标签值与渲染层 ModelSettings 的 MODEL_TAGS 保持一致。
 */
export type ModelTag = 'chat' | 'embedding' | 'vision' | 'thinking' | 'tools' | 'other'

export interface FetchedModelInfo {
  id: string
  tags: ModelTag[]
}

/**
 * 根据模型 ID 推导能力标签：
 * - embedding：向量模型（与其它标签互斥）
 * - other：图像生成/语音/重排等非对话模型（拉取列表中默认不勾选）
 * - vision：视觉多模态
 * - thinking：推理/思考模型
 * - tools：支持工具调用（保守名单）
 * - chat：其余默认视为对话模型
 */
export function deriveModelTags(id: string): ModelTag[] {
  const raw = id.toLowerCase().trim()
  // Ollama 名称带标签后缀（如 qwen2.5:7b、llama3.2:latest），规则用基础名匹配
  const base = raw.replace(/:[^:]*$/, '')

  // 向量/嵌入模型
  if (/(embedding|embed-|bge[-_/]|^e5-|nomic-embed|gte-|jina-embed|mxbai)/.test(raw)) {
    return ['embedding']
  }

  // 非对话模型（图像生成/语音/审核/重排等）
  if (
    /(dall-e|gpt-image|tts|whisper|audio|speech|rerank|moderation|stable-diffusion|sdxl|\bflux\b|imagen|image-?generation|veo\b|sora)/.test(
      raw
    )
  ) {
    return ['other']
  }

  const tags: ModelTag[] = ['chat']

  // 视觉多模态
  if (
    /(vision|\bvl\b|llava|pixtral|internvl|minicpm-v|moondream|qwen\d*(\.\d+)?-vl|glm-4v|gpt-4o|gpt-4\.1|deepseek-vl|claude-3|claude-4|gemini|gemma3|(^|-)o1($|-)|(^|-)o3($|-)|(^|-)o4($|-))/.test(
      base
    )
  ) {
    tags.push('vision')
  }

  // 推理/思考模型
  if (
    /((^|-)o1($|-)|(^|-)o3($|-)|(^|-)o4($|-)|deepseek-reasoner|\br1\b|qwq|thinking|reasoning|k2-thinking)/.test(
      base
    )
  ) {
    tags.push('thinking')
  }

  // 工具调用能力（保守名单）
  if (
    /(^gpt-4|^gpt-3\.5-turbo|^o1|^o3|^o4|deepseek-chat|deepseek-v|qwen2\.5|qwen3|glm-4(?!v)|claude-3|claude-4|gemini|mistral-large|mistral-small|mistral-medium|kimi|^grok)/.test(
      base
    )
  ) {
    tags.push('tools')
  }

  return tags
}

// ============================================================================
// 接口元数据解析（优先）：各供应商 API 返回的能力字段 → 标签；信息不足时返回 null，
// 由调用方回退到 deriveModelTags 名称推导。
// ============================================================================

type RawModel = Record<string, unknown>

/** Ollama /api/tags：capabilities: ["completion","vision","tools","embedding"] */
export function tagsFromOllamaCapabilities(model: RawModel): ModelTag[] | null {
  const caps = model.capabilities
  if (!Array.isArray(caps)) return null
  const set = new Set(caps.map((c) => String(c).toLowerCase()))
  if (set.has('embedding')) return ['embedding']
  const tags: ModelTag[] = ['chat']
  if (set.has('vision')) tags.push('vision')
  if (set.has('tools')) tags.push('tools')
  return tags
}

/** OpenRouter /models：architecture.modality / input_modalities / reasoning */
export function tagsFromOpenRouterArchitecture(model: RawModel): ModelTag[] | null {
  const arch = model.architecture
  if (!arch || typeof arch !== 'object') return null
  const a = arch as Record<string, unknown>
  const modalities: string[] = []
  if (typeof a.modality === 'string') modalities.push(a.modality.toLowerCase())
  for (const key of ['input_modalities', 'output_modalities']) {
    if (Array.isArray(a[key])) {
      for (const v of a[key] as unknown[]) modalities.push(String(v).toLowerCase())
    }
  }
  if (modalities.length === 0) return null
  const tags: ModelTag[] = ['chat']
  if (modalities.some((m) => m.includes('image'))) tags.push('vision')
  if (modalities.some((m) => m.includes('audio'))) tags.push('vision')
  if (a.reasoning === true || (typeof a.reasoning === 'string' && a.reasoning.length > 0)) {
    tags.push('thinking')
  }
  return tags
}

/** Mistral /models：capabilities.vision / capabilities.function_calling */
export function tagsFromMistralCapabilities(model: RawModel): ModelTag[] | null {
  const caps = model.capabilities
  if (!caps || typeof caps !== 'object') return null
  const c = caps as Record<string, unknown>
  if (typeof c.vision !== 'boolean' && typeof c.function_calling !== 'boolean') return null
  const tags: ModelTag[] = ['chat']
  if (c.vision === true) tags.push('vision')
  if (c.function_calling === true) tags.push('tools')
  return tags
}

/**
 * Google Gemini /v1beta/models：supportedGenerationMethods 判定模型能力。
 * 返回模型的 id（去 models/ 前缀）。
 */
export function geminiModelId(model: RawModel): string {
  const name = typeof model.name === 'string' ? model.name : ''
  return name.replace(/^models\//, '')
}

export function tagsFromGeminiModel(model: RawModel, id: string): ModelTag[] | null {
  const methods = model.supportedGenerationMethods
  if (!Array.isArray(methods)) return null
  const set = new Set(methods.map((m) => String(m).toLowerCase()))
  if (set.has('embedcontent')) return ['embedding']
  // 图像生成 / 语音等非对话模型
  if (set.has('generateimage') || set.has('generatespeech') || set.has('recognizespeech')) {
    return ['other']
  }
  const tags: ModelTag[] = ['chat']
  const desc =
    (typeof model.description === 'string' ? model.description.toLowerCase() : '') +
    ' ' +
    id.toLowerCase()
  if (desc.includes('thinking') || desc.includes('reasoning')) tags.push('thinking')
  if (desc.includes('multimodal') || desc.includes('vision')) tags.push('vision')
  // Gemini 系列均支持函数调用
  tags.push('tools')
  return tags
}
