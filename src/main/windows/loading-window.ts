import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/icon.png?asset'
import logger from 'electron-log'
import { createDatabase, listSqlFiles } from '../database/loading'
import { migrateWorkspaceData } from '../database/workspace-migration'
import { getDatabaseRef, setDatabaseInstance, setInitializationPromise } from '../database/instance'
import { initKeystore } from '../crypto/provider-key'
import { settingsStore } from '../context'
import { GraphSettings, ChatSettings } from '../types/settings'
import { getIp } from '../address'
import { preloadChatData } from '../chat/preload-cache'
import { getLoadingWindow, markInitComplete, setLoadingWindow } from './window-manager'

/** 加载窗口初始化进度（步骤名 + 细粒度百分比，逐步推进） */
function sendInitProgress(
  currentTask: string,
  progress: number,
  taskIndex: number,
  totalTasks: number
): void {
  const loadingWindow = getLoadingWindow()
  if (!loadingWindow) return
  loadingWindow.webContents.send('init-progress', {
    currentTask,
    progress: Math.round(progress),
    taskIndex,
    totalTasks
  })
}

async function loadConfig(): Promise<void> {
  const ipConfig = settingsStore.get('ip')
  const lockPermission = settingsStore.get('lock')
  const graphConfig = settingsStore.get('graph')
  const chatConfig = settingsStore.get('chat')
  const configPromises: Promise<void>[] = []

  if (!ipConfig) {
    // IP 数据非关键依赖，后台静默获取，不阻塞初始化
    getIp()
      .then((ip) => {
        if (ip) settingsStore.set('ip', ip)
      })
      .catch(() => {})
  }
  if (!lockPermission) {
    configPromises.push(
      Promise.resolve().then(() => {
        settingsStore.set('lock', { code: 'e10adc3949ba59abbe56e057f20f883e', view: false })
      })
    )
  }
  if (!graphConfig) {
    configPromises.push(
      Promise.resolve().then(() => {
        settingsStore.set('graph', {
          maxConcurrency: 8,
          enableGleaning: true,
          gleaningThreshold: 50,
          maxChunkSize: 2000
        } as GraphSettings)
      })
    )
  }
  if (!chatConfig) {
    configPromises.push(
      Promise.resolve().then(() => {
        settingsStore.set('chat', {} as ChatSettings)
      })
    )
  }

  try {
    await Promise.all(configPromises)
  } catch (error) {
    logger.error('Error loading config:', error)
  }
}

async function performInitializationTasks(): Promise<void> {
  // 扁平化初始化步骤：配置 / 密钥库 / 连接数据库 / 逐表建表（每表一步）/ 工作区迁移。
  // 进度条按步骤均匀推进（每步约 3~4%），细粒度、逐步增长，避免整任务一步跳到 25%。
  const sqlFiles = await listSqlFiles()
  const steps: { name: string; execute: () => Promise<void> | void }[] = [
    { name: '加载配置', execute: async () => await loadConfig() },
    {
      name: '初始化密钥库',
      execute: async () => {
        initKeystore()
      }
    },
    {
      name: '连接数据库',
      execute: async () => {
        setDatabaseInstance(await createDatabase())
      }
    },
    // 每个表一个步骤（按文件名排序，保证外键依赖顺序）
    ...sqlFiles.map((file) => ({
      name: `建表 ${file.tableName}`,
      execute: async () => {
        await getDatabaseRef()!.executeTable(file)
      }
    })),
    {
      name: '初始化工作区',
      execute: async () => {
        const db = getDatabaseRef()
        if (!db) return
        const result = await migrateWorkspaceData(db.getDatabase(), () => {
          const chat = settingsStore.get('chat') as ChatSettings | undefined
          return chat?.activeWorkspaceId
        })
        // 把迁移确定的活动工作区写回设置（自动创建的默认工作区同时写入路径）
        const chat = settingsStore.get('chat') as ChatSettings | undefined
        const next: ChatSettings = { ...(chat ?? ({} as ChatSettings)) }
        if (
          next.activeWorkspaceId !== result.activeWorkspaceId ||
          (result.defaultPath && !next.workspacePath)
        ) {
          next.activeWorkspaceId = result.activeWorkspaceId
          if (result.defaultPath && !next.workspacePath) {
            next.workspacePath = result.defaultPath
          }
          settingsStore.set('chat', next)
        }
        logger.info(`[Init] Workspace migration done, active workspace=${result.activeWorkspaceId}`)
      }
    }
  ]

  for (let i = 0; i < steps.length; i++) {
    // 步骤起始进度：已完成 i 步 / 总步数，每步只推进一小格
    sendInitProgress(steps[i].name, (i / steps.length) * 100, i + 1, steps.length)
    await steps[i].execute()
  }

  // 全部步骤完成
  sendInitProgress('初始化完成', 100, steps.length, steps.length)
}

export async function createLoadingWindow(): Promise<void> {
  const loadingWindow = new BrowserWindow({
    width: 360,
    height: 230,
    frame: false,
    transparent: true,
    resizable: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    ...{ icon },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // 防止 occluded/后台时渲染进程定时器被节流（loading 页的 notifyInitComplete 回发会因此延迟数秒，
      // 导致「初始化完成 → 主窗口交接」被拖慢）
      backgroundThrottling: false
    }
  })
  setLoadingWindow(loadingWindow)

  loadingWindow.setMenu(null)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    await loadingWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/resource/loading.html`)
  } else {
    await loadingWindow.loadFile(join(__dirname, '../renderer/resource/loading.html'))
  }
  logger.info('[Window] Loading window ready')

  // 加载页回发的交接信号（兜底）：正常路径由下方 performInitializationTasks 的 .then 直接驱动
  ipcMain.once('init-complete', () => {
    logger.info('[Window] Init complete signal received (fallback)')
    markInitComplete()
  })

  const initPromise = performInitializationTasks()
    .then(async () => {
      logger.info('All initialization tasks completed.')
      // 预加载 ChatProvider 所需数据，不阻塞交接
      preloadChatData()
      // 通知加载页显示完成状态（纯 UI 提示；不依赖其回发驱动交接——
      // 加载页定时器可能被后台节流延迟数秒，交接由主进程直接控制）
      const win = getLoadingWindow()
      if (win) {
        win.webContents.send('init-complete')
      }
      markInitComplete()
    })
    .catch((err) => {
      logger.error('Initialization failed:', err)
      const win = getLoadingWindow()
      if (win) {
        win.webContents.send('init-error', err.message)
      }
    })
  setInitializationPromise(initPromise)

  // 注意：此处不再等待初始化完成——调用方紧接着会预热主窗口（隐藏），
  // 让渲染进程加载与数据库初始化并行，消除「加载窗口结束后再等主窗口」的空白期
}
