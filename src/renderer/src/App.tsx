import React, { useEffect, useMemo } from 'react'
import { HashRouter } from 'react-router-dom'
import { MessageContext } from '@renderer/contexts/MessageContext'
import { NotificationProvider } from '@renderer/contexts/NotificationContext'
import { composeProviders } from '@renderer/utils/composeProviders'
import AppContent from '@renderer/components/system/AppContent'
import AppErrorBoundary from '@renderer/components/system/AppErrorBoundary'
import SettingsHost from '@renderer/components/system/settings/SettingsHost'
import {
  PluginHostProvider,
  usePluginHost,
  usePluginProviders
} from '@renderer/plugin-host/PluginHostContext'
import type { Plugin } from '@renderer/plugin-host/types'
import type { PluginListEntry } from '@shared/plugin/types'
import { builtinPlugins, resolveBuiltinPlugins, vendorModules } from '@renderer/plugin-host/builtin'
import { loadExternalPlugin } from '@renderer/plugin-host/external-loader'

// shell 常驻 Provider（插件系统之外的应用骨架层）。
// 插件自己的 Provider（如音乐播放器的 AudioProvider、首页的图谱构建进度）随插件注册，
// 见 PluginProvidersShell：停用插件 = 连它的状态一起卸载，外壳组件不再持有任何插件状态。
const CoreProviders = composeProviders(
  [
    MessageContext.Provider,
    {
      value: {
        viewMessage: () => {}
      }
    }
  ],
  [NotificationProvider]
)

// 插件 Provider 层：模块级稳定组件，直接内联嵌套渲染插件注册的 Provider。
// 关键约束：绝不能动态组合出新组件类型——此前 useMemo(composeProviders(...)) 在宿主
// 每次状态 bump 时生成新组件类型，导致 AppContent/CustomFrame 整棵子树卸载重挂，
// settingsOpen/currentKey 等本地状态被清空，表现为「设置/菜单点击失效」。
// 这里 p.Provider 是插件导出的稳定组件引用，宿主版本变化只触发重渲染（同类型调和），
// 不重挂载；启用/停用插件时 Provider 增删本身即期望的重构。
const PluginProvidersShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pluginProviders = usePluginProviders()
  const nested = pluginProviders.reduceRight(
    (acc, p) => <p.Provider key={p.pluginId}>{acc}</p.Provider>,
    children
  )
  return <>{nested}</>
}

// 启用态同步桥：主进程 plugins-list 是持久化真源；
// 桥负责三件事：移除已消失/停用的插件（含「被物理卸载」）→ 加载已启用的插件渲染模块 →
// 把清单 diff 应用到宿主（装载/卸载），并订阅启停广播即时重放。
const PluginStateBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const host = usePluginHost()
  useEffect(() => {
    let disposed = false
    const sync = async (): Promise<void> => {
      try {
        const list = await window.api.plugin.list()
        if (disposed) return

        // 1) 处置：① 主进程清单里已不在（第三方被卸载 / 目录被删）或已不是「已安装」状态
        //    （内置插件物理卸载）→ forgetPlugin；② **只是被停用** → disable（保留登记）。
        //
        //    ①为什么不能用 host.removeExternal：它对 builtin 插件直接 return，而被卸载的
        //    内置插件（例如 music）仍带着 builtin=true 留在静态注册表里，不移除就会留下
        //    一个「菜单/路由还在、主进程通道已没了」的僵尸插件。
        //
        //    ②为什么不能也用 forgetPlugin（2026-09-26 实测）：停用**静态回退**的内置插件
        //    （P1~P3 过渡期里还没搬走的那个：harness）一旦把登记摘掉，重新启用时第 2 步
        //    会去 `plugin://harness/renderer.js` 取渲染模块——那个文件根本不存在，于是插件永远回不来
        //    （现象：工装「重新启用 home」等到超时，菜单不再出现）。停用是可逆的，登记必须留着，
        //    重启用走宿主的 enable() 重新 install。
        const liveIds = new Set(list.map((e) => e.id))
        for (const descriptor of host.getDescriptors()) {
          const id = descriptor.manifest.id
          const entry = list.find((e) => e.id === id)
          if (!liveIds.has(id) || !entry || entry.installed === false) {
            await host
              .forgetPlugin(id)
              .catch((err) => console.error(`[plugins] 插件移除失败: ${id}`, err))
          } else if (!entry.enabled) {
            await host
              .disable(id)
              .catch((err) => console.error(`[plugins] 插件停用失败: ${id}`, err))
          }
        }

        // 2) 加载：清单里启用但尚未登记的插件渲染模块。
        //    注意条件里没有 `e.builtin` ——P1 起内置插件也是磁盘包（`plugin://<id>/renderer.mjs`
        //    + 宿主 UI 桥），与第三方插件走完全相同的加载路径；尚未搬走、仍靠静态回退的插件
        //    已经在静态注册表里登记过，会因 `getDescriptor` 命中而被跳过。
        for (const e of list) {
          if (!e.enabled) continue
          if (host.getDescriptor(e.id)) continue
          try {
            const plugin = await loadExternalPlugin({
              id: e.id,
              name: e.name,
              version: e.version,
              description: e.description,
              icon: e.icon,
              builtin: Boolean(e.builtin),
              entry: e.entry
            })
            if (!disposed) host.addExternal(plugin)
          } catch (err) {
            console.error(`[plugins] 插件 '${e.id}' 渲染模块加载失败:`, err)
          }
        }

        // 3) 统一应用启用态（已登记的全部插件；未登记的 id 由宿主跳过）
        const map: Record<string, boolean> = {}
        for (const entry of list) map[entry.id] = entry.enabled
        await host.applyEnabled(map)
      } catch (err) {
        console.error('[plugins] 启用态同步失败:', err)
      }
    }
    void sync()
    const unsub = window.api.plugin.onStateChanged(() => {
      void sync()
    })
    return () => {
      disposed = true
      unsub()
    }
  }, [host])
  return <>{children}</>
}

const App: React.FC = () => {
  /**
   * 首帧权威清单：宿主在构造期**同步预装载**内置插件（否则首帧没有路由/菜单，点菜单会导航到空路由），
   * 所以必须在同一时机拿到主进程的权威启用态，而不是先按 manifest 默认值全装一遍再异步卸载——
   * 那样被停用插件的 Provider 会短暂挂载并订阅事件通道，而主进程并没有装载它的通道
   * （2026-09-26 事故：整页 RUNTIME ERROR / 插件通道未启用: plugin:music:play-track）。
   *
   * 同一份清单还带 `routes`/`menu` 元数据，供宿主做**首帧声明式预注册**——磁盘包插件的
   * 渲染模块要异步加载，没有这一步首帧侧栏会缺它的菜单（见 plugin-host/host.ts 的 declare()）。
   * 取不到时返回 null，各消费点退回老行为（启用态按内置默认、声明表为空）。
   */
  const syncEntries = useMemo<PluginListEntry[] | null>(() => {
    try {
      const list = window.api.plugin.listSync()
      return Array.isArray(list) ? list : null
    } catch (err) {
      console.warn('[plugins] 同步插件清单失败，按默认启用态装载:', err)
      return null
    }
  }, [])

  const initialEnabled = useMemo<Record<string, boolean> | undefined>(() => {
    if (!syncEntries || syncEntries.length === 0) return undefined
    const map: Record<string, boolean> = {}
    for (const entry of syncEntries) {
      if (entry.builtin) map[entry.id] = entry.enabled
    }
    return Object.keys(map).length > 0 ? map : undefined
  }, [syncEntries])

  /**
   * 要交给宿主的插件集合：排除「已作为插件包安装」的内置插件（它们随后由
   * PluginStateBridge 从 `plugin://<id>/renderer.mjs` 加载）。取不到同步清单时
   * 保守返回全部静态内置插件（dev 未打包的回退路径）。
   */
  const initialPlugins = useMemo<Plugin[]>(() => {
    try {
      return resolveBuiltinPlugins(syncEntries ?? [])
    } catch (err) {
      console.warn('[plugins] 解析内置插件回退集合失败，按全部静态插件装载:', err)
      return builtinPlugins
    }
  }, [syncEntries])

  return (
    <HashRouter>
      {/* 全局错误边界：渲染错误不再让整个应用白屏死掉，而是给出可恢复的提示卡 */}
      <AppErrorBoundary>
        {/* 插件宿主根：插件按启用态装载，路由/菜单/设置页/Provider 全部注册表驱动 */}
        <PluginHostProvider
          plugins={initialPlugins}
          entries={syncEntries ?? undefined}
          vendorModules={vendorModules}
          enabledOverride={initialEnabled}
        >
          <PluginStateBridge>
            <CoreProviders>
              <PluginProvidersShell>
                <AppContent />
              </PluginProvidersShell>
              {/* 设置弹窗挂在插件 Provider 链之外：插件启停不会重建它（详见 SettingsHost.tsx） */}
              <SettingsHost />
            </CoreProviders>
          </PluginStateBridge>
        </PluginHostProvider>
      </AppErrorBoundary>
    </HashRouter>
  )
}

export default App
