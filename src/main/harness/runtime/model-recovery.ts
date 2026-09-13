import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import logger from 'electron-log'
import { mainFormat, mainMessages } from '../../i18n'
import { questionService } from './ask'
import type { AskOption, AskQuestion } from './ask'

/**
 * 模型调用共享恢复逻辑（正文 model 节点与早期对话压缩摘要共用）
 *
 * - 自动重试：单次 LLM 调用失败（504/网络/服务端错误）原地重试 MODEL_RETRY_LIMIT 次；
 * - 换模型兜底：重试仍失败且允许询问时，挂起并向用户弹出「换模型继续」选择
 *   （kind='model-recovery'，由前端 ModelRecoveryModal 处理），用户选好新模型后
 *   在**原调用位置**用新模型继续（不重跑工具/不重发问题）；
 * - 仅用户取消（signal aborted）不重试；目标自动续跑轮（goal-round）不弹换模型。
 */

/** 模型单次请求失败时的自动重试上限与重试间隔 */
export const MODEL_RETRY_LIMIT = 2
export const MODEL_RETRY_DELAY_MS = 800

/** 换模型询问所需的上下文（模型调用方能提供的身份信息） */
export interface ModelRecoveryContext {
  topicId: number
  /** 调用来源：'user'（缺省）/ 'goal-round'（自动续跑轮，不询问换模型） */
  turnSource?: string
  /** 是否允许弹窗询问（子代理等场景禁止） */
  askEnabled?: boolean
  signal?: AbortSignal
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 向用户询问是否换模型继续，返回新模型实例；用户放弃返回 null。
 * 失败信息（kind='model-recovery'）经 ask 挂起通道广播，由前端专用
 * ModelRecoveryModal 展示；答案回写后在此解析为已启用供应商。
 * 信号中止（用户停止）时抛 AskAbortedError。
 */
export async function askUserToSwitchModel(
  ctx: ModelRecoveryContext,
  lastError: Error
): Promise<BaseChatModel | null> {
  const { getEnabledProviders } = await import('../../database/mapper/provider')
  const providers = await getEnabledProviders()
  // 界面文案按当前语言取一次：放弃项既要展示又要参与回填比较，
  // 必须用**同一次**取值，否则弹窗期间切语言会导致比较不上
  const m = mainMessages().modelRecovery
  const seen = new Set<string>()
  const options: AskOption[] = []
  for (const p of providers) {
    let label = `${p.name} · ${p.model}`
    // 同名（name/model 相同）但供应商/端点不同的行：追加 provider 类型保证选项值唯一
    if (seen.has(label)) label = `${label}（${p.provider}）`
    seen.add(label)
    options.push({
      label,
      description: mainFormat(m.providerDescription, {
        provider: `${p.provider}${p.base_url ? ` · ${p.base_url}` : ''}`
      }),
      group: p.provider
    })
  }
  options.push({
    label: m.abandonLabel,
    description: m.abandonDescription
  })
  const questions: AskQuestion[] = [
    {
      id: 'switch-model',
      kind: 'model-recovery',
      header: m.header,
      question: mainFormat(m.question, { count: MODEL_RETRY_LIMIT }),
      error: lastError.message,
      abandonLabel: m.abandonLabel,
      options
    }
  ]
  const answer = await questionService.ask(ctx.topicId, questions, ctx.signal)
  const selected = answer.answers?.[0]?.selected?.[0] ?? ''
  if (!selected || selected === m.abandonLabel) return null
  // 答案解析（前端专用弹窗查询同一数据源后按 provider id 提交；兼容按 label 提交的旧路径）
  let providerId: number | undefined
  const selectedId = Number(selected)
  if (Number.isInteger(selectedId) && selectedId > 0) {
    providerId = providers.some((p) => p.id === selectedId) ? selectedId : undefined
  }
  if (providerId == null) {
    for (const p of providers) {
      const base = `${p.name} · ${p.model}`
      if (selected === base || selected === `${base}（${p.provider}）`) {
        providerId = p.id
        break
      }
    }
  }
  if (providerId == null) {
    logger.warn(
      `[ModelRecovery] 用户提交的模型选择无法匹配任何供应商（selected=${selected}），按放弃处理`
    )
    return null
  }
  const { getProviderService } = await import('../../provider/service')
  const newModel = await getProviderService().createModel(providerId)
  logger.info(`[ModelRecovery] 用户已选择切换模型（providerId=${providerId}），在原位置继续执行`)
  return newModel
}
