/**
 * 思考模式（thinking）参数适配 —— 只负责「把统一设置翻译成各家参数」。
 *
 * 「哪些协议支持哪种参数」的判定在 shared/model-params（设置界面提示与主进程注入同源），
 * 这里只做参数组装：
 * - Anthropic（含自定义端点的 Anthropic 兼容协议）：thinking.type = enabled/disabled
 *   （enabled 必须带 budget_tokens，且要小于 max_tokens）
 * - Ollama：think = true/false
 * - Google Gemini / Vertex：thinkingConfig.thinkingBudget（-1 动态预算 / 0 关闭）
 * - DeepSeek / 智谱 GLM / 火山方舟：thinking.type = enabled/disabled
 * - OpenRouter：reasoning.enabled = true/false
 * - 阿里云百炼 / 硅基流动 / Moonshot / 腾讯混元：enable_thinking = true/false
 * - 其余（OpenAI / xAI / Groq / Mistral / Bedrock / Cloudflare / LM Studio…）：
 *   未适配，一律不注入——宁可不生效，也不往请求体里塞对方不认识的字段导致 400
 */

import { resolveThinkingFamily, type ThinkingMode } from '../../shared/model-params'

/** Anthropic 扩展思考的预算下限（Anthropic 要求 >= 1024） */
const ANTHROPIC_MIN_BUDGET = 1024
/** Anthropic 扩展思考的预算上限（不设更高，避免吃掉输出预算） */
const ANTHROPIC_MAX_BUDGET = 4096

export interface ThinkingParamsInput {
  /** 供应商协议标识（大小写不敏感） */
  provider: string
  /** 自定义端点是否走 Anthropic 兼容协议 */
  anthropicFormat?: boolean
  mode: ThinkingMode
  /** 当前生效的输出上限（max_tokens 列，或模型档案的输出上限） */
  maxTokens: number | null
}

export interface ThinkingParams {
  /** 直接并入 LangChain 构造参数的字段（Anthropic / Ollama / Google 用类字段接收） */
  fields?: Record<string, unknown>
  /** 需要并入请求体的额外参数（OpenAI 兼容族走 modelKwargs） */
  modelKwargs?: Record<string, unknown>
}

/** Anthropic 扩展思考预算：卡在 [1024, 4096] 且必须小于 max_tokens */
function anthropicBudget(maxTokens: number | null): number {
  const cap = maxTokens ?? ANTHROPIC_MAX_BUDGET + ANTHROPIC_MIN_BUDGET
  return Math.max(ANTHROPIC_MIN_BUDGET, Math.min(ANTHROPIC_MAX_BUDGET, cap - ANTHROPIC_MIN_BUDGET))
}

/**
 * 组装思考模式参数。auto（跟随模型默认配置）与未适配的供应商都返回 null —— 不注入任何字段。
 */
export function buildThinkingParams(input: ThinkingParamsInput): ThinkingParams | null {
  const { mode, provider, anthropicFormat = false, maxTokens } = input
  if (mode === 'auto') return null

  const on = mode === 'on'

  switch (resolveThinkingFamily(provider, anthropicFormat)) {
    case 'anthropic': {
      if (!on) return { fields: { thinking: { type: 'disabled' } } }
      const budget = anthropicBudget(maxTokens)
      // 开启思考必须留出比预算更大的输出额度，否则接口直接拒绝
      const fields: Record<string, unknown> = {
        thinking: { type: 'enabled', budget_tokens: budget }
      }
      if (maxTokens == null || maxTokens <= budget) {
        fields.maxTokens = budget + ANTHROPIC_MIN_BUDGET
      }
      return { fields }
    }

    case 'ollama':
      return { fields: { think: on } }

    case 'google':
      return {
        fields: {
          thinkingConfig: on ? { thinkingBudget: -1, includeThoughts: true } : { thinkingBudget: 0 }
        }
      }

    case 'thinking-type':
      return { modelKwargs: { thinking: { type: on ? 'enabled' : 'disabled' } } }

    case 'openrouter':
      return { modelKwargs: { reasoning: { enabled: on } } }

    case 'enable-thinking':
      return { modelKwargs: { enable_thinking: on } }

    default:
      return null
  }
}
