import { ipcMain, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import logger from 'electron-log'
import { getEnabledOverride } from './store'
import { captureIpc } from './ipc-capture'
import { findExternalPlugin, scanExternalPlugins } from './scanner'
import { builtinIpcGroups, CORE_IPC_GROUP } from '../ipc'
import { IPC_PLUGIN_CHANNELS_UPDATED } from '../../shared/plugin/protocol'

/**
 * 主进程插件宿主（内置插件 IPC 生命周期）。
 *
 * - core 组（misc/settings/dialog/provider/workspace/graph/plugins）始终注册；
 * - home / planner / music / harness 组随插件启用注册、随停用注销
 *   （captureIpc 捕获登记期内全部通道，dispose 时 removeHandler/removeListener）；
 * - plugins.ts 的启停处理器通过 setPluginStateSyncHook 把状态变化同步到这里。
 *
 * 归属依据（方案 5.1 表）：
 * - graph 属于 core：常驻 BuildProgressProvider 订阅其构建进度事件；
 * - node-position/todo/document/wiki 归属 home；mnemon 归属 harness。
 */

const disposers = new Map<string, () => void>()

/** 内置插件组的启用默认值（内置默认启用） */
export function isBuiltinPluginEnabled(id: string): boolean {
  return getEnabledOverride(id) ?? true
}

/** 注册某插件组的 IPC（幂等） */
export function registerPluginIpc(id: string): void {
  if (disposers.has(id)) return
  const group = builtinIpcGroups[id]
  if (!group) {
    logger.warn(`[Plugins] 无内置 IPC 组: ${id}`)
    return
  }
  disposers.set(id, captureIpc(group))
  logger.info(`[Plugins] IPC 组注册: ${id}`)
}

/** 注销某插件组的 IPC（幂等） */
export function disposePluginIpc(id: string): void {
  const dispose = disposers.get(id)
  if (!dispose) return
  dispose()
  disposers.delete(id)
  logger.info(`[Plugins] IPC 组注销: ${id}`)
}

/** diff 同步：enabled → 注册；disabled → 注销（core 组不受影响） */
export function syncBuiltinPluginIpcs(next: Record<string, boolean>, ids: string[]): void {
  for (const id of ids) {
    const enabled = Boolean(next[id])
    if (enabled) registerPluginIpc(id)
    else disposePluginIpc(id)
  }
}

/** 应用启动：注册 core 组 + 按持久化启用态注册插件组 + 装载已启用的外部插件主模块 */
export function initBuiltinPluginIpcs(): void {
  disposers.set(CORE_IPC_GROUP, captureIpc(builtinIpcGroups[CORE_IPC_GROUP]))
  for (const id of Object.keys(builtinIpcGroups)) {
    if (id === CORE_IPC_GROUP) continue
    if (isBuiltinPluginEnabled(id)) registerPluginIpc(id)
  }
  initExternalMains()
}

// ---------- 外部插件主进程模块 ----------

/** 外部插件主进程 ctx（install(ctx) 的入参） */
export interface MainPluginCtx {
  /** 注册 IPC 通道（须以 plugin:<id>: 开头）；返回注销函数（宿主卸载时统一再走一遍） */
  registerIpc: (
    channels: string[],
    handlers: Record<string, (...args: unknown[]) => unknown | Promise<unknown>>
  ) => () => void
}

interface ExternalMainRecord {
  channels: string[]
  dispose: () => void
}

/** 已装载（=已启用且主模块加载成功）的外部插件主模块 */
const externalMains = new Map<string, ExternalMainRecord>()

/** 当前全部已启用外部插件通道（推送给 preload 做白名单缓存） */
export function activeExternalChannels(): string[] {
  return [...externalMains.values()].flatMap((r) => [...r.channels])
}

/**
 * 把已启用外部插件通道推给渲染层（preload 白名单缓存）。
 *
 * 注意：启动期 `initBuiltinPluginIpcs()` 早于任何窗口创建，此时推送等于丢掉；
 * 因此窗口 `did-finish-load` 之后必须再推一次（见 main/index.ts 的 browser-window-created）。
 */
export function pushExternalPluginChannels(): void {
  const list = activeExternalChannels()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_PLUGIN_CHANNELS_UPDATED, list)
    }
  }
}

/**
 * 通道命名空间：外部插件 id 的惯例是 `plugin.<author>.<name>`，而通道名已带 `plugin:` 前缀，
 * 若直接用整个 id 会得到 `plugin:plugin.demo:*`（与示例插件、文档里的 `plugin:demo:*` 不一致）。
 * 这里统一剥掉 id 开头的 `plugin.` 段：plugin.demo → plugin:demo:*。
 */
function channelNamespace(id: string): string {
  return id.startsWith('plugin.') ? id.slice('plugin.'.length) : id
}

/** 已占用的通道命名空间 → 插件 id（防 'demo' 与 'plugin.demo' 抢同一命名空间） */
const namespaceOwners = new Map<string, string>()

/** 装载外部插件主进程模块（require CJS，导出的 install 或 {install}） */
export function loadExternalMain(id: string): void {
  if (externalMains.has(id)) return
  const scanned = findExternalPlugin(id)
  if (!scanned) throw new Error(`外部插件 '${id}' 未找到`)
  const entryRel = scanned.manifest.entry?.main ?? 'main.js'
  const abs = path.join(scanned.dir, entryRel)
  if (!fs.existsSync(abs)) return // 允许纯渲染层插件（无主进程代码）

  const ns = channelNamespace(id)
  const owner = namespaceOwners.get(ns)
  if (owner && owner !== id) {
    throw new Error(`通道命名空间 'plugin:${ns}:' 已被插件 '${owner}' 占用`)
  }

  // 动态 require 外部文件（out/main 为 CJS 产物，M0 已确认）
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const mod = require(abs) as unknown
  const install: unknown =
    typeof mod === 'function' ? mod : (mod as { install?: unknown } | null)?.install
  if (typeof install !== 'function') {
    throw new Error(`外部插件 '${id}' 主进程入口需导出 install(ctx)`)
  }

  const channels: string[] = []
  const registerIpc: MainPluginCtx['registerIpc'] = (channelList, handlers) => {
    for (const channel of channelList) {
      // 权威校验：通道必须归属当前插件命名空间（配合 preload 白名单）
      if (!channel.startsWith(`plugin:${ns}:`)) {
        throw new Error(`通道 '${channel}' 必须以 plugin:${ns}: 开头`)
      }
      const handler = handlers[channel]
      if (!handler) continue
      channels.push(channel)
      ipcMain.handle(channel, async (_event, ...args: unknown[]) => handler(...args))
    }
    // 注销由外部记录统一执行（dispose），此处幂等空实现
    return () => {}
  }
  const ctx: MainPluginCtx = { registerIpc }
  namespaceOwners.set(ns, id)

  let dispose: (() => void) | undefined
  try {
    const ret = (install as (ctx: MainPluginCtx) => void | (() => void))(ctx)
    if (typeof ret === 'function') dispose = ret
  } catch (err) {
    for (const c of channels) {
      try {
        ipcMain.removeHandler(c)
      } catch {
        // 忽略
      }
    }
    namespaceOwners.delete(ns)
    throw err
  }

  externalMains.set(id, {
    channels,
    dispose: () => {
      if (dispose) {
        try {
          dispose()
        } catch (err) {
          logger.warn(`[Plugins] 外部插件 '${id}' dispose 异常:`, err)
        }
      }
      for (const c of channels) {
        try {
          ipcMain.removeHandler(c)
        } catch {
          // 忽略
        }
      }
      if (namespaceOwners.get(ns) === id) namespaceOwners.delete(ns)
    }
  })
  logger.info(`[Plugins] 外部插件主模块装载: ${id}（通道 ${channels.length} 个）`)
  pushExternalPluginChannels()
}

/** 卸载外部插件主进程模块（注销 IPC + 通道清单推送刷新） */
export function unloadExternalMain(id: string): void {
  const record = externalMains.get(id)
  if (!record) return
  record.dispose()
  externalMains.delete(id)
  logger.info(`[Plugins] 外部插件主模块卸载: ${id}`)
  pushExternalPluginChannels()
}

/** 启动时装载所有已启用的外部插件主模块 */
function initExternalMains(): void {
  for (const scanned of scanExternalPlugins()) {
    if (getEnabledOverride(scanned.id) ?? false) {
      try {
        loadExternalMain(scanned.id)
      } catch (err) {
        logger.warn(`[Plugins] 外部插件 '${scanned.id}' 主模块启动装载失败:`, err)
      }
    }
  }
}
