import { i18n } from '@renderer/i18n'
import { PluginError, PLUGIN_ERROR } from '@shared/plugin/errors'
import type { PluginDescriptor, PluginManifest, PluginState } from '@shared/plugin/types'
import { HOST_KEYS } from './keys'
import { PluginContext } from './context'
import type {
  AppProviderRegistration,
  BottomBarItemRegistration,
  GlobalComponentRegistration,
  HostServiceKey,
  HostServices,
  Plugin,
  RegisteredMenuItem,
  RegisteredRoute,
  SettingsSectionRegistration
} from './types'

/**
 * 渲染层插件宿主（Cordis Fiber 状态机的轻量实现）。
 *
 * 生命周期：inactive →(enable)→ active →(disable)→ inactive；
 * - enable：先校验 inject 依赖（MISSING_DEP），install 抛错时逆序回滚已注册效果、恢复 error；
 * - disable：按 withdrawal 顺序卸载（依赖者先于提供者），注册表 + effects + install dispose 全部回滚；
 * - 任何注册/注销都会 bump 版本号，React 侧经 useSyncExternalStore 响应式重渲染。
 */

type FiberState = PluginState

/** 包一层 pluginId 的注册表：register 返回注销函数；宿主可整组清空 */
class ScopedRegistry<T extends { pluginId: string }> {
  private items = new Map<string, T[]>()

  register(pluginId: string, item: Omit<T, 'pluginId'>, bump: () => void): () => void {
    const full = { ...item, pluginId } as unknown as T
    const list = this.items.get(pluginId) ?? []
    list.push(full)
    this.items.set(pluginId, list)
    bump()
    return () => {
      const cur = this.items.get(pluginId)
      if (!cur) return
      const next = cur.filter((x) => x !== full)
      if (next.length > 0) this.items.set(pluginId, next)
      else this.items.delete(pluginId)
      bump()
    }
  }

  removeAll(pluginId: string, bump: () => void): void {
    if (this.items.delete(pluginId)) bump()
  }

  getAll(): T[] {
    return [...this.items.values()].flat()
  }
}

type EventHandler = (data?: unknown) => void

export class PluginHost {
  /** 版本号：任何注册表变更都自增，作为 useSyncExternalStore 快照 */
  version = 0

  private listeners = new Set<() => void>()
  private plugins: Plugin[] = []
  private readonly ctxs = new Map<string, PluginContext>()
  private readonly states = new Map<string, FiberState>()
  private readonly errors = new Map<string, string>()
  private readonly enabled = new Set<string>()
  /** 自定义键 → 提供者插件 id（用于 MISSING_DEP 校验与 withdrawal 顺序） */
  /** 自定义键 → 提供者插件 id 与其提供的值（注册表本身就是 provide 的真源） */
  private readonly provides = new Map<string, { pluginId: string; value: unknown }>()

  private readonly routeRegistry = new ScopedRegistry<RegisteredRoute>()
  private readonly menuRegistry = new ScopedRegistry<RegisteredMenuItem>()
  private readonly settingsRegistry = new ScopedRegistry<SettingsSectionRegistration>()
  private readonly providerRegistry = new ScopedRegistry<AppProviderRegistration>()
  private readonly globalRegistry = new ScopedRegistry<GlobalComponentRegistration>()
  private readonly bottomBarRegistry = new ScopedRegistry<BottomBarItemRegistration>()
  private readonly eventHandlers = new Map<string, Set<EventHandler>>()

  constructor(plugins: Plugin[], initialEnabled?: Record<string, boolean>) {
    plugins.forEach((p) => this.registerPlugin(p))
    // 启动竞态修复：默认启用的内置插件在构造期同步预装载——首帧渲染前路由/菜单
    // 即已注册。否则首帧 usePluginRoutes/usePluginMenus 为空，启动早期点击菜单
    // navigate 到无路由位置（"No routes matched"、点击无反应）。
    for (const p of plugins) {
      const want =
        initialEnabled && p.manifest.id in initialEnabled
          ? Boolean(initialEnabled[p.manifest.id])
          : p.manifest.builtin
      if (want) this.syncInstall(p.manifest.id)
    }
  }

  /**
   * 同步装载：install 同步返回的插件当场完成登记（active）。
   * install 返回 Promise（异步插件）时回滚并交由 enable() 的异步路径装载。
   */
  private syncInstall(id: string): boolean {
    if (this.enabled.has(id)) return true
    const plugin = this.findPlugin(id)
    if (this.checkDeps(plugin).length > 0) return false
    const ctx = new PluginContext(id, this, plugin.manifest, undefined)
    this.ctxs.set(id, ctx)
    this.states.set(id, 'reloading')
    try {
      const ret = plugin.install(ctx) as
        void | (() => void) | Promise<void | (() => void)> | undefined
      if (ret && typeof (ret as Promise<unknown>).then === 'function') {
        this.ctxs.delete(id)
        this.states.set(id, 'inactive')
        return false
      }
      ctx.attachInstallDispose(ret as void | (() => void) | undefined)
      this.enabled.add(id)
      this.states.set(id, 'active')
      this.errors.delete(id)
      return true
    } catch (err) {
      this.ctxs.delete(id)
      const msg = err instanceof Error ? err.message : String(err)
      this.errors.set(id, msg)
      this.states.set(id, 'error')
      return false
    } finally {
      this.bump()
    }
  }

  /** 登记插件（内置在构造时登记；外部插件在运行时加载后登记） */
  registerPlugin(plugin: Plugin): void {
    if (this.plugins.some((p) => p.manifest.id === plugin.manifest.id)) return
    this.plugins.push(plugin)
    this.states.set(plugin.manifest.id, 'inactive')
    this.bump()
  }

  /** 登记外部插件（运行时加载完成的入口；启用态仍由 applyEnabled 统一驱动） */
  addExternal(plugin: Plugin): void {
    this.registerPlugin(plugin)
  }

  /** 移除外部插件（先卸载再摘除登记；内置插件不可移除） */
  async removeExternal(id: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.manifest.id === id)
    if (!plugin || plugin.manifest.builtin) return
    await this.disable(id).catch(() => undefined)
    this.plugins = this.plugins.filter((p) => p.manifest.id !== id)
    this.states.delete(id)
    this.errors.delete(id)
    this.bump()
  }

  // ---------- 响应式 ----------

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private bump(): void {
    this.version += 1
    for (const listener of [...this.listeners]) listener()
  }

  // ---------- 服务获取 ----------

  /** 为插件构建指定键的 scoped 服务（默认经 effect 注册，卸载自动回滚） */
  serviceFor<K extends HostServiceKey>(key: K, pluginId: string): HostServices[K] {
    switch (key) {
      case 'route':
        return {
          register: (r) =>
            this.routeRegistry.register(pluginId, r as Omit<RegisteredRoute, 'pluginId'>, () =>
              this.bump()
            )
        } as HostServices[K]
      case 'menu':
        return {
          register: (m) =>
            this.menuRegistry.register(pluginId, m as Omit<RegisteredMenuItem, 'pluginId'>, () =>
              this.bump()
            )
        } as HostServices[K]
      case 'settingsSection':
        return {
          register: (s) =>
            this.settingsRegistry.register(
              pluginId,
              s as Omit<SettingsSectionRegistration, 'pluginId'>,
              () => this.bump()
            )
        } as HostServices[K]
      case 'appProvider':
        return {
          register: (p) =>
            this.providerRegistry.register(
              pluginId,
              p as Omit<AppProviderRegistration, 'pluginId'>,
              () => this.bump()
            )
        } as HostServices[K]
      case 'globalComponent':
        return {
          register: (g) =>
            this.globalRegistry.register(
              pluginId,
              g as Omit<GlobalComponentRegistration, 'pluginId'>,
              () => this.bump()
            )
        } as HostServices[K]
      case 'bottomBar':
        return {
          register: (b) =>
            this.bottomBarRegistry.register(
              pluginId,
              b as Omit<BottomBarItemRegistration, 'pluginId'>,
              () => this.bump()
            )
        } as HostServices[K]
      case 'api':
        return {
          invoke: async (channel, ...args) => window.api.plugin.invoke(channel, ...args)
        } as unknown as HostServices[K]
      case 'i18n':
        return {
          addResources: (ns, resources) => {
            for (const lang of Object.keys(resources)) {
              i18n.addResourceBundle(lang, ns, resources[lang], true, true)
            }
          }
        } as HostServices[K]
      case 'events':
        return {
          on: (channel, cb) => {
            let set = this.eventHandlers.get(channel)
            if (!set) {
              set = new Set()
              this.eventHandlers.set(channel, set)
            }
            set.add(cb)
            return () => {
              set.delete(cb)
            }
          },
          emit: (channel, data) => {
            const set = this.eventHandlers.get(channel)
            if (!set) return
            for (const cb of [...set]) {
              try {
                cb(data)
              } catch (err) {
                console.error(`[plugin-host] 事件 ${channel} 处理器异常:`, err)
              }
            }
          }
        } as unknown as HostServices[K]
      case 'storage': {
        const prefix = `rb.plugin.${pluginId}.`
        return {
          get: <T>(key: string): T | null => {
            try {
              const raw = window.localStorage.getItem(prefix + key)
              return raw === null ? null : (JSON.parse(raw) as T)
            } catch {
              return null
            }
          },
          set: (key: string, value: unknown): void => {
            window.localStorage.setItem(prefix + key, JSON.stringify(value))
          },
          remove: (key: string): void => {
            window.localStorage.removeItem(prefix + key)
          }
        } as HostServices[K]
      }
      default:
        throw new PluginError(PLUGIN_ERROR.SERVICE_MISSING, `未知宿主服务键 '${String(key)}'`)
    }
  }

  /** 外部插件取 vendored 模块实例 */
  requireVendor(name: string): unknown {
    return (this.vendorModules ?? {})[name]
  }

  setVendorModules(modules: Record<string, unknown>): void {
    this.vendorModules = modules
  }

  private vendorModules?: Record<string, unknown>

  // ---------- provide 登记（自定义键） ----------

  /** 登记插件提供的自定义键（宿主记录提供者与值，供其他插件 inject 后取用） */
  registerProvide(pluginId: string, key: string, value: unknown): void {
    this.provides.set(key, { pluginId, value })
  }

  /** 取某个自定义键当前提供的值（未提供返回 undefined） */
  getProvided<T>(key: string): T | undefined {
    return this.provides.get(key)?.value as T | undefined
  }

  private removeAllProvides(pluginId: string): void {
    for (const [key, entry] of [...this.provides]) {
      if (entry.pluginId === pluginId) this.provides.delete(key)
    }
  }

  // ---------- 生命周期 ----------

  private findPlugin(id: string): Plugin {
    const plugin = this.plugins.find((p) => p.manifest.id === id)
    if (!plugin) throw new PluginError(PLUGIN_ERROR.NOT_FOUND, `插件 '${id}' 不存在`)
    return plugin
  }

  /** 校验声明依赖是否可满足：宿主根键始终可用，自定义键需有已激活提供者 */
  private checkDeps(plugin: Plugin): string[] {
    const inject = plugin.manifest.inject ?? []
    return inject.filter(
      (k) => !(HOST_KEYS as readonly string[]).includes(k) && !this.provides.has(k)
    )
  }

  async enable(id: string): Promise<void> {
    if (this.enabled.has(id)) return
    const plugin = this.findPlugin(id)
    const missing = this.checkDeps(plugin)
    if (missing.length > 0) {
      const msg = `[plugin:${id}] 依赖未满足: ${missing.join(', ')}`
      this.errors.set(id, msg)
      this.states.set(id, 'error')
      this.bump()
      throw new PluginError(PLUGIN_ERROR.MISSING_DEP, msg)
    }
    const ctx = new PluginContext(id, this, plugin.manifest, undefined)
    this.ctxs.set(id, ctx)
    this.states.set(id, 'reloading')
    this.bump()
    try {
      const dispose = await plugin.install(ctx)
      ctx.attachInstallDispose(dispose)
      this.enabled.add(id)
      this.states.set(id, 'active')
      this.errors.delete(id)
    } catch (err) {
      await ctx.dispose().catch(() => undefined)
      this.ctxs.delete(id)
      const msg = err instanceof Error ? err.message : String(err)
      this.errors.set(id, msg)
      this.states.set(id, 'error')
      this.bump()
      throw err
    }
    this.bump()
  }

  async disable(id: string): Promise<void> {
    if (!this.enabled.has(id)) return
    for (const pid of this.withdrawalOrder(id)) {
      const ctx = this.ctxs.get(pid)
      this.states.set(pid, 'unloading')
      this.bump()
      // 1) 先摘除注册表条目（菜单/路由/设置页立即消失）
      this.routeRegistry.removeAll(pid, () => this.bump())
      this.menuRegistry.removeAll(pid, () => this.bump())
      this.settingsRegistry.removeAll(pid, () => this.bump())
      this.providerRegistry.removeAll(pid, () => this.bump())
      this.globalRegistry.removeAll(pid, () => this.bump())
      this.bottomBarRegistry.removeAll(pid, () => this.bump())
      // 2) 逆序回滚 effects + install dispose
      await ctx?.dispose().catch(() => undefined)
      this.removeAllProvides(pid)
      this.ctxs.delete(pid)
      this.enabled.delete(pid)
      this.states.set(pid, 'inactive')
    }
    this.bump()
  }

  /**
   * withdrawal 顺序：依赖者先于提供者卸载（论文 L-Leave/L-Unload）。
   * 受影响集合 = 目标插件 + 所有（传递地）inject 了受影响插件所提供键的已激活插件；
   * 每次先卸载「不再被其余受影响插件依赖」的插件。
   */
  private withdrawalOrder(root: string): string[] {
    const affected = new Set<string>([root])
    let changed = true
    while (changed) {
      changed = false
      for (const [pid, ctx] of [...this.ctxs]) {
        if (affected.has(pid)) continue
        const providedByAffected = [...affected].some((aid) => {
          const aCtx = this.ctxs.get(aid)
          return aCtx ? ctx.injects().some((k) => aCtx.provided().includes(k)) : false
        })
        if (providedByAffected) {
          affected.add(pid)
          changed = true
        }
      }
    }

    const order: string[] = []
    const remaining = new Set(affected)
    const dependsOn = (n: string, m: string): boolean => {
      const ctxN = this.ctxs.get(n)
      const ctxM = this.ctxs.get(m)
      if (!ctxN || !ctxM) return false
      return ctxN.injects().some((k) => ctxM.provided().includes(k))
    }
    while (remaining.size > 0) {
      const next = [...remaining].find((n) =>
        [...remaining].every((m) => m === n || !dependsOn(n, m))
      )
      if (!next) {
        // 环路兜底：直接卸载剩余（自定义键循环依赖不应出现，出现则按任意序）
        for (const pid of remaining) order.push(pid)
        break
      }
      order.push(next)
      remaining.delete(next)
    }
    return order
  }

  // ---------- 查询 ----------

  getRoutes(): RegisteredRoute[] {
    return this.cached('routes', () => this.routeRegistry.getAll())
  }

  getMenus(): RegisteredMenuItem[] {
    return this.cached('menus', () =>
      this.menuRegistry.getAll().sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    )
  }

  getMenuKeys(): string[] {
    return this.cached('menuKeys', () => this.getMenus().map((m) => m.key))
  }

  getSettingsSections(): SettingsSectionRegistration[] {
    return this.cached('settingsSections', () =>
      this.settingsRegistry
        .getAll()
        .sort((a, b) => a.order - b.order || a.tabKey.localeCompare(b.tabKey))
    )
  }

  getProviders(): AppProviderRegistration[] {
    return this.cached('providers', () =>
      this.providerRegistry
        .getAll()
        .sort((a, b) => a.order - b.order || a.pluginId.localeCompare(b.pluginId))
    )
  }

  getGlobalComponents(slot: string): GlobalComponentRegistration[] {
    return this.cached(`globalComponents:${slot}`, () =>
      this.globalRegistry.getAll().filter((g) => g.slot === slot)
    )
  }

  /** 底栏槽位条目（按 order 排序，宿主侧只做排序、不判可见性） */
  getBottomBarItems(): BottomBarItemRegistration[] {
    return this.cached('bottomBarItems', () =>
      this.bottomBarRegistry.getAll().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    )
  }

  getDescriptor(id: string): PluginDescriptor | undefined {
    const plugin = this.plugins.find((p) => p.manifest.id === id)
    if (!plugin) return undefined
    return this.toDescriptor(plugin)
  }

  getDescriptors(): PluginDescriptor[] {
    return this.cached('descriptors', () => this.plugins.map((p) => this.toDescriptor(p)))
  }

  /**
   * 版本化结果缓存：同一版本内多次调用返回同一引用。
   * 修复「新鲜数组引用抖动」——useMemo/useEffect 依赖这些 getter 结果时，
   * 若每次渲染都拿到新数组，会引发效应反复重放（如 SettingsModal 打开后
   * activeTab 被重置、App providers 重挂载）。
   */
  private readonly getterCache = new Map<string, { version: number; value: unknown }>()

  private cached<T>(key: string, compute: () => T): T {
    const hit = this.getterCache.get(key)
    if (hit && hit.version === this.version) return hit.value as T
    const value = compute()
    this.getterCache.set(key, { version: this.version, value })
    return value
  }

  private toDescriptor(plugin: Plugin): PluginDescriptor {
    const m: PluginManifest = plugin.manifest
    return {
      manifest: m,
      source: m.builtin ? 'builtin' : 'external',
      enabled: this.enabled.has(m.id),
      state: this.states.get(m.id) ?? 'inactive',
      error: this.errors.get(m.id)
    }
  }

  /** 批量应用启用态（diff 驱动）：启用的插件按序 enable，停用的按 withdrawal 卸载 */
  async applyEnabled(map: Record<string, boolean>): Promise<void> {
    const want: Array<[string, boolean]> = []
    for (const key of Object.keys(map)) {
      // 未登记（如外部插件尚未加载）的 id 跳过，由桥在加载完成后重放
      if (!this.plugins.some((p) => p.manifest.id === key)) continue
      const wantEnabled = Boolean(map[key])
      const current = this.enabled.has(key)
      if (wantEnabled !== current) want.push([key, wantEnabled])
    }
    // 先停用（依赖者先卸载），后启用
    for (const [id, on] of want) {
      if (!on)
        await this.disable(id).catch((err) => console.error(`[plugin-host] 停用 ${id} 失败:`, err))
    }
    for (const [id, on] of want) {
      if (on)
        await this.enable(id).catch((err) => console.error(`[plugin-host] 启用 ${id} 失败:`, err))
    }
  }

  isEnabled(id: string): boolean {
    return this.enabled.has(id)
  }

  /** 已登记的插件集合是否已全部按启用态装载完成（供 Provider 首屏判断） */
  hasLoaded(): boolean {
    for (const p of this.plugins) {
      const st = this.states.get(p.manifest.id)
      if (st === 'reloading' || st === 'unloading') return false
    }
    return true
  }
}
