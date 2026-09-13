import type { AppLanguage } from './settings'

/** 界面语言（只有简体中文 / English 两项） */
export type ResolvedLanguage = AppLanguage

export interface LanguageContextType {
  /** 当前界面语言，同时也是下拉框的选中值 */
  language: ResolvedLanguage
  /** 切换界面语言：立即生效并落盘 */
  setLanguage: (language: ResolvedLanguage) => Promise<void>
}
