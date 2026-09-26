import { ipcMain, BrowserWindow } from 'electron'
import logger from 'electron-log'
import { getEnabledOverride, setEnabledOverride } from '../plugins/store'
import { scanExternalPlugins } from '../plugins/scanner'
import { installExternalPlugin, uninstallExternalPlugin } from '../plugins/lifecycle'
import { loadExternalMain, unloadExternalMain } from '../plugins/host'
import { BUILTIN_PLUGIN_MANIFESTS } from '../../plugins/manifests'
import {
  IPC_PLUGIN_STATE_CHANGED,
  IPC_PLUGINS_LIST,
  IPC_PLUGINS_LIST_SYNC,
  IPC_PLUGINS_SET_ENABLED,
  IPC_PLUGINS_INSTALL,
  IPC_PLUGINS_UNINSTALL
} from '../../shared/plugin/protocol'
import type { PluginListEntry } from '../../shared/plugin/types'

/**
 * 插件管理 IPC（core，始终注册）：
 * - plugins-list：内置清单（`src/plugins/manifests.ts`）+ 外部扫描目录 与启用态覆写合并；
 * - plugins-set-enabled：写入 pluginsStore 并广播状态变化（渲染层 host 即时装载/卸载）；
 * - plugins-install / plugins-uninstall：外部插件目录的安装与卸载（lifecycle）。
 * 插件通道调用不经这里：渲染层直接 invoke `plugin:<命名空间>:<channel>`，
 * 主进程按已装载的插件模块注册处理器（见 plugins/host.ts）。
 */

/** 列出全部已发现插件与启用态（内置默认启用、外部默认停用） */
function listEntries(): PluginListEntry[] {
  const entries: PluginListEntry[] = []
  for (const manifest of BUILTIN_PLUGIN_MANIFESTS) {
    const enabled = getEnabledOverride(manifest.id) ?? true
    entries.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      icon: manifest.icon,
      builtin: true,
      enabled,
      state: enabled ? 'active' : 'inactive'
    })
  }
  for (const ext of scanExternalPlugins()) {
    const enabled = getEnabledOverride(ext.id) ?? false
    entries.push({
      id: ext.id,
      name: ext.manifest.name,
      version: ext.manifest.version,
      description: ext.manifest.description,
      icon: ext.manifest.icon,
      builtin: false,
      enabled,
      state: enabled ? 'active' : 'inactive',
      entry: ext.manifest.entry
    })
  }
  return entries
}

/** 广播插件启用态变化（含安装/卸载后的重扫通知） */
export function broadcastPluginStateChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_PLUGIN_STATE_CHANGED)
    }
  }
}

/**
 * 主进程插件宿主注册的状态同步钩子（plugins/host.ts 初始化时设置）：
 * 启停插件时同名注册/注销对应的内置 IPC 组。
 * 用钩子注入避免 host.ts ↔ plugins.ts 的循环依赖。
 */
type PluginStateSyncHook = (id: string, enabled: boolean) => void
let stateSyncHook: PluginStateSyncHook | null = null

export function setPluginStateSyncHook(hook: PluginStateSyncHook): void {
  stateSyncHook = hook
}

export function registerPluginsIpc(): void {
  ipcMain.handle(IPC_PLUGINS_LIST, () => listEntries())

  // 同步取启用清单：渲染层首帧要靠它决定「只装载用户启用的内置插件」，
  // 否则会先按默认值装载一遍再卸载（见 protocol.ts 里该常量的说明）。
  // listEntries 本身是同步的（读 electron-store + 同步扫插件目录），可以直接当返回值。
  ipcMain.on(IPC_PLUGINS_LIST_SYNC, (event) => {
    try {
      event.returnValue = listEntries()
    } catch (err) {
      logger.warn('[Plugins] 同步插件清单失败:', err)
      event.returnValue = []
    }
  })

  ipcMain.handle(IPC_PLUGINS_SET_ENABLED, (_event, id: unknown, enabled: unknown) => {
    if (typeof id !== 'string' || typeof enabled !== 'boolean') {
      throw new Error('plugins-set-enabled 参数非法')
    }
    const entry = listEntries().find((e) => e.id === id)
    if (!entry) {
      throw new Error(`插件 '${id}' 不存在`)
    }
    setEnabledOverride(id, enabled)
    logger.info(`[Plugins] ${id} → ${enabled ? '启用' : '停用'}`)
    if (entry.builtin) {
      // 主进程侧同名注册/注销该插件的内置 IPC 组（渲染层由广播即时装载/卸载）
      stateSyncHook?.(id, enabled)
    } else {
      // 外部插件：加载/卸载主进程模块（renderer 侧由广播驱动 loader）
      if (enabled) loadExternalMain(id)
      else unloadExternalMain(id)
    }
    broadcastPluginStateChanged()
    return listEntries()
  })

  ipcMain.handle(IPC_PLUGINS_INSTALL, async () => {
    try {
      const id = await installExternalPlugin()
      return { ok: true, id }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn('[Plugins] 安装失败:', msg)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle(IPC_PLUGINS_UNINSTALL, (_event, id: unknown) => {
    if (typeof id !== 'string') throw new Error('plugins-uninstall 参数非法')
    uninstallExternalPlugin(id)
    return listEntries()
  })
}
