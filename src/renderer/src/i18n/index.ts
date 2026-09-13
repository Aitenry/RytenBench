import i18n from 'i18next'
import { initReactI18next, useTranslation, Trans } from 'react-i18next'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/en'

import { DEFAULT_NS, resources } from './resources'
import { DEFAULT_LANGUAGE, LANGUAGES, detectSystemLanguage, type ResolvedLanguage } from './types'

export * from './types'
export { DEFAULT_NS, resources }
export { useTranslation, Trans }
/* 具名导出实例：在拿不到 hook 的地方（tiptap NodeView、非组件模块）用 i18n.t() 取当前语言文案 */
export { i18n }

/* 同步初始化：资源内联打包，不需要后端加载；
   首帧语言先按操作系统语言决定（默认偏好即「跟随系统」），
   持久化的偏好随后由 LanguageProvider 异步校对。 */
i18n.use(initReactI18next).init({
  resources,
  lng: detectSystemLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: ['zh-CN', 'en-US'],
  // 只认完整 locale（zh-CN / en-US），避免 i18next 再去尝试 zh / en 变体
  load: 'currentOnly',
  defaultNS: DEFAULT_NS,
  ns: [DEFAULT_NS],
  interpolation: { escapeValue: false },
  // 内联资源下同步初始化，避免首帧出现未翻译的键名（i18next v23+ 的选项名）
  initAsync: false,
  returnNull: false
})

/** 同步 React 之外的语言相关全局状态：`<html lang>` 与 dayjs locale */
export function applyLanguageGlobals(language: ResolvedLanguage): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language
  }
  dayjs.locale(LANGUAGES[language].dayjs)
}

/** 切换界面语言（react-i18next 会广播 languageChanged，订阅方自动重渲染） */
export async function changeLanguage(language: ResolvedLanguage): Promise<void> {
  applyLanguageGlobals(language)
  if (i18n.resolvedLanguage !== language) {
    await i18n.changeLanguage(language)
  }
}

// 首帧就把 <html lang> 与 dayjs locale 对齐到初始语言
applyLanguageGlobals(i18n.resolvedLanguage === 'en-US' ? 'en-US' : DEFAULT_LANGUAGE)

export default i18n
