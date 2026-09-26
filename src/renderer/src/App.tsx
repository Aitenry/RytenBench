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
import { builtinPlugins, vendorModules } from '@renderer/plugin-host/builtin'
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
// 桥负责三件事：卸载已消失/停用的外部插件 → 加载新启用的外部插件渲染模块 →
// 把清单 diff 应用到宿主（装载/卸载），并订阅启停广播即时重放。
const PluginStateBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const host = usePluginHost()
  useEffect(() => {
    let disposed = false
    const sync = async (): Promise<void> => {
      try {
        const list = await window.api.plugin.list()
        if (disposed) return

        // 1) 卸载：主进程清单中已不在（卸载）或已停用的外部插件
        for (const descriptor of host.getDescriptors()) {
          if (descriptor.manifest.builtin) continue
          const entry = list.find((e) => e.id === descriptor.manifest.id)
          if (!entry || !entry.enabled) {
            await host
              .removeExternal(descriptor.manifest.id)
              .catch((err) => console.error('[plugins] 外部插件卸载失败:', err))
          }
        }

        // 2) 加载：清单中启用但尚未登记的外部插件渲染模块
        for (const e of list) {
          if (e.builtin || !e.enabled) continue
          if (!host.getDescriptor(e.id)) {
            try {
              const plugin = await loadExternalPlugin({
                id: e.id,
                name: e.name,
                version: e.version,
                description: e.description,
                builtin: false,
                entry: e.entry
              })
              if (!disposed) host.addExternal(plugin)
            } catch (err) {
              console.error(`[plugins] 外部插件 '${e.id}' 渲染模块加载失败:`, err)
            }
          }
        }

        // 3) 统一应用启用态（内置 + 已登记外部；未知 id 由宿主跳过）
        const map: Record<string, boolean> = {}
        for (const entry of list) {
          if (!entry.builtin && !host.getDescriptor(entry.id)) continue
          map[entry.id] = entry.enabled
        }
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
   * 首帧启用态：宿主在构造期**同步预装载**内置插件（否则首帧没有路由/菜单，点菜单会导航到空路由），
   * 所以必须在同一时机拿到主进程的权威启用态，而不是先按 manifest 默认值全装一遍再异步卸载——
   * 那样被停用插件的 Provider 会短暂挂载并订阅事件通道，而主进程并没有装载它的通道
   * （2026-09-26 事故：整页 RUNTIME ERROR / 插件通道未启用: plugin:music:play-track）。
   *
   * 取不到时返回 undefined，宿主退回「内置默认启用」的老行为（最坏情况是短暂多装一次）。
   */
  const initialEnabled = useMemo<Record<string, boolean> | undefined>(() => {
    try {
      const list = window.api.plugin.listSync()
      if (!Array.isArray(list) || list.length === 0) return undefined
      const map: Record<string, boolean> = {}
      for (const entry of list) {
        if (entry.builtin) map[entry.id] = entry.enabled
      }
      return Object.keys(map).length > 0 ? map : undefined
    } catch (err) {
      console.warn('[plugins] 同步启用清单失败，按默认启用态装载:', err)
      return undefined
    }
  }, [])

  return (
    <HashRouter>
      {/* 全局错误边界：渲染错误不再让整个应用白屏死掉，而是给出可恢复的提示卡 */}
      <AppErrorBoundary>
        {/* 插件宿主根：内置插件按启用态装载，路由/菜单/设置页/Provider 全部注册表驱动 */}
        <PluginHostProvider
          plugins={builtinPlugins}
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
