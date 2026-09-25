import { ipcMain } from 'electron'
import logger from 'electron-log'

/**
 * 主进程插件上下文（与渲染层 `plugin-host/context.ts` 对称的轻量实现）。
 *
 * 契约（内置插件与外部插件**完全相同**，见 src/plugins/README.md）：
 * - `install(ctx)` 是可逆装配：注册的 IPC 通道与 `ctx.effect` 里登记的效果，
 *   在插件停用/卸载时由宿主一次性回滚（效果 LIFO）；
 * - IPC 通道必须落在本插件命名空间 `plugin:<命名空间>:` 内，宿主权威校验，
 *   防止插件互相顶掉通道（与 preload 的通道白名单同一套规则）；
 * - 插件业务代码可以照常 import 核心模块（orm / settings / workspace 等），
 *   但**不得**在 core 的 ipc 分组表里登记通道——归属与生命周期都由本契约表达。
 */

/** 通道命名空间：插件 id 去掉开头的 `plugin.` 段（plugin.demo → demo） */
export function channelNamespace(id: string): string {
  return id.startsWith('plugin.') ? id.slice('plugin.'.length) : id
}

/**
 * 命名空间占用表：内置 `music` 与外部 `plugin.music` 会映射到同一个 `plugin:music:`，
 * 必须挡住（否则两者互相顶掉通道）。占用在构造时声明、dispose 时释放。
 */
const namespaceOwners = new Map<string, string>()

function claimNamespace(id: string, namespace: string): void {
  const owner = namespaceOwners.get(namespace)
  if (owner && owner !== id) {
    throw new Error(`通道命名空间 'plugin:${namespace}:' 已被插件 '${owner}' 占用`)
  }
  namespaceOwners.set(namespace, id)
}

function releaseNamespace(id: string, namespace: string): void {
  if (namespaceOwners.get(namespace) === id) namespaceOwners.delete(namespace)
}

/** IPC 处理器表：通道名 → 处理函数（参数由渲染层经通用桥传入） */
export type MainIpcHandlers = Record<string, (...args: never[]) => unknown>

export interface MainPluginContext {
  /** 插件 id（manifest.id） */
  readonly id: string
  /** 本插件的通道命名空间（`plugin:<namespace>:` 里的 `<namespace>`） */
  readonly namespace: string
  /** 注册 IPC 处理器；返回只注销本次注册通道的逆操作 */
  registerIpc(handlers: MainIpcHandlers): () => void
  /** 注册可逆效果（例如一个后台服务/定时器），停用时 LIFO 回滚 */
  effect(register: () => void | (() => void)): void
}

export class MainPluginContextImpl implements MainPluginContext {
  readonly namespace: string

  private readonly effects: Array<() => void> = []
  private readonly ownedChannels = new Set<string>()
  private disposed = false

  constructor(readonly id: string) {
    this.namespace = channelNamespace(id)
    claimNamespace(id, this.namespace)
  }

  /** 当前占用的通道（用于日志/诊断） */
  get channels(): string[] {
    return [...this.ownedChannels]
  }

  registerIpc(handlers: MainIpcHandlers): () => void {
    const prefix = `plugin:${this.namespace}:`
    const registered: string[] = []
    try {
      for (const [channel, handler] of Object.entries(handlers)) {
        if (!channel.startsWith(prefix)) {
          throw new Error(`通道 '${channel}' 必须以 ${prefix} 开头`)
        }
        if (typeof handler !== 'function') {
          throw new Error(`通道 '${channel}' 缺少处理函数`)
        }
        ipcMain.handle(channel, async (_event, ...args: unknown[]) => handler(...(args as never[])))
        this.ownedChannels.add(channel)
        registered.push(channel)
      }
    } catch (err) {
      // 半途失败：已注册的先摘掉，避免留下半个插件
      for (const channel of registered) {
        try {
          ipcMain.removeHandler(channel)
        } catch {
          // 忽略
        }
        this.ownedChannels.delete(channel)
      }
      throw err
    }

    return () => {
      for (const channel of registered) {
        try {
          ipcMain.removeHandler(channel)
        } catch {
          // 忽略
        }
        this.ownedChannels.delete(channel)
      }
    }
  }

  effect(register: () => void | (() => void)): void {
    let undo: void | (() => void)
    try {
      undo = register()
    } catch (err) {
      logger.warn(`[Plugins] ${this.id} effect 注册失败:`, err)
      return
    }
    if (typeof undo === 'function') this.effects.push(undo)
  }

  /** 回滚本插件全部效果与通道（幂等） */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    while (this.effects.length > 0) {
      const undo = this.effects.pop()!
      try {
        undo()
      } catch (err) {
        logger.warn(`[Plugins] ${this.id} effect 回滚失败:`, err)
      }
    }
    for (const channel of [...this.ownedChannels]) {
      try {
        ipcMain.removeHandler(channel)
      } catch {
        // 忽略
      }
    }
    this.ownedChannels.clear()
    releaseNamespace(this.id, this.namespace)
  }
}
