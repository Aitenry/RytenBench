import type { AppLanguage } from '@renderer/types/settings'

/**
 * 界面语言。只有两项，`AppLanguage` 就是它本身——
 * 没有「跟随系统」档位：未选择过时由 `detectSystemLanguage()` 决定默认选中哪一项。
 */
export type ResolvedLanguage = AppLanguage

/** 受支持的界面语言（下拉框顺序） */
export const SUPPORTED_LANGUAGES: readonly ResolvedLanguage[] = ['zh-CN', 'en-US']

/** 兜底语言 = 源语言 */
export const DEFAULT_LANGUAGE: ResolvedLanguage = 'zh-CN'

/** 各语言在 dayjs 里对应的 locale 名 */
export const LANGUAGES: Record<ResolvedLanguage, { dayjs: string }> = {
  'zh-CN': { dayjs: 'zh-cn' },
  'en-US': { dayjs: 'en' }
}

/**
 * 把任意 locale 标识（`zh-CN` / `zh-Hans-CN` / `en-US` / `en-GB` / `ja-JP`…）
 * 归一化到受支持的语言：中文系 → 简体中文，其余一律 → 英文。
 */
export function normalizeLanguage(locale: string | null | undefined): ResolvedLanguage {
  if (!locale) return DEFAULT_LANGUAGE
  return locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

/**
 * 读取操作系统语言，用作「用户还没选过语言」时的默认选项。
 * Electron 渲染进程里 `navigator.language` 即主进程 `app.getLocale()`（如 `zh-CN`、`en-US`）。
 */
export function detectSystemLanguage(): ResolvedLanguage {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE
  return normalizeLanguage(navigator.language || navigator.languages?.[0])
}

/** 校验持久化值是否是可用的语言（老版本可能存过 'system' 等已废弃值） */
export function isSupportedLanguage(value: unknown): value is ResolvedLanguage {
  return value === 'zh-CN' || value === 'en-US'
}
