import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import logger from 'electron-log'
import {
  clearEnabledOverride,
  clearUninstalled,
  getEnabledOverride,
  setEnabledOverride
} from '../plugins/store'
import { BUILTIN_PLUGIN_MANIFESTS } from '../../plugins/manifests'
import { isPluginInstalled, scanExternalPlugins } from '../plugins/scanner'
import { installExternalPlugin, uninstallExternalPlugin } from '../plugins/lifecycle'
import {
  isBundledPluginId,
  isEnabledPlugin,
  loadExternalMain,
  pluginLoadInfo,
  unloadExternalMain
} from '../plugins/host'
import {
  bundledPluginDir,
  installBundledPlugin,
  listBundledPluginIds,
  removeBundledPlugin
} from '../plugins/installer'
import { isPackageReady } from '../plugins/packaged'
import { pluginPurge } from '../plugins/contributions'
import {
  IPC_PLUGIN_HOST_UI_EXPORTS,
  IPC_PLUGIN_STATE_CHANGED,
  IPC_PLUGINS_INSTALL,
  IPC_PLUGINS_LIST,
  IPC_PLUGINS_LIST_SYNC,
  IPC_PLUGINS_LOADED_FROM,
  IPC_PLUGINS_SET_ENABLED,
  IPC_PLUGINS_UNINSTALL
} from '../../shared/plugin/protocol'
import type { PluginListEntry } from '../../shared/plugin/types'
import { setHostUiExports } from '../plugins/host-ui-bridge'

/**
 * 插件管理 IPC（core，始终注册）。
 *
 * 列表口径（P1 起）：**一切以 `userData/plugins/<id>/` 里装了什么为准**——
 * - 「内置（bundled）」= 应用包里带着、可以随时重装（`bundled: true`）；
 * - 「第三方」= 用户自己放进去的；
 * - 内置插件**只有在已安装**（目录存在）时才进列表；未安装的内置插件出现在
 *   「可安装的内置插件」区（同一条目 `bundled: true, installed: false`）。
 *
 * 启停/安装/卸载都会广播 `plugin-state-changed`，渲染层据此重新拉清单并 diff 装载。
 */

/** 已安装插件与启用态（内置默认启用、第三方默认停用） */
function listEntries(): PluginListEntry[] {
  const entries: PluginListEntry[] = []

  // ① 已安装的插件：内置铺包与第三方走同一个扫描结果，天然去重（都看 userData/plugins/<id>）
  for (const ext of scanExternalPlugins()) {
    const bundled = isBundledPluginId(ext.id)
    const enabled = isEnabledPlugin(ext.id)
    entries.push({
      id: ext.id,
      name: ext.manifest.name,
      version: ext.manifest.version,
      description: ext.manifest.description,
      icon: ext.manifest.icon,
      // builtin 保留原语义（「随应用分发」的展示标签），bundled 是同一件事的显式字段
      builtin: bundled,
      bundled,
      installed: true,
      enabled,
      state: enabled ? 'active' : 'inactive',
      entry: ext.manifest.entry,
      // 清单里的路由/菜单元数据：渲染层首帧据此声明式预注册（见 shared/plugin/types.ts）
      routes: ext.manifest.routes,
      menu: ext.manifest.menu
    })
  }

  // ② 未安装的内置插件：应用包里有包、但目录没铺（用户卸载过）→ 供面板给「安装」按钮
  for (const id of bundledPluginIdsFromPackage()) {
    // 过渡（P1 建、P2 加 planner、P3 加 home）：只把**宿主运行时接口已就绪**的内置包列为「可安装」。
    // 剩下那个（P4 才补接口）即使应用包里有产物，也不该被装进来——
    // 装了会在装载期找不到 @host/main/** 而整体失败；它们此刻正由静态注册表装载。
    if (!isPackageReady(id)) continue
    if (entries.some((e) => e.id === id)) continue
    const manifest = bundledManifest(id)
    if (!manifest) continue
    entries.push({
      id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      icon: manifest.icon,
      builtin: true,
      bundled: true,
      installed: false,
      enabled: false,
      state: 'inactive',
      routes: manifest.routes,
      menu: manifest.menu
    })
  }

  // ③ 过渡（P1 建、P2 加 planner、P3 加 home）：**尚未迁到磁盘包**的内置插件仍按静态清单列出并可用。
  //
  // 为什么需要这一条：本方案是一轮一个插件搬（P2/P3/P4），宿主运行时表（runtime.ts）与
  // 渲染层宿主 UI 表（host-ui.ts）也只按轮次补齐。在某个插件搬走之前，它既不在
  // `userData/plugins/`（没铺包）也不该从清单里消失——否则渲染层拿不到它的启用态，
  // 会把它当成「未安装」而整块卸载（菜单/路由/设置页全没）。
  // 所以：`isPackageReady(id)` 为 false 的内置插件照旧由静态注册表装载、按清单列出。
  // P5 删掉这段与 `packaged.ts`，改为全部走磁盘包。
  for (const manifest of BUILTIN_PLUGIN_MANIFESTS) {
    if (isPackageReady(manifest.id)) continue
    if (entries.some((e) => e.id === manifest.id)) continue
    const enabled = getEnabledOverride(manifest.id) ?? true
    entries.push({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      icon: manifest.icon,
      builtin: true,
      // bundled=false：面板据此不显示「卸载」（它还没有磁盘包可删）
      bundled: false,
      installed: true,
      enabled,
      state: enabled ? 'active' : 'inactive',
      // 静态内置插件在渲染层构造期就完成真实注册，这两项只是让「首帧声明」对四类插件
      // 口径一致（真实注册优先，声明项会被合并掉）
      routes: manifest.routes,
      menu: manifest.menu
    })
  }

  return entries
}

/**
 * 应用包里的内置插件 id（读 `resources/plugins/` 下的插件包目录）。
 *
 * 用包里的清单而不是静态 `BUILTIN_PLUGIN_MANIFESTS`：面板要显示的是
 * **能装回来的那个包**的信息（版本可能与源码不同），而且这样 core 侧不必认识任何插件。
 */
function bundledPluginIdsFromPackage(): string[] {
  return listBundledPluginIds()
}

/**
 * 读应用包里某插件的清单（读不到返回 null）。
 *
 * 除展示字段外一并带回 `routes`/`menu`：它们是渲染层**首帧声明式预注册**的输入
 * （未安装的插件在安装前也要能在面板里说清「装回来会有什么菜单」）。
 */
function bundledManifest(id: string): {
  name: string
  version: string
  description?: string
  icon?: string
  routes?: { path: string; skeleton?: string }[]
  menu?: { key: string; labelKey: string; icon: string; order?: number }
} | null {
  const dir = bundledPluginDir(id)
  if (!dir) return null
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf-8')) as {
      name?: string
      version?: string
      description?: string
      icon?: string
      routes?: { path: string; skeleton?: string }[]
      menu?: { key: string; labelKey: string; icon: string; order?: number }
    }
    if (!raw.name || !raw.version) return null
    return {
      name: raw.name,
      version: raw.version,
      description: raw.description,
      icon: raw.icon,
      routes: raw.routes,
      menu: raw.menu
    }
  } catch (err) {
    logger.warn(`[Plugins] 读取内置插件包清单失败: ${id}`, err)
    return null
  }
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

/** 启停某插件的主进程侧：静态内置走钩子，磁盘包走 load/unloadExternalMain */
function applyEnabled(id: string, enabled: boolean): void {
  // 静态内置与磁盘包是**互斥**的两条路径，判据必须与 builtin.ts 的遮蔽规则一致：
  // 该插件本轮已可打包（isPackageReady）**且**确实装在 userData 里（isPluginInstalled）时，
  // 静态模块不会被登记，才从磁盘包装载。否则（例如 P1~P3 里的 harness：
  // 应用包里有包但没装到 userData）就只能走静态钩子——早先按「应用包里有目录」判断，
  // 会去 loadExternalMain 一个并不存在的已安装插件，抛「外部插件 'harness' 未找到」。
  if (enabled) {
    stateSyncHook?.(id, true)
    if (!isPackageReady(id) || !isPluginInstalled(id)) return
    loadExternalMain(id)
  } else {
    stateSyncHook?.(id, false)
    unloadExternalMain(id)
  }
}

/**
 * 卸载插件（含数据询问的最终执行）。
 *
 * @param purgeData 用户口径：`false` = 选择「保留数据」→ **不是卸载**，直接拒绝；
 *                  `true` = 选择「不保留数据」→ 先清数据、再摘除装载、最后删目录。
 *
 * 顺序有讲究：
 * ① `plugin.purge` 贡献必须在**插件仍装载**时调用（它要读自己的 mapper / 托管目录）；
 * ② 摘除 IPC（`stateSyncHook` + `unloadExternalMain`）：渲染层随后由广播驱动卸载；
 * ③ 删 `userData/plugins/<id>/`；④ 记 `uninstalled`、清启用覆写；⑤ 广播。
 */
async function uninstallPlugin(id: string, purgeData: boolean): Promise<PluginListEntry[]> {
  if (!listEntries().some((e) => e.id === id)) {
    throw new Error(`插件 '${id}' 未安装，无法卸载`)
  }
  if (!purgeData) {
    throw new Error(
      `已取消卸载：卸载 '${id}' 必须同时清除它的数据（表内记录与应用托管的文件）。` +
        `若想保留数据，请勿卸载；也可以先停用该插件。`
    )
  }

  // ① 清数据（插件自己实现；没贡献 purge 的插件跳过）
  const purge = pluginPurge(id)
  if (purge) {
    try {
      await purge.run()
      logger.info(`[Plugins] ${id} 数据已清除（${purge.label}）`)
    } catch (err) {
      // 清数据失败不阻断卸载：目录/通道该摘的仍要摘，否则会留下「装不了也卸不掉」的死状态
      logger.error(`[Plugins] ${id} 清除数据失败（继续卸载）:`, err)
    }
  } else {
    logger.warn(`[Plugins] ${id} 没有 plugin.purge 贡献，数据未被清除（只删目录）`)
  }

  // ② 摘除主进程装载（含静态内置钩子与磁盘包模块）
  stateSyncHook?.(id, false)
  unloadExternalMain(id)

  // ③ 删目录
  //
  // 内置插件必须走 `removeBundledPlugin`：它除了删目录还会写 `uninstalled` 记录。
  // 早先这里不分来源一律调第三方的 `uninstallExternalPlugin`（只删目录、不记账），
  // 于是**卸载后重启会被 `ensureBundledPluginsInstalled()` 立刻铺回来**——「物理卸载」
  // 退化成「卸载后自动复活」（2026-09-26 工装实测：plugins.json 里没有 uninstalled）。
  if (isBundledPluginId(id)) {
    removeBundledPlugin(id)
    clearEnabledOverride(id)
  } else {
    uninstallExternalPlugin(id)
  }

  logger.info(`[Plugins] 插件已卸载: ${id}`)
  broadcastPluginStateChanged()
  return listEntries()
}

/**
 * 安装（重装）内置插件：从应用包 copy 回 `userData/plugins/<id>/`。
 * 第三方插件不走这里（它们由「安装插件」目录选择流程处理）。
 */
function installPlugin(id: string): PluginListEntry[] {
  if (!isBundledPluginId(id)) {
    throw new Error(`'${id}' 不是随应用分发的内置插件，请用「安装插件」选择目录安装`)
  }
  if (!isPackageReady(id)) {
    // 过渡（P1 建、P2 加 planner、P3 加 home）：只有宿主运行时接口已补齐的插件能装。harness 继续走
    // 静态注册表，现在把它们铺到 userData 会因为在装载期找不到 @host/main/** 而整体失败。
    throw new Error(`插件 '${id}' 暂不支持从应用包安装（宿主运行时接口将在后续轮次补齐）`)
  }
  if (!bundledPluginDir(id)) {
    throw new Error(
      `应用包里找不到插件 '${id}'（resources/plugins/${id}）。` +
        `开发环境下请先运行 node scripts/build-plugins.mjs 生成插件包。`
    )
  }
  installBundledPlugin(id, true)
  clearUninstalled(id)
  // 重装后按默认启用态装载（内置默认启用；用户此前显式停用过就保持停用）
  if (isEnabledPlugin(id)) {
    try {
      if (isBundledPluginId(id)) stateSyncHook?.(id, true)
      loadExternalMain(id)
    } catch (err) {
      logger.error(`[Plugins] 插件 '${id}' 重装后装载失败:`, err)
      throw new Error(
        `插件 '${id}' 已安装，但装载失败：${err instanceof Error ? err.message : err}`
      )
    }
  }
  logger.info(`[Plugins] 插件已安装: ${id}`)
  broadcastPluginStateChanged()
  return listEntries()
}

export function registerPluginsIpc(): void {
  ipcMain.handle(IPC_PLUGINS_LIST, () => listEntries())

  // 同步取启用清单：渲染层首帧要靠它决定「只装载用户启用的插件」，
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

  // 渲染层启动最早期上报宿主 UI 表的「键 → 导出名」（plugin://host/ui.js 桥据此生成）
  ipcMain.on(IPC_PLUGIN_HOST_UI_EXPORTS, (_event, names: unknown) => {
    setHostUiExports(names)
    logger.info(
      `[Plugins] 宿主 UI 表已上报：${Object.keys((names ?? {}) as object).length} 个模块键`
    )
  })

  // 只读诊断：插件主模块的装载来源（工装核对「music 是否由磁盘包接管」）
  ipcMain.handle(IPC_PLUGINS_LOADED_FROM, () => pluginLoadInfo())

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
    applyEnabled(id, enabled)
    broadcastPluginStateChanged()
    return listEntries()
  })

  ipcMain.handle(IPC_PLUGINS_INSTALL, async (_event, id: unknown) => {
    // 无参数 = 第三方插件「选目录安装」；带 id = 重装内置插件
    if (id === undefined || id === null) {
      try {
        const installed = await installExternalPlugin()
        return { ok: true, id: installed }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn('[Plugins] 安装失败:', msg)
        return { ok: false, error: msg }
      }
    }
    if (typeof id !== 'string') {
      throw new Error('plugins-install 参数非法')
    }
    try {
      installPlugin(id)
      return { ok: true, id }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn(`[Plugins] 安装内置插件 '${id}' 失败:`, msg)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle(IPC_PLUGINS_UNINSTALL, async (_event, id: unknown, purgeData: unknown) => {
    if (typeof id !== 'string') throw new Error('plugins-uninstall 参数非法')
    if (typeof purgeData !== 'boolean') {
      throw new Error('plugins-uninstall 需要第二个参数 purgeData（是否清除插件数据）')
    }
    return await uninstallPlugin(id, purgeData)
  })
}
