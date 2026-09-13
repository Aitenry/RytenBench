import { app } from 'electron'
import { settingsStore } from '../context'
import { enUS, zhCN } from './messages'
import { enUSToolResults, zhCNToolResults } from './tool-results'

/** 主进程侧可见文案使用的语言（与渲染层同一份设置，两项，无「跟随系统」档） */
export type MainLanguage = 'zh-CN' | 'en-US'

/** 与渲染层 `normalizeLanguage` 同规则：中文系 → zh-CN，其余 → en-US */
function normalizeLocale(locale: string | undefined | null): MainLanguage {
  if (!locale) return 'zh-CN'
  return locale.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

/**
 * 当前界面语言。用户选过就用落盘值，没选过（或存的是已废弃的值）按操作系统语言，
 * 与渲染进程 `detectSystemLanguage()`（`navigator.language` === `app.getLocale()`）保持一致。
 */
export function getMainLanguage(): MainLanguage {
  const stored = settingsStore.get('language') as unknown
  if (stored === 'zh-CN' || stored === 'en-US') return stored
  return normalizeLocale(app.isReady() ? app.getLocale() : undefined)
}

/** 按当前语言取整棵文案树；用法 `const m = mainMessages(); m.tray.hideWindow` */
export function mainMessages(): typeof zhCN {
  return getMainLanguage() === 'en-US' ? enUS : zhCN
}

/**
 * 工具执行结果的文案树（会渲染在聊天的工具结果卡片上，因此跟随界面语言）。
 * 用法 `const tm = mainToolMessages(); mainFormat(tm.mnemon.added, { count })`
 */
export function mainToolMessages(): typeof zhCNToolResults {
  return getMainLanguage() === 'en-US' ? enUSToolResults : zhCNToolResults
}

/**
 * 词条插值：把 `{{name}}` 替换为传入的值（中英句式不同，所以占位符由词条决定顺序）。
 * 可空值（数据库里可空列的投影）按空串渲染，别让 `null` 出现在界面上。
 */
export function mainFormat(
  template: string,
  vars: Record<string, string | number | null | undefined>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(vars[key] ?? ''))
}

/** 复数短语：`mainPlural(one, other, count)`——中文两份相同，英文按 count 选 */
export function mainPlural(one: string, other: string, count: number): string {
  return mainFormat(count === 1 ? one : other, { count })
}
