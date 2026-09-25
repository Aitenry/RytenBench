import _Store from 'electron-store'
import logger from 'electron-log'

/**
 * 插件启用态持久化（userData/plugins.json）。
 *
 * 只存「显式覆写」：内置插件默认启用、外部插件默认停用——
 * 未写入的 id 取默认值，避免每次内置插件新增都要迁移存量配置。
 */
export const Store = _Store['default'] || _Store

export const pluginsStore = new Store<{ states?: Record<string, boolean> }>({
  name: 'plugins'
})

/** 读取某插件的显式启用覆写；undefined = 未覆写（取默认值） */
export function getEnabledOverride(id: string): boolean | undefined {
  const states = pluginsStore.get('states') ?? {}
  return states[id]
}

/** 写入显式启用覆写 */
export function setEnabledOverride(id: string, enabled: boolean): void {
  const states = pluginsStore.get('states') ?? {}
  pluginsStore.set('states', { ...states, [id]: enabled })
}

/** 清除显式覆写（回到默认值） */
export function clearEnabledOverride(id: string): void {
  const states = pluginsStore.get('states') ?? {}
  if (!(id in states)) return
  const rest = { ...states }
  delete rest[id]
  pluginsStore.set('states', rest)
  logger.info(`[Plugins] 已清除 ${id} 的启用覆写`)
}
