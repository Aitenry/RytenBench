import { ipcMain } from 'electron'
import logger from 'electron-log'
import { settingsStore } from '../context'
import { awaitInitialized } from '../database/instance'
import { SystemSettings } from '../types/settings'

/** 系统设置 + 锁屏 IPC */
export function registerSettingsIpc(): void {
  ipcMain.handle('lock-screen-code', async () => {
    try {
      await awaitInitialized()
      return settingsStore.get('lock') as string
    } catch (error) {
      console.error('Error in lock-screen-code:', error)
      throw error
    }
  })

  ipcMain.handle('lock-screen-view', async (_event, open: boolean) => {
    try {
      const lock = settingsStore.get('lock')
      lock.view = open
      settingsStore.set('lock', lock)
    } catch (error) {
      console.error('Error in lock-screen-view:', error)
      throw error
    }
  })

  ipcMain.handle('system-settings-get-all', async () => {
    try {
      await awaitInitialized()
      const all = settingsStore.store
      // 不暴露 provider-keystore 内部数据给前端
      return {
        ip: all.ip,
        lock: all.lock,
        graph: all.graph,
        chat: all.chat,
        defaultModelId: all.defaultModelId,
        defaultEmbeddingModelId: all.defaultEmbeddingModelId,
        musicDirectory: all.musicDirectory,
        theme: all.theme,
        weatherRefreshInterval: all.weatherRefreshInterval,
        weatherLastFetched: all.weatherLastFetched,
        weatherData: all.weatherData
      } as SystemSettings
    } catch (error) {
      logger.error('Error in system-settings-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('system-settings-update', async (_event, updates: Partial<SystemSettings>) => {
    try {
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          // 对于对象类型的设置（如 chat），与现有值合并而非替换
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const existing = settingsStore.get(key as keyof SystemSettings) as
              Record<string, unknown> | undefined
            settingsStore.set(key as keyof SystemSettings, { ...existing, ...value } as never)
          } else {
            settingsStore.set(key as keyof SystemSettings, value)
          }
        }
      }
      logger.info('System settings updated:', Object.keys(updates).join(', '))
      return true
    } catch (error) {
      logger.error('Error in system-settings-update:', error)
      throw error
    }
  })
}
