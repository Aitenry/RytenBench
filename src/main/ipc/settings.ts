import { ipcMain } from 'electron'
import logger from 'electron-log'
import { settingsStore } from '../context'
import { awaitInitialized } from '../database/instance'
import { SystemSettings } from '../types/settings'
import { syncTrayState } from '../tray'

/** 系统设置 + 锁屏 IPC */
export function registerSettingsIpc(): void {
  ipcMain.handle('lock-screen-code', async () => {
    try {
      await awaitInitialized()
      // 返回完整 lock 对象 { code, view }（修复：此前 `as string` 类型谎言,
      // 运行时返回对象而类型声明与 preload d.ts 互相矛盾）
      return settingsStore.get('lock')
    } catch (error) {
      console.error('Error in lock-screen-code:', error)
      throw error
    }
  })

  ipcMain.handle('lock-screen-view', async (_event, open: boolean) => {
    try {
      const lock = settingsStore.get('lock') as { code: string; view: boolean } | undefined
      if (lock) {
        lock.view = open
        settingsStore.set('lock', lock)
      }
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
        tray: all.tray,
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
      // 键白名单（修复：此前任意顶层键/类型直接落盘——拼错键被永久持久化，
      // 或把 lock/chat/graph 整键写成非对象,下游读取无兜底）
      const ALLOWED_KEYS: Array<keyof SystemSettings> = [
        'ip',
        'lock',
        'graph',
        'chat',
        'defaultModelId',
        'defaultEmbeddingModelId',
        'musicDirectory',
        'theme',
        'tray',
        'weatherRefreshInterval',
        'weatherLastFetched',
        'weatherData'
      ]
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined) continue
        if (!ALLOWED_KEYS.includes(key as keyof SystemSettings)) {
          logger.warn(`[Settings] 拒绝未知设置键: ${key}`)
          continue
        }
        // 对于对象类型的设置（如 chat），与现有值合并而非替换
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const existing = settingsStore.get(key as keyof SystemSettings) as
            Record<string, unknown> | undefined
          settingsStore.set(key as keyof SystemSettings, { ...(existing ?? {}), ...value } as never)
        } else {
          settingsStore.set(key as keyof SystemSettings, value)
        }
      }
      // 托盘设置变化时即时同步（关闭行为 / 菜单勾选态）
      if ('tray' in updates) {
        syncTrayState()
      }
      logger.info('System settings updated:', Object.keys(updates).join(', '))
      return true
    } catch (error) {
      logger.error('Error in system-settings-update:', error)
      throw error
    }
  })
}
