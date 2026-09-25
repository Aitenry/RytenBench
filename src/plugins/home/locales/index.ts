import { homeZhCN } from './zh-CN'
import { homeEnUS } from './en-US'

/**
 * home 插件词条注册表（renderer install 时经
 * `ctx.use('i18n').addResources('translation', homeLocales)` 注入 i18next）。
 *
 * 插件停用时这些键随之消失——不再由中央词条文件无条件打包进首屏。
 */
export const homeLocales = {
  'zh-CN': homeZhCN,
  'en-US': homeEnUS
}

export default homeLocales
