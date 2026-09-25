import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore
} from 'react'
import { PluginHost } from './host'
import type {
  AppProviderRegistration,
  BottomBarItemRegistration,
  GlobalComponentRegistration,
  Plugin,
  RegisteredMenuItem,
  RegisteredRoute,
  SettingsSectionRegistration
} from './types'
import type { PluginDescriptor } from '@shared/plugin/types'

const PluginHostCtx = createContext<PluginHost | null>(null)

interface PluginHostProviderProps {
  plugins: Plugin[]
  /** 启用态覆写：id → 是否启用；缺省按 manifest.builtin（内置默认开、外部默认关） */
  enabledOverride?: Record<string, boolean>
  /** 外部插件 vendor 模块（react/antd 等宿主唯一实例） */
  vendorModules?: Record<string, unknown>
  children: React.ReactNode
}

/**
 * 插件宿主根 Provider：
 * - 创建 PluginHost 单例；
 * - 按 enabledOverride 装载插件（未指定则内置默认启用）；
 * - enabledOverride 变化时 diff 式重放（启停即时生效）。
 */
export const PluginHostProvider: React.FC<PluginHostProviderProps> = ({
  plugins,
  enabledOverride,
  vendorModules,
  children
}) => {
  // 显式覆写之外的默认值：内置开、外部关
  const enabledMap = useMemo<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {}
    for (const p of plugins) {
      map[p.manifest.id] =
        enabledOverride && p.manifest.id in enabledOverride
          ? Boolean(enabledOverride[p.manifest.id])
          : p.manifest.builtin
    }
    return map
  }, [plugins, enabledOverride])

  // 宿主随构造期同步预装载默认启用的内置插件（首帧即注册路由/菜单）
  const hostRef = useRef<PluginHost | null>(null)
  if (!hostRef.current) hostRef.current = new PluginHost(plugins, enabledMap)
  const host = hostRef.current
  if (vendorModules) host.setVendorModules(vendorModules)

  const enabledJson = JSON.stringify(enabledMap)

  const applyRef = useRef<string>('')
  useEffect(() => {
    // 构造期已同步装载的内置插件在此为 no-op（diff 跳过）；外部插件与
    // 运行期启停（桥重放）走异步 enable/disable
    if (applyRef.current === enabledJson) return
    applyRef.current = enabledJson
    // 应用结果经宿主版本号（useSyncExternalStore 订阅）驱动重渲染，无需额外本地状态
    void host.applyEnabled(enabledMap)
  }, [host, enabledMap, enabledJson])

  return <PluginHostCtx.Provider value={host}>{children}</PluginHostCtx.Provider>
}

export function usePluginHost(): PluginHost {
  const host = useContext(PluginHostCtx)
  if (!host) throw new Error('usePluginHost 必须在 PluginHostProvider 内使用')
  return host
}

/**
 * 订阅宿主版本号：任何注册表变更（启用/停用/注册/注销）都会触发订阅组件重渲染。
 * 各 usePlugin* 钩子读取的注册表数据与版本号在同一渲染周期内一致。
 */
function useHostVersion(): number {
  const host = usePluginHost()
  return useSyncExternalStore(
    (cb) => host.subscribe(cb),
    () => host.version
  )
}

export function usePlugins(): PluginDescriptor[] {
  const host = usePluginHost()
  useHostVersion()
  return host.getDescriptors()
}

export function usePluginRoutes(): RegisteredRoute[] {
  const host = usePluginHost()
  useHostVersion()
  return host.getRoutes()
}

export function usePluginMenus(): RegisteredMenuItem[] {
  const host = usePluginHost()
  useHostVersion()
  return host.getMenus()
}

/** 侧栏合法菜单键集合（AppContent 高亮白名单的注册表驱动版本） */
export function usePluginMenuKeys(): string[] {
  const host = usePluginHost()
  useHostVersion()
  return host.getMenuKeys()
}

export function usePluginSettingsSections(): SettingsSectionRegistration[] {
  const host = usePluginHost()
  useHostVersion()
  return host.getSettingsSections()
}

export function usePluginProviders(): AppProviderRegistration[] {
  const host = usePluginHost()
  useHostVersion()
  return host.getProviders()
}

export function useGlobalComponents(slot: string): GlobalComponentRegistration[] {
  const host = usePluginHost()
  useHostVersion()
  return host.getGlobalComponents(slot)
}

/**
 * 底栏插槽条目（按 order 排序）。
 * 可见性不进注册表：宿主每次渲染读各条目的 `isVisible()`，插件用 `subscribe` 触发重渲染。
 */
export function useBottomBarItems(): BottomBarItemRegistration[] {
  const host = usePluginHost()
  useHostVersion()
  return host.getBottomBarItems()
}

export function useIsPluginEnabled(): (id: string) => boolean {
  const host = usePluginHost()
  useHostVersion()
  return (id: string) => host.isEnabled(id)
}
