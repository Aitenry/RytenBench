import { ipcMain } from 'electron'

/**
 * IPC 捕获器：登记期内把 ipcMain.handle / ipcMain.on 的调用捕获下来，
 * 返回的 dispose 一次性注销全部已注册通道（handle → removeHandler；on → removeListener）。
 *
 * 说明：不改动 15 个 ipc/*.ts 的内部实现（它们直接调用 ipcMain），
 * 而是短暂替换 ipcMain 的两个方法收集通道名——插件启停即注册/注销对应 IPC，
 * 语义等同「注册函数返回 dispose」。
 */

interface CapturedIpc {
  handleChannels: string[]
  listeners: Array<{ channel: string; fn: (...args: unknown[]) => void }>
}

export function captureIpc(register: () => void): () => void {
  const captured: CapturedIpc = { handleChannels: [], listeners: [] }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ipc = ipcMain as any
  // 原方法来自 EventEmitter 原型，摘出后必须绑定接收者：
  // 未绑定时 origOn(...) 内部读 this._events 会得到 undefined → TypeError
  const origHandle = (ipc.handle as (channel: string, listener: unknown) => void).bind(ipc)
  const origOn = (ipc.on as (channel: string, listener: unknown) => unknown).bind(ipc)

  ipc.handle = (channel: string, listener: unknown): void => {
    captured.handleChannels.push(channel)
    origHandle(channel, listener)
  }
  ipc.on = (channel: string, listener: (...args: unknown[]) => void): unknown => {
    const wrapped = (...args: unknown[]): void => {
      ;(listener as (...a: unknown[]) => void)(...args)
    }
    captured.listeners.push({ channel, fn: wrapped })
    return origOn(channel, wrapped)
  }

  try {
    register()
  } finally {
    ipc.handle = origHandle
    ipc.on = origOn
  }

  return () => {
    for (const channel of captured.handleChannels) {
      try {
        ipcMain.removeHandler(channel)
      } catch {
        // handler 可能已被移除（重复注册保护），忽略
      }
    }
    for (const { channel, fn } of captured.listeners) {
      try {
        ipcMain.removeListener(channel, fn)
      } catch {
        // 同上
      }
    }
  }
}
