import { musicZhCN } from './zh-CN'
import { musicEnUS } from './en-US'

/**
 * music 插件词条注册表（renderer install 时经
 * `ctx.use('i18n').addResources('translation', musicLocales)` 注入 i18next）。
 *
 * 插件停用时这些键随之消失——不再由中央词条文件无条件打包进首屏。
 */
export const musicLocales = {
  'zh-CN': musicZhCN,
  'en-US': musicEnUS
}

export default musicLocales
