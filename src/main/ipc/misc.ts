import { ipcMain } from 'electron'
import logger from 'electron-log'
import { availableTools } from '../harness'

/** 杂项 IPC：心跳、工具列表、初始化进度日志 */
export function registerMiscIpc(): void {
  ipcMain.on('ping', () => logger.info('pong'))

  ipcMain.handle('harness-get-tools', async () => {
    return availableTools
  })

  ipcMain.on('init-progress', (_event, data) => {
    logger.info('Init progress:', data)
  })
}
