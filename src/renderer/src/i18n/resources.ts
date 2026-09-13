import { zhCN } from './locales/zh-CN'
import { enUS } from './locales/en-US'

/** 单一命名空间，键路径形如 `settings.general.language.rowTitle` */
export const DEFAULT_NS = 'translation'

export const resources = {
  'zh-CN': { [DEFAULT_NS]: zhCN },
  'en-US': { [DEFAULT_NS]: enUS }
}
