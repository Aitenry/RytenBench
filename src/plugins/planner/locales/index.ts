import { plannerZhCN } from './zh-CN'
import { plannerEnUS } from './en-US'

/**
 * planner 插件词条注册表（renderer install 时经
 * `ctx.use('i18n').addResources('translation', plannerLocales)` 注入 i18next）。
 *
 * 插件停用时这些键随之消失——不再由中央词条文件无条件打包进首屏。
 */
export const plannerLocales = {
  'zh-CN': plannerZhCN,
  'en-US': plannerEnUS
}

export default plannerLocales
