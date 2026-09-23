import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import logger from 'electron-log'
import { mainFormat, mainMessages } from '../../i18n'
import { questionService } from './ask'
import type { AskOption, AskQuestion } from './ask'

/**
 * 模型调用共享恢复逻辑（正文 model 节点与早期对话压缩摘要共用）
 *
 * - **失败分类**：先判断这次失败是否值得重试。鉴权失败、模型/接口不存在、请求被拒、
 *   上下文超长、以及「模型不支持图片输入」这类**永久性**错误一律不重试，直接把原因报给用户
 *   （2026-09-23：此前不看错误内容一律重试 2 次，模型不可用时表现为「报了错还在一直重试」）；
 * - **自动重试**：只有瞬时错误（限流 / 5xx / 网络 / 网关超时）才原地重试，上限随错误类型变化
 *   （默认 MODEL_RETRY_LIMIT 次；网关超时见 MODEL_GATEWAY_FAST_FAIL_MS）；
 * - **换模型兜底**：瞬时错误重试耗尽且允许询问时，挂起并向用户弹出「换模型继续」选择
 *   （kind='model-recovery'，由前端 ModelRecoveryModal 处理），用户选好新模型后
 *   在**原调用位置**用新模型继续（不重跑工具/不重发问题）；
 * - 仅用户取消（signal aborted）不重试；目标自动续跑轮（goal-round）不弹换模型。
 *
 * 重试预算由本模块独占：供应商 SDK 自带的隐式重试已在 provider/service.ts 关掉
 * （maxRetries: 0），否则「第 1/2 次」背后其实是最多 3 个 HTTP 请求，永久性错误也会被重发多遍。
 */

/** 可重试错误的自动重试上限与重试间隔 */
export const MODEL_RETRY_LIMIT = 2
export const MODEL_RETRY_DELAY_MS = 800
/**
 * 网关超时（504/524）的补偿重试门槛：失败耗时超过该值就不再重试。
 * 代理读超时通常是「等到超时窗口才失败」（如 120 秒），重试等于再等一整个窗口，
 * 除非这次是秒失败（网关瞬时抽风），否则直接报错更诚实。
 */
export const MODEL_GATEWAY_FAST_FAIL_MS = 10_000

/** 换模型询问所需的上下文（模型调用方能提供的身份信息） */
export interface ModelRecoveryContext {
  topicId: number
  /** 调用来源：'user'（缺省）/ 'goal-round'（自动续跑轮，不询问换模型） */
  turnSource?: string
  /** 是否允许弹窗询问（子代理等场景禁止；缺省允许） */
  askEnabled?: boolean
  signal?: AbortSignal
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** 失败分类：决定「要不要重试」以及给用户看的原因 */
export type ModelErrorKind =
  | 'aborted'
  | 'image-unsupported'
  | 'auth'
  | 'not-found'
  | 'bad-request'
  | 'context-overflow'
  | 'gateway-timeout'
  | 'rate-limit'
  | 'server'
  | 'network'
  | 'unknown'

/** 分类结果（raw 保留供应商原文，日志与失败文案都要用） */
export interface ModelErrorInfo {
  kind: ModelErrorKind
  /** 能从错误对象或报文里解析出的 HTTP 状态码 */
  status?: number
  /**
   * 瞬时失败（限流 / 服务端错误 / 网络 / 网关超时）：值得恢复——先按预算原地重试，
   * 预算用尽还可以问用户要不要换模型继续。
   * 永久性失败（图片不被支持 / 鉴权 / 模型不存在 / 请求被拒 / 上下文超长）为 false：
   * 重发同一个请求不会变好，直接报错，不弹窗。
   */
  transient: boolean
  /** 本次失败允许的重试次数（永久性错误 0；网关超时等满超时窗口时也是 0） */
  retryLimit: number
  /** 本次失败耗时（网关超时据此决定要不要补偿重试） */
  elapsedMs: number
  raw: Error
}

/** 图片/视觉不支持：模型侧（llama.cpp 的 mmproj 提示等）与本项目模型档案都认这几句 */
const IMAGE_UNSUPPORTED_PATTERNS: RegExp[] = [
  /image input is not supported/i,
  /mmproj/i,
  /does not support (image|images|vision|multimodal)/i,
  /(image|vision|multimodal)[^.]{0,24}not (supported|enabled|available)/i,
  /unsupported (content|message) type/i
]
/** 上下文超长：压缩兜底也救不回来的那种（重试必然再失败） */
const CONTEXT_OVERFLOW_PATTERNS: RegExp[] = [
  /context (length|window)/i,
  /maximum context/i,
  /prompt is too long/i,
  /too many tokens/i,
  /exceed(s|ed)?[^.]{0,24}(context|token)/i,
  /reduce the length/i
]
const AUTH_PATTERNS: RegExp[] = [
  /invalid api key/i,
  /incorrect api key/i,
  /invalid_api_key/i,
  /authentication fail/i,
  /unauthorized/i,
  /permission denied/i,
  /invalid credentials/i
]
const NOT_FOUND_PATTERNS: RegExp[] = [
  /model[^.]{0,32}not found/i,
  /no such model/i,
  /unknown model/i,
  /model[^.]{0,32}does not exist/i,
  /无(此|该)模型/
]
const GATEWAY_TIMEOUT_PATTERNS: RegExp[] = [
  /proxy read timeout/i,
  /origin web server did not return/i,
  /gateway time-?out/i,
  /upstream (request )?time-?out/i
]
const NETWORK_PATTERNS: RegExp[] = [
  /fetch failed/i,
  /econnrefused/i,
  /econnreset/i,
  /econnaborted/i,
  /etimedout/i,
  /enotfound/i,
  /eai_again/i,
  /socket hang up/i,
  /network error/i,
  /connection (refused|closed|error)/i
]

const matches = (patterns: RegExp[], text: string): boolean =>
  patterns.some((pattern) => pattern.test(text))

/** 取 HTTP 状态码：错误对象上的字段优先，其次从报文里找 `status_code=500` / `HTTP 500` / 独立的三位码 */
function extractHttpStatus(error: Error, message: string): number | undefined {
  const carrier = error as unknown as {
    status?: unknown
    statusCode?: unknown
    response?: { status?: unknown }
    cause?: { status?: unknown; statusCode?: unknown }
  }
  const candidates = [
    carrier.status,
    carrier.statusCode,
    carrier.response?.status,
    carrier.cause?.status,
    carrier.cause?.statusCode
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && candidate >= 100 && candidate < 600) return candidate
  }
  const fromMessage =
    /status[\s_-]?code[\s=:]+(\d{3})/i.exec(message) ??
    /\bHTTP[\s:=]+(\d{3})\b/i.exec(message) ??
    /\b([45]\d{2})\b/.exec(message)
  return fromMessage ? Number(fromMessage[1]) : undefined
}

/**
 * 分类一次模型请求失败（纯函数，只读错误对象与报文）。
 * 判定顺序：取消 → 报文里的永久性原因 → 状态码 → 网络特征 → 归为未知（按可重试处理，保留旧行为）。
 */
export function classifyModelError(error: Error, elapsedMs = 0): ModelErrorInfo {
  const message = error.message || String(error)
  const base = { elapsedMs, raw: error }
  if (error.name === 'AbortError' || (error as { code?: unknown }).code === 'ABORT_ERR') {
    return { ...base, kind: 'aborted', transient: false, retryLimit: 0 }
  }

  const status = extractHttpStatus(error, message)
  const info = (kind: ModelErrorKind, transient: boolean, retryLimit: number): ModelErrorInfo => ({
    ...base,
    kind,
    status,
    transient,
    retryLimit
  })

  // 报文优先：同样是 500，一句「image input is not supported」就是永久性错误，
  // 而裸 500 才是值得重试的服务端抖动
  if (matches(IMAGE_UNSUPPORTED_PATTERNS, message)) return info('image-unsupported', false, 0)
  if (matches(CONTEXT_OVERFLOW_PATTERNS, message)) return info('context-overflow', false, 0)
  if (status === 401 || status === 403 || matches(AUTH_PATTERNS, message)) {
    return info('auth', false, 0)
  }
  if (status === 404 || matches(NOT_FOUND_PATTERNS, message)) return info('not-found', false, 0)
  if (
    status === 408 ||
    status === 504 ||
    status === 524 ||
    matches(GATEWAY_TIMEOUT_PATTERNS, message)
  ) {
    const retryLimit = elapsedMs < MODEL_GATEWAY_FAST_FAIL_MS ? 1 : 0
    return info('gateway-timeout', true, retryLimit)
  }
  if (status === 429) return info('rate-limit', true, MODEL_RETRY_LIMIT)
  if (status === 400 || (status != null && status >= 405 && status < 500)) {
    // 其余 4xx 是「请求本身有问题」，重发同一个请求不会变好
    return info('bad-request', false, 0)
  }
  if (status != null && status >= 500) return info('server', true, MODEL_RETRY_LIMIT)
  if (matches(NETWORK_PATTERNS, message)) return info('network', true, MODEL_RETRY_LIMIT)
  return info('unknown', true, MODEL_RETRY_LIMIT)
}

/** 分类后的收尾说明（拼在供应商原文之前，解释「为什么停了」） */
function describeFailure(info: ModelErrorInfo, attempts: number): string {
  const m = mainMessages().modelFailure
  // 状态码可能来自报文解析也可能根本没有：统一在这里拼成「（HTTP 500）」整段，
  // 免得文案里留下空的括号
  const status = info.status != null ? `（HTTP ${info.status}）` : ''
  switch (info.kind) {
    case 'image-unsupported':
      return m.imageUnsupported
    case 'auth':
      return mainFormat(m.auth, { status })
    case 'not-found':
      return mainFormat(m.notFound, { status })
    case 'bad-request':
      return mainFormat(m.badRequest, { status })
    case 'context-overflow':
      return m.contextOverflow
    case 'gateway-timeout':
      return mainFormat(m.gatewayTimeout, {
        status,
        seconds: Math.max(1, Math.round(info.elapsedMs / 1000))
      })
    case 'rate-limit':
      return mainFormat(m.rateLimit, { count: attempts })
    case 'server':
      return mainFormat(m.server, { count: attempts })
    case 'network':
      return mainFormat(m.network, { count: attempts })
    default:
      return m.other
  }
}

/** 收尾错误：message 是「分类说明：供应商原文」，kind/status 供上层判断 */
export class ModelRequestError extends Error {
  readonly kind: ModelErrorKind
  readonly status?: number

  constructor(info: ModelErrorInfo, attempts: number) {
    super(
      mainFormat(mainMessages().modelFailure.withReason, {
        summary: describeFailure(info, attempts),
        reason: info.raw.message
      })
    )
    this.name = 'ModelRequestError'
    this.kind = info.kind
    this.status = info.status
    this.cause = info.raw
  }
}

/** 一次带恢复语义的模型调用 */
export interface ModelCallRecovery<T> {
  /** 发起一次调用：重试时按同一份消息/参数重发（不重跑工具、不重放副作用由调用方保证） */
  call: () => Promise<T>
  ctx: ModelRecoveryContext
  /** 日志前缀，如 '[Agent]' / '[Compaction]' */
  label: string
  /** 重试进度：retries 是本次失败允许的上限（网关超时可能只允许 1 次） */
  onRetry?: (attempt: number, retries: number) => void
  /** 换模型成功：调用方在此重新绑定新模型 */
  onSwitch?: (model: BaseChatModel) => void
  /** 时钟（工装注入假时钟用；缺省 Date.now） */
  now?: () => number
  /** 重试间隔（工装注入零延迟用；缺省 MODEL_RETRY_DELAY_MS） */
  retryDelayMs?: number
}

/**
 * 带「分类重试 + 换模型兜底」的模型调用。
 * 永久性错误立即抛出（不重试、不弹换模型），瞬时错误按各自的预算原地重试，
 * 重试耗尽后（允许询问时）经 questionService.ask 挂起等待用户换模型，选好则在原位置继续。
 */
export async function invokeWithModelRecovery<T>(req: ModelCallRecovery<T>): Promise<T> {
  const now = req.now ?? Date.now
  const retryDelayMs = req.retryDelayMs ?? MODEL_RETRY_DELAY_MS
  let attempt = 0
  let switchOffered = false
  for (;;) {
    const startedAt = now()
    try {
      return await req.call()
    } catch (err) {
      const raw = err instanceof Error ? err : new Error(String(err))
      const info = classifyModelError(raw, now() - startedAt)
      if (info.kind === 'aborted' || req.ctx.signal?.aborted) throw err

      if (info.transient && attempt < info.retryLimit) {
        attempt += 1
        req.onRetry?.(attempt, info.retryLimit)
        logger.error(
          `${req.label} 模型请求失败（第 ${attempt}/${info.retryLimit} 次重试，仅重试本次调用，不重跑工具）:`,
          raw
        )
        await sleep(retryDelayMs)
        if (req.ctx.signal?.aborted) {
          const abortErr = new Error('Model request aborted')
          abortErr.name = 'AbortError'
          throw abortErr
        }
        continue
      }

      if (!info.transient) {
        logger.error(
          `${req.label} 模型请求失败且不可重试（${info.kind}${info.status != null ? ` / HTTP ${info.status}` : ''}），直接报错:`,
          raw
        )
      } else {
        logger.error(
          `${req.label} 模型请求重试耗尽（${info.kind}，重试 ${attempt} 次仍失败），向上抛错:`,
          raw
        )
      }

      // 换模型询问：只给「值得恢复」的失败一次机会（永久性错误换模型也解决不了当前这次请求的语义问题）
      if (
        info.transient &&
        !switchOffered &&
        req.ctx.askEnabled !== false &&
        req.ctx.topicId > 0 &&
        req.ctx.turnSource !== 'goal-round'
      ) {
        switchOffered = true
        const newModel = await askUserToSwitchModel(req.ctx, raw)
        if (newModel) {
          req.onSwitch?.(newModel)
          attempt = 0
          logger.info(`${req.label} 已切换用户选择的新模型，重置重试计数，在原位置继续执行`)
          continue
        }
        logger.warn(`${req.label} 用户放弃切换模型，按原错误结束本轮:`, raw.message)
      }
      throw new ModelRequestError(info, attempt)
    }
  }
}

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
