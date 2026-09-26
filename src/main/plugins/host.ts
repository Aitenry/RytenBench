import { BrowserWindow, ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import logger from 'electron-log'
import { getEnabledOverride } from './store'
import { findExternalPlugin, isPluginInstalled, scanExternalPlugins } from './scanner'
import { ensureBundledPluginsInstalled } from './installer'
import { installHostRuntime } from './runtime'
import { registerCoreIpc } from '../ipc'
import { BUILTIN_PLUGIN_MANIFESTS } from '../../plugins/manifests'
import { builtinMainModules } from './builtin'
import { MainPluginContextImpl } from './context'
import { IPC_PLUGIN_CHANNELS_SYNC, IPC_PLUGIN_CHANNELS_UPDATED } from '../../shared/plugin/protocol'

/**
 * 主进程插件宿主。
 *
 * 只有**一条**装载路径（内置与外部插件完全相同）：
 * `src/plugins/<id>/main/index.ts` 导出 `install(ctx)`，通道经
 * `ctx.registerIpc({ 'plugin:<ns>:...': handler })` 注册，停用时 `ctx.dispose()`
 * 一次性回滚（效果 LIFO + 通道摘除 + 贡献摘除）。
 *
 * core 的角色到此为止：注册自己的 IPC（`registerCoreIpc`）、按持久化启用态装载/卸载插件、
 * 把通道清单推给 preload 白名单。core 不认识任何插件模块，也不认识任何插件通道名。
 *
 * 旧路径（`src/main/ipc/index.ts` 的 builtinIpcGroups + `ipc-capture.ts` 猴补丁）已随
 * core 收尾整体删除。
 */

/** 已装配的内置插件主模块 */
const builtinPlugins = new Map<string, { ctx: MainPluginContextImpl; teardown: () => void }>()

/** 已装载的外部插件主模块 */
const externalMains = new Map<string, { ctx: MainPluginContextImpl; teardown: () => void }>()

/** 内置插件组的启用默认值（内置默认启用） */
export function isBuiltinPluginEnabled(id: string): boolean {
  return getEnabledOverride(id) ?? true
}

/** 注册某插件的主模块（幂等；未登记的内置 id 只记日志） */
export function registerPluginIpc(id: string): void {
  if (builtinPlugins.has(id)) return

  const module = builtinMainModules[id]
  if (!module) {
    logger.warn(`[Plugins] 无内置主模块: ${id}`)
    return
  }

  const ctx = new MainPluginContextImpl(id)
  let dispose: void | (() => void)
  try {
    dispose = module.install(ctx)
  } catch (err) {
    ctx.dispose()
    logger.error(`[Plugins] ${id} 主模块装载失败:`, err)
    throw err
  }
  builtinPlugins.set(id, { ctx, teardown: () => runTeardown(id, dispose, ctx) })
  logger.info(`[Plugins] 主模块装载: ${id}（通道 ${ctx.channels.length} 个）`)
  pushPluginChannels()
}

/** 注销某插件的主模块（幂等） */
export function disposePluginIpc(id: string): void {
  const entry = builtinPlugins.get(id)
  if (!entry) return
  entry.teardown()
  builtinPlugins.delete(id)
  logger.info(`[Plugins] 主模块卸载: ${id}`)
  pushPluginChannels()
}

/** install 返回的 dispose 先跑，再回滚 ctx.effect 登记的效果、通道与贡献 */
function runTeardown(id: string, dispose: void | (() => void), ctx: MainPluginContextImpl): void {
  if (typeof dispose === 'function') {
    try {
      dispose()
    } catch (err) {
      logger.warn(`[Plugins] ${id} install dispose 异常:`, err)
    }
  }
  ctx.dispose()
}

/** diff 同步：enabled → 注册；disabled → 注销（core 不受影响） */
export function syncBuiltinPluginIpcs(next: Record<string, boolean>, ids: string[]): void {
  for (const id of ids) {
    const enabled = Boolean(next[id])
    if (enabled) registerPluginIpc(id)
    else disposePluginIpc(id)
  }
}

/**
 * 应用启动：注册 core IPC + preload 通道同步入口 + 按启用态装载内置插件 + 装载已启用的外部插件。
 *
 * 顺序有意义：`registerCoreIpc()` 与 preload 通道同步入口（`plugin-channels-sync`）
 * 都必须在任何窗口创建之前完成——preload 先于页面脚本执行，它用同步 IPC 取回白名单，
 * 拿不到就会把首个插件订阅判为「通道未启用」。
 */
export function initPluginHost(): void {
  // 顺序不可换：
  // ① 宿主运行时表（`globalThis.__RB_HOST_RESOLVE__`）必须在**任何插件 main.cjs 被 require
  //    之前**挂上——插件包里的 `require('@host/main/x')` 会立刻调它；
  // ② 首次安装把应用包里的插件铺到 userData/plugins/，之后的扫描/装载就只剩「磁盘包」一条路径；
  // ③ core 自己的 IPC 与 preload 的通道同步入口（都必须在窗口创建之前）。
  installHostRuntime()
  ensureBundledPluginsInstalled()
  registerCoreIpc()
  registerPluginChannelsSync()
  for (const id of Object.keys(builtinMainModules)) {
    if (!isBuiltinPluginEnabled(id)) continue
    try {
      registerPluginIpc(id)
    } catch (err) {
      // 单个插件装配失败不拖垮启动：渲染层拿到的是「已启用但通道不存在」，
      // 插件面板里会显示该插件状态；运行期启停走 plugins-set-enabled（错误会回抛给界面）
      logger.error(`[Plugins] ${id} 启动装配失败:`, err)
    }
  }
  initExternalMains()
}

// ---------- 通道清单（preload 白名单 + 事件订阅门控） ----------

/** 当前全部已启用插件（内置 + 外部）占用的通道 */
export function activePluginChannels(): string[] {
  return [
    ...[...builtinPlugins.values()].flatMap((e) => e.ctx.channels),
    ...[...externalMains.values()].flatMap((e) => e.ctx.channels)
  ]
}

/**
 * 把已启用插件通道推给渲染层（preload 白名单缓存）。
 *
 * 注意：启动期 `initPluginHost()` 早于任何窗口创建，此时推送等于丢掉；
 * 因此窗口 `did-finish-load` 之后必须再推一次（见 main/index.ts 的 browser-window-created）。
 */
export function pushPluginChannels(): void {
  const list = activePluginChannels()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_PLUGIN_CHANNELS_UPDATED, list)
    }
  }
}

/**
 * preload 启动时的**同步**取清单入口（`ipcRenderer.sendSync`）。
 *
 * 必须在任何窗口创建之前注册（`initPluginHost` 的第一件事）：preload 先于页面脚本
 * 执行，用它一次性取回通道白名单，渲染层首个 `window.api.plugin.on(...)` 才不会撞上
 * 「推送还没到」的竞态（插件 Provider 在 useEffect 里订阅事件通道就是这个时机）。
 * 之后的启停变化仍由 `pushPluginChannels()` 增量刷新。
 */
function registerPluginChannelsSync(): void {
  ipcMain.on(IPC_PLUGIN_CHANNELS_SYNC, (event) => {
    event.returnValue = activePluginChannels()
  })
}

// ---------- 外部插件主进程模块 ----------

/** 装载外部插件主进程模块（require CJS，导出的 install 或 { install }） */
export function loadExternalMain(id: string): void {
  if (externalMains.has(id)) return
  const scanned = findExternalPlugin(id)
  if (!scanned) throw new Error(`外部插件 '${id}' 未找到`)
  const entryRel = scanned.manifest.entry?.main ?? 'main.js'
  const abs = path.join(scanned.dir, entryRel)
  if (!fs.existsSync(abs)) return // 允许纯渲染层插件（无主进程代码）

  // 动态 require 外部文件（out/main 为 CJS 产物）
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require(abs) as unknown
  const install: unknown =
    typeof mod === 'function' ? mod : (mod as { install?: unknown } | null)?.install
  if (typeof install !== 'function') {
    throw new Error(`外部插件 '${id}' 主进程入口需导出 install(ctx)`)
  }

  const ctx = new MainPluginContextImpl(id)
  let dispose: void | (() => void)
  try {
    dispose = (install as (c: MainPluginContextImpl) => void | (() => void))(ctx)
  } catch (err) {
    ctx.dispose()
    throw err
  }

  externalMains.set(id, { ctx, teardown: () => runTeardown(id, dispose, ctx) })
  logger.info(`[Plugins] 外部插件主模块装载: ${id}（通道 ${ctx.channels.length} 个）`)
  pushPluginChannels()
}

/** 卸载外部插件主进程模块（注销 IPC + 通道清单推送刷新） */
export function unloadExternalMain(id: string): void {
  const record = externalMains.get(id)
  if (!record) return
  record.teardown()
  externalMains.delete(id)
  logger.info(`[Plugins] 外部插件主模块卸载: ${id}`)
  pushPluginChannels()
}

/** 启动时装载所有已启用的外部插件主模块 */
function initExternalMains(): void {
  for (const scanned of scanExternalPlugins()) {
    if (isEnabledPlugin(scanned.id)) {
      try {
        loadExternalMain(scanned.id)
      } catch (err) {
        logger.warn(`[Plugins] 外部插件 '${scanned.id}' 主模块启动装载失败:`, err)
      }
    }
  }
}

/** 内置插件 id 集合（不 import 插件实现，只借 manifests 的 id 面） */
const BUILTIN_MAIN_IDS: Record<string, true> = Object.fromEntries(
  BUILTIN_PLUGIN_MANIFESTS.map((m) => [m.id, true as const])
)

/**
 * 已安装 plugin id 的**默认启用态**。
 *
 * 内置插件铺包后就走磁盘包这条装载路径，但它们的语义仍是「内置：默认启用」——
 * 若这里按外部插件的默认值（停用）算，首次安装后音乐播放器在重启时就再也不装载了。
 * 第三方插件保持默认停用（用户装完要自己打开）。
 */
export function isBundledPluginId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILTIN_MAIN_IDS, id)
}

/** 已安装插件的最终启用态（显式覆写优先，否则内置默认启用 / 第三方默认停用） */
export function isEnabledPlugin(id: string): boolean {
  const override = getEnabledOverride(id)
  if (override !== undefined) return override
  return isBundledPluginId(id)
}

// ---------- 只读诊断（工装/面板核对「插件到底从哪来」） ----------

/** 某插件主模块的装载来源 */
export interface PluginLoadInfo {
  /** userData/plugins/<id>/ 下是否有插件包（内置铺包或第三方） */
  installed: boolean
  /** package = 由磁盘包提供；builtin = 静态注册表回退；absent = 当前未装载 */
  source: 'package' | 'builtin' | 'absent'
  /** 磁盘包主入口绝对路径（installed 时才有；工装用它证明是包在应答） */
  file?: string
}

/**
 * 各插件主模块的装载来源。
 *
 * 为什么需要它：P1 的过渡共存期里同一个插件既可能来自磁盘包、又可能来自静态注册表
 * （dev 没跑打包脚本时的回退），光看「通道可用」分不出来源。这个函数让 CDP 工装能断言
 * 「music 的 handler 确实由 userData/plugins/music/main.cjs 提供」，也能断言
 * 「卸载后目录没了、包来源消失」。
 */
export function pluginLoadInfo(): Record<string, PluginLoadInfo> {
  const out: Record<string, PluginLoadInfo> = {}
  for (const id of externalMains.keys()) {
    const scanned = findExternalPlugin(id)
    const entryRel = scanned?.manifest.entry?.main ?? 'main.js'
    out[id] = {
      installed: true,
      source: 'package',
      ...(scanned ? { file: path.join(scanned.dir, entryRel) } : {})
    }
  }
  for (const id of builtinPlugins.keys()) {
    out[id] = { installed: isPluginInstalled(id), source: 'builtin' }
  }
  // 已铺包但当前停用（未装载）的插件：也如实报 installed，避免工装把「停用」误判成「没装」
  for (const scanned of scanExternalPlugins()) {
    if (out[scanned.id]) continue
    out[scanned.id] = {
      installed: true,
      source: 'absent',
      file: path.join(scanned.dir, scanned.manifest.entry?.main ?? 'main.js')
    }
  }
  return out
}
