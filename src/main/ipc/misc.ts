import { ipcMain } from 'electron'
import logger from 'electron-log'

/**
 * 杂项 IPC（core）：心跳与初始化进度日志。
 *
 * 归属变更（harness 轮）：原先这里的 `harness-get-tools`（工具下拉清单）已随 harness 插件
 * 搬进 `src/plugins/harness/main/ipc/harness.ts`，通道名 `plugin:harness:harness-get-tools`
 * （它读的是 harness 的工具注册表 = 本地工具 + 各插件贡献）。
 */
export function registerMiscIpc(): void {
  ipcMain.on('ping', () => logger.info('pong'))

  ipcMain.on('init-progress', (_event, data) => {
    logger.info('Init progress:', data)
  })
}
