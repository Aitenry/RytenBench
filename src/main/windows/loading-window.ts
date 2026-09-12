import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../../resources/logo.png?asset'
import logger from 'electron-log'
import { createDatabase, type Database } from '../database/loading'
import { runMigrations } from '../database/orm'
import { migrateWorkspaceData } from '../database/workspace-migration'
import { setDatabaseInstance, setInitializationPromise } from '../database/instance'
import { initKeystore } from '../crypto/provider-key'
import { settingsStore } from '../context'
import { safeSend } from '../safe-send'
import { GraphSettings, HarnessSettings, TraySettings } from '../types/settings'
import { getIp } from '../address'
import { startWeatherAutoRefresh } from '../weather'
import { preloadHarnessData } from '../harness/preload-cache'
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
  safeSend(loadingWindow.webContents, 'init-progress', {
    currentTask,
    progress: Math.round(progress),
    taskIndex,
    totalTasks
  })
}

/**
 * 旧版本把 AI 助手这段配置存在 `chat` 键下，模块改名后统一用 `harness`。
 * 一次性搬迁：新键已存在就只删旧键，绝不会出现两份配置并存后互相覆盖。
 *
 * 注意：下面这个 'chat' 是**历史键名**，不能跟着模块一起改名——
 * 改了就再也读不到老用户已经存好的技能目录 / 工作区路径 / 记忆目录。
 */
function migrateHarnessSettingsKey(): void {
  const legacy = settingsStore.get('chat') as HarnessSettings | undefined
  if (legacy === undefined) return
  if (settingsStore.get('harness') === undefined) {
    settingsStore.set('harness', legacy)
  }
  settingsStore.delete('chat')
  logger.info('[Init] Migrated legacy "chat" settings key to "harness"')
}

async function loadConfig(): Promise<void> {
  migrateHarnessSettingsKey()
  const ipConfig = settingsStore.get('ip')
  const lockPermission = settingsStore.get('lock')
  const graphConfig = settingsStore.get('graph')
  const harnessConfig = settingsStore.get('harness')
  const configPromises: Promise<void>[] = []

  if (!ipConfig) {
    // IP 数据非关键依赖，后台静默获取，不阻塞初始化
    getIp()
      .then((ip) => {
        if (ip) {
          settingsStore.set('ip', ip)
          // IP 就绪后补建天气自动刷新定时器（修复：主窗口创建时 ip 未到位，
          // startWeatherAutoRefresh 提前 return，定时器本会话永不启动）
          startWeatherAutoRefresh()
        }
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
  if (!harnessConfig) {
    configPromises.push(
      Promise.resolve().then(() => {
        settingsStore.set('harness', {} as HarnessSettings)
      })
    )
  }
  if (!settingsStore.get('tray')) {
    configPromises.push(
      Promise.resolve().then(() => {
        settingsStore.set('tray', { closeToTray: true } as TraySettings)
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
  // 扁平化初始化步骤：配置 / 密钥库 / 连接数据库 / 执行数据库迁移 / 工作区迁移。
  // 进度条按步骤均匀推进，逐步增长，避免整任务一步跳到 25%。
  let database: Database | null = null
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
        database = await createDatabase()
      }
    },
    {
      name: '执行数据库迁移',
      execute: async () => {
        await runMigrations(database!.getDatabase())
      }
    },
    {
      name: '初始化工作区',
      execute: async () => {
        const result = await migrateWorkspaceData(database!.getDatabase(), () => {
          const harness = settingsStore.get('harness') as HarnessSettings | undefined
          return harness?.activeWorkspaceId
        })
        // 把迁移确定的活动工作区写回设置（id 与路径一起同步）
        const harness = settingsStore.get('harness') as HarnessSettings | undefined
        const next: HarnessSettings = { ...(harness ?? ({} as HarnessSettings)) }
        if (result.activeWorkspaceId == null) {
          // 没有任何工作区：清掉残留配置，回到「未配置」，由对话页引导用户选择目录
          if (next.activeWorkspaceId != null || next.workspacePath) {
            delete next.activeWorkspaceId
            next.workspacePath = ''
            settingsStore.set('harness', next)
          }
        } else if (
          next.activeWorkspaceId !== result.activeWorkspaceId ||
          next.workspacePath !== result.activeWorkspacePath
        ) {
          next.activeWorkspaceId = result.activeWorkspaceId
          next.workspacePath = result.activeWorkspacePath ?? ''
          settingsStore.set('harness', next)
        }
        logger.info(
          `[Init] Workspace migration done, active workspace=${result.activeWorkspaceId ?? 'none'}`
        )
      }
    }
  ]

  for (let i = 0; i < steps.length; i++) {
    // 步骤起始进度：已完成 i 步 / 总步数，每步只推进一小格
    sendInitProgress(steps[i].name, (i / steps.length) * 100, i + 1, steps.length)
    await steps[i].execute()
  }

  // 建表与工作区迁移全部完成后再开放数据库访问：
  // 主窗口预热期间渲染进程可能已发起查询，提前暴露会导致「relation ... does not exist」。
  setDatabaseInstance(database)

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
      // 预加载 HarnessProvider 所需数据，不阻塞交接
      preloadHarnessData()
      // 通知加载页显示完成状态（纯 UI 提示；不依赖其回发驱动交接——
      // 加载页定时器可能被后台节流延迟数秒，交接由主进程直接控制）
      const win = getLoadingWindow()
      if (win) {
        safeSend(win.webContents, 'init-complete')
      }
      markInitComplete()
    })
    .catch((err) => {
      logger.error('Initialization failed:', err)
      const win = getLoadingWindow()
      if (win) {
        safeSend(win.webContents, 'init-error', err.message)
      }
    })
  setInitializationPromise(initPromise)

  // 注意：此处不再等待初始化完成——调用方紧接着会预热主窗口（隐藏），
  // 让渲染进程加载与数据库初始化并行，消除「加载窗口结束后再等主窗口」的空白期
}
