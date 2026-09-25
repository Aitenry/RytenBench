import 'i18next'
import type { zhCN } from './locales/zh-CN'
import type { musicZhCN } from '@plugins/music/locales/zh-CN'
import type { plannerZhCN } from '@plugins/planner/locales/zh-CN'

/**
 * 为 i18next 注入资源类型：`t()` 的键路径由中文源语言推导，
 * 拼错键名或使用未定义的键会直接是 TS 编译错误。
 *
 * 插件词条（music / musicSettings / planner）在运行期由插件 install 时注册，不在中央资源里，
 * 但它们的**源语言类型**仍是 `t()` 键校验的依据——所以这里按插件与中央资源的
 * 键空间求并集（两者键不重叠）。插件停用只是运行期不再注册这些键，类型校验不受影响。
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof zhCN & typeof musicZhCN & typeof plannerZhCN }
    returnNull: false
  }
}
