import 'i18next'
import type { zhCN } from './locales/zh-CN'

/**
 * 为 i18next 注入资源类型：`t()` 的键路径由中文源语言推导，
 * 拼错键名或使用未定义的键会直接是 TS 编译错误。
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof zhCN }
    returnNull: false
  }
}
