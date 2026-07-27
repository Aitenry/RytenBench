import { app, shell, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createDatabase, Database } from './database/loading'
import { getIp } from './address'
import _Store from 'electron-store'
import logger from 'electron-log'
import * as fs from 'fs'
import crypto from 'crypto'
import { fetchWeatherApi } from 'openmeteo'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

import {
  getTodoItemById,
  getTodoItemByTitle,
  getTodoItemsByPriority,
  getAllTodoItems,
  getTodoItemsPaginated,
  getTodoItemsByDueDate,
  deleteTodoItem,
  updateTodoItem,
  addTodoItem,
  TodoItemRow
} from './database/mapper/todo'
import {
  addDependency,
  deleteDependency,
  deleteAllDependenciesForTask,
  getAllDependencies,
  getAllTasksWithDependencies
} from './database/mapper/todo_dependencies'
import {
  getAllTasks as getAllPlannerTasks,
  getTaskById as getPlannerTaskById,
  getTaskTree as getPlannerTaskTree,
  addTask as addPlannerTask,
  updateTask as updatePlannerTask,
  deleteTask as deletePlannerTask,
  reorderTasks as reorderPlannerTasks,
  addDependency as addPlannerDependency,
  deleteDependency as deletePlannerDependency,
  getAllDependencies as getAllPlannerDependencies
} from './database/mapper/planner'
import {
  getDocById,
  getAllDocs,
  getDocPage,
  addDoc,
  updateDoc,
  deleteDoc,
  deleteDocsByTimeRange,
  DocRow
} from './database/mapper/document'
import {
  getWikiById,
  getAllWikis,
  addWiki,
  updateWiki,
  deleteWiki,
  getDirectoriesByWikiId,
  addDirectory,
  updateDirectory,
  deleteDirectory,
  getDocsByDirectoryId,
  addDocToDirectory,
  removeDocFromDirectory,
  getDirectoriesByDocId,
  WikiRow,
  WikiDirectoryRow
} from './database/mapper/wiki'
import {
  getAllFolders,
  getFolderById,
  upsertFolder,
  deleteFolder,
  getTracksByFolder,
  upsertTracks,
  updateTrack,
  updateTrackCover,
  updateFolderDescription,
  updateFolderCover,
  saveFolderCover,
  updateFolder,
  toggleLikeTrack,
  updateLastPlayed,
  getLikedTracks,
  getRecentlyPlayed,
  deleteTrackById
} from './database/mapper/music'
import { ChatService } from './chat/service'
import { buildTools, subAgentDefinitions, availableTools } from './chat/tools'
import type { ToolCallDetail, SubAgentEvent } from './chat/types'
// BaseMessage 等 LangChain 类型已移入 ChatService 内部使用
import { KnowledgeGraphService, BuildConfig } from './graph'
import { getProviderService } from './provider/service'
import {
  getAllProviders,
  getProviderById,
  getDefaultProvider,
  getEnabledProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  setDefaultProvider,
  LlmProviderInput
} from './database/mapper/provider'
import { initKeystore } from './crypto/provider-key'
import { SystemSettings, GraphSettings, ChatSettings } from './types/settings'
import {
  getEntityById,
  searchEntities,
  updateEntity,
  deleteEntity,
  deleteRelation,
  getFullGraphData,
  getBuildJobByWikiId,
  getLatestBuildJob
} from './database/mapper/graph'
import {
  getAllNodePositions,
  saveNodePosition,
  saveNodePositions,
  deleteNodePosition
} from './database/mapper/node_position'
import {
  getAllTopics,
  getTopicById,
  createTopic,
  updateTopic,
  deleteTopic,
  getDialoguesByTopicId,
  addDialogue,
  deleteDialoguesByTopicId,
  deleteDialogueById,
  ChatTopicRow,
  ChatDialogueRow
} from './database/mapper/chat'

logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
logger.transports.file.fileName = 'main.log'

const Store = _Store['default'] || _Store
const settingsStore = new Store({ name: 'settings' })
let loadingWindow: BrowserWindow | null = null
let database: Database | null = null // 保持模块级变量
const streamAbortControllers = new Map<number, AbortController>() // 流式输出取消控制器
const activeChatStreams = new Set<Promise<void>>() // 进行中的对话流（退出前需等待其保存数据）

// --- 获取数据库实例的函数 ---
let initializationPromise: Promise<void> | null = null // 用于追踪初始化过程

/**
 * 获取已初始化的数据库实例。
 * 如果数据库尚未初始化，它会等待初始化完成。
 * @returns Promise<Database> 已初始化的数据库实例
 */
export async function getDatabaseInstance(): Promise<Database> {
  if (database) {
    return database
  }

  if (initializationPromise) {
    // 如果初始化正在进行中，则等待它完成
    await initializationPromise
    if (database) {
      return database
    }
  }

  // 如果既没有实例也没有进行中的初始化，则说明初始化未开始或失败
  throw new Error('Database has not been initialized yet.')
}

async function performInitializationTasks(): Promise<void> {
  const tasks = [
    { name: '加载配置', execute: async () => await loadConfig() },
    {
      name: '初始化密钥库',
      execute: async () => {
        initKeystore()
      }
    },
    { name: '初始化数据库', execute: async () => (database = await createDatabase()) }
  ]

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]

    const progress = ((i + 1) / tasks.length) * 100

    if (loadingWindow) {
      loadingWindow.webContents.send('init-progress', {
        currentTask: task.name,
        progress: Math.round(progress),
        taskIndex: i + 1,
        totalTasks: tasks.length
      })
    }

    await task.execute()
  }
}

async function loadConfig(): Promise<void> {
  const ipConfig = settingsStore.get('ip')
  const lockPermission = settingsStore.get('lock')
  const graphConfig = settingsStore.get('graph')
  const chatConfig = settingsStore.get('chat')
  const configPromises: Promise<void>[] = []

  if (!ipConfig) {
    configPromises.push(
      getIp().then((ip) => {
        settingsStore.set('ip', ip)
      })
    )
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
        settingsStore.set('chat', {
          maxIterations: 5,
          historyWindowSize: 10,
          toolCallWindowSize: 20
        } as ChatSettings)
      })
    )
  }

  try {
    await Promise.all(configPromises)
  } catch (error) {
    logger.error('Error loading config:', error)
  }
}

async function createLoadingWindow(): Promise<void> {
  loadingWindow = new BrowserWindow({
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
      sandbox: false
    }
  })

  loadingWindow.setMenu(null)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    await loadingWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/resource/loading.html`)
  } else {
    await loadingWindow.loadFile(join(__dirname, '../renderer/resource/loading.html'))
  }

  ipcMain.once('init-complete', () => {
    if (loadingWindow) {
      loadingWindow.close()
      loadingWindow = null
    }
    createMainWindow()
  })

  initializationPromise = performInitializationTasks()
    .then(() => {
      logger.info('All initialization tasks completed.')
      if (loadingWindow) {
        loadingWindow.webContents.send('init-complete')
      }
    })
    .catch((err) => {
      logger.error('Initialization failed:', err)
      if (loadingWindow) {
        loadingWindow.webContents.send('init-error', err.message)
      }
    })

  await initializationPromise
}

function createMainWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1390,
    height: 827,
    minWidth: 1390,
    minHeight: 827,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    ...{ icon },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).then()
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/resource/index.html`).then()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/resource/index.html')).then()
  }

  mainWindow.webContents.once('dom-ready', () => {
    mainWindow.webContents.send('main-window-ready')
  })

  // 窗口控制 IPC
  let isMaximized = false
  let normalBounds: { x: number; y: number; width: number; height: number } | null = null

  ipcMain.on('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize()
    }
  })
  ipcMain.on('window-maximize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (isMaximized) {
      // 还原到之前的尺寸和位置
      if (normalBounds) {
        mainWindow.setBounds(normalBounds)
      }
      isMaximized = false
      mainWindow.webContents.send('window-maximized', false)
    } else {
      // 保存当前尺寸，然后最大化到可用工作区
      normalBounds = mainWindow.getBounds()
      const { workArea } = screen.getPrimaryDisplay()
      mainWindow.setBounds({
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height
      })
      isMaximized = true
      mainWindow.webContents.send('window-maximized', true)
    }
  })
  ipcMain.on('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close()
    }
  })
  ipcMain.handle('window-is-maximized', () => {
    return isMaximized
  })

  // --- Weather ---
  const weatherCodeMap: Record<number, string> = {
    0: '晴天',
    1: '大部晴朗',
    2: '局部多云',
    3: '多云',
    45: '有雾',
    48: '雾凇',
    51: '小毛毛雨',
    53: '大毛毛雨',
    61: '小雨',
    63: '中雨',
    65: '大雨',
    71: '小雪',
    73: '中雪',
    75: '大雪',
    80: '小阵雨',
    81: '中阵雨',
    82: '大阵雨',
    95: '雷暴'
  }

  async function fetchWeatherData(
    lat: number,
    lon: number,
    locationName: string
  ): Promise<Record<string, unknown>> {
    const params = {
      latitude: [lat],
      longitude: [lon],
      current:
        'temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m,apparent_temperature',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      forecast_days: 3,
      timezone: 'auto'
    }
    const responses = await fetchWeatherApi('https://api.open-meteo.com/v1/forecast', params)
    const response = responses[0]

    const current = response.current()
    const daily = response.daily()

    const result: Record<string, unknown> = {
      location: locationName,
      current: {},
      daily: [] as Record<string, unknown>[]
    }

    if (current) {
      result.current = {
        temp: current.variables(0)!.value().toFixed(2),
        weatherCode: Math.round(current.variables(1)!.value()),
        weatherDesc: weatherCodeMap[Math.round(current.variables(1)!.value())] ?? '未知',
        windSpeed: current.variables(2)!.value().toFixed(2),
        humidity: Math.round(current.variables(4)!.value()),
        apparentTemp: current.variables(5)!.value().toFixed(2)
      }
    }

    if (daily) {
      const wc = daily.variables(0)!.valuesArray()!
      const tMax = daily.variables(1)!.valuesArray()!
      const tMin = daily.variables(2)!.valuesArray()!
      const pProb = daily.variables(3)!.valuesArray()!
      const startTime = Number(daily.time())
      const dayInterval = daily.interval()
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`

      for (let i = 0; i < wc.length; i++) {
        const dayTime = new Date((startTime + i * dayInterval) * 1000)
        const dateStr = `${dayTime.getFullYear()}-${String(dayTime.getMonth() + 1).padStart(2, '0')}-${String(dayTime.getDate()).padStart(2, '0')}`
        ;(result.daily as Record<string, unknown>[]).push({
          label: dateStr === todayStr ? '今天' : weekdays[dayTime.getDay()],
          weatherDesc: weatherCodeMap[Math.round(wc[i])] ?? '未知',
          tempMax: tMax[i].toFixed(0),
          tempMin: tMin[i].toFixed(0),
          precipProb: pProb[i] ?? 0
        })
      }
    }

    settingsStore.set('weatherLastFetched', Date.now())
    settingsStore.set('weatherData', result)
    return result
  }

  // 天气自动刷新
  let weatherTimer: ReturnType<typeof setInterval> | null = null
  const DEFAULT_REFRESH_MIN = 60

  function startWeatherAutoRefresh(): void {
    const ip = settingsStore.get('ip') as Record<string, unknown> | undefined
    if (!ip) return

    const lat = ip.lat as number | undefined
    const lon = ip.lon as number | undefined
    const city = (ip.city as string) || (ip.regionName as string) || ''
    if (!lat || !lon) return

    const refreshMin =
      (settingsStore.get('weatherRefreshInterval') as number) || DEFAULT_REFRESH_MIN
    const lastFetched = settingsStore.get('weatherLastFetched') as number | undefined

    // 先推送缓存数据
    const cached = settingsStore.get('weatherData') as Record<string, unknown> | undefined
    if (cached && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('weather-update', cached)
    }

    const doFetch = async (): Promise<void> => {
      try {
        const data = await fetchWeatherData(lat, lon, city)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('weather-update', data)
        }
      } catch (err) {
        logger.error('Weather auto-refresh failed:', err)
      }
    }

    // 启动时检查是否需要立即拉取
    const shouldFetchNow = !lastFetched || Date.now() - lastFetched > 3 * 60 * 60 * 1000
    if (shouldFetchNow) {
      doFetch()
    }

    // 定时器
    if (weatherTimer) clearInterval(weatherTimer)
    weatherTimer = setInterval(doFetch, refreshMin * 60 * 1000)
  }

  // 手动刷新 IPC — force=true 强制拉取最新数据
  ipcMain.handle(
    'weather-get',
    async (_event, force?: boolean): Promise<Record<string, unknown>> => {
      if (!force) {
        const cached = settingsStore.get('weatherData') as Record<string, unknown> | undefined
        if (cached) return cached
      }

      const ip = settingsStore.get('ip') as Record<string, unknown> | undefined
      if (!ip) throw new Error('No location data')
      const lat = ip.lat as number | undefined
      const lon = ip.lon as number | undefined
      const city = (ip.city as string) || (ip.regionName as string) || ''
      if (!lat || !lon) throw new Error('No coordinates')
      return await fetchWeatherData(lat, lon, city)
    }
  )

  // 启动天气自动刷新
  startWeatherAutoRefresh()
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.ryten.bench')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => logger.info('pong'))

  ipcMain.handle('chat-get-tools', async () => {
    return availableTools
  })

  ipcMain.on('init-progress', (_event, data) => {
    logger.info('Init progress:', data)
  })

  // 注册 IPC 处理器
  ipcMain.handle('todo-items-get-by-id', async (_event, id: number) => {
    try {
      return await getTodoItemById(id)
    } catch (error) {
      console.error('Error in todo-items-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-by-title', async (_event, title: string) => {
    try {
      return await getTodoItemByTitle(title)
    } catch (error) {
      console.error('Error in todo-items-get-by-title:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-by-priority', async (_event, priority: number) => {
    try {
      return await getTodoItemsByPriority(priority)
    } catch (error) {
      console.error('Error in todo-items-get-by-priority:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-by-completed-status', async (_event, status: number) => {
    try {
      return await getTodoItemsByPriority(status)
    } catch (error) {
      console.error('Error in todo-items-get-by-completed-status:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-schedule', async () => {
    try {
      return await getAllTodoItems()
    } catch (error) {
      console.error('Error in todo-items-get-schedule:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-paginated', async (_event, page: number, pageSize: number) => {
    try {
      return await getTodoItemsPaginated(page, pageSize)
    } catch (error) {
      console.error('Error in todo-items-get-paginated:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-by-due-date', async (_event, dueDate: string) => {
    try {
      return await getTodoItemsByDueDate(dueDate)
    } catch (error) {
      console.error('Error in todo-items-get-by-due-date:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-add', async (_event, todoItem: Omit<TodoItemRow, 'id'>) => {
    try {
      return await addTodoItem(todoItem)
    } catch (error) {
      console.error('Error in todo-items-add:', error)
      throw error
    }
  })

  ipcMain.handle(
    'todo-items-update',
    async (_event, id: number, updates: Partial<Omit<TodoItemRow, 'id'>>) => {
      try {
        return await updateTodoItem(id, updates)
      } catch (error) {
        console.error('Error in todo-items-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('todo-items-delete', async (_event, id: number) => {
    try {
      const result = await deleteTodoItem(id)
      // 同时清理该任务的所有依赖关系
      deleteAllDependenciesForTask(id).catch((err) =>
        logger.error('Failed to delete dependencies for todo:', err)
      )
      deleteNodePosition(`todo-${id}`).catch((err) =>
        logger.error('Failed to delete node position for todo:', err)
      )
      return result
    } catch (error) {
      console.error('Error in todo-items-delete:', error)
      throw error
    }
  })

  // --- 任务依赖关系 IPC handlers ---
  ipcMain.handle('task-deps-add', async (_event, taskId: number, dependsOnTaskId: number) => {
    try {
      return await addDependency(taskId, dependsOnTaskId)
    } catch (error) {
      console.error('Error in task-deps-add:', error)
      throw error
    }
  })

  ipcMain.handle('task-deps-delete', async (_event, taskId: number, dependsOnTaskId: number) => {
    try {
      return await deleteDependency(taskId, dependsOnTaskId)
    } catch (error) {
      console.error('Error in task-deps-delete:', error)
      throw error
    }
  })

  ipcMain.handle('task-deps-get-all', async () => {
    try {
      return await getAllDependencies()
    } catch (error) {
      console.error('Error in task-deps-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('task-deps-get-with-tasks', async () => {
    try {
      return await getAllTasksWithDependencies()
    } catch (error) {
      console.error('Error in task-deps-get-with-tasks:', error)
      throw error
    }
  })

  // --- Planner (甘特图) IPC handlers ---
  ipcMain.handle('planner-tasks-get-all', async () => {
    try {
      return await getAllPlannerTasks()
    } catch (error) {
      console.error('Error in planner-tasks-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-get-by-id', async (_event, id: number) => {
    try {
      return await getPlannerTaskById(id)
    } catch (error) {
      console.error('Error in planner-tasks-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-get-tree', async () => {
    try {
      return await getPlannerTaskTree()
    } catch (error) {
      console.error('Error in planner-tasks-get-tree:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-add', async (_event, task) => {
    try {
      return await addPlannerTask(task)
    } catch (error) {
      console.error('Error in planner-tasks-add:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-update', async (_event, id: number, updates) => {
    try {
      return await updatePlannerTask(id, updates)
    } catch (error) {
      console.error('Error in planner-tasks-update:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-delete', async (_event, id: number) => {
    try {
      return await deletePlannerTask(id)
    } catch (error) {
      console.error('Error in planner-tasks-delete:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-reorder', async (_event, orderList) => {
    try {
      return await reorderPlannerTasks(orderList)
    } catch (error) {
      console.error('Error in planner-tasks-reorder:', error)
      throw error
    }
  })

  ipcMain.handle('planner-deps-add', async (_event, taskId: number, dependsOnTaskId: number) => {
    try {
      return await addPlannerDependency(taskId, dependsOnTaskId)
    } catch (error) {
      console.error('Error in planner-deps-add:', error)
      throw error
    }
  })

  ipcMain.handle('planner-deps-delete', async (_event, taskId: number, dependsOnTaskId: number) => {
    try {
      return await deletePlannerDependency(taskId, dependsOnTaskId)
    } catch (error) {
      console.error('Error in planner-deps-delete:', error)
      throw error
    }
  })

  ipcMain.handle('planner-deps-get-all', async () => {
    try {
      return await getAllPlannerDependencies()
    } catch (error) {
      console.error('Error in planner-deps-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('lock-screen-code', async () => {
    try {
      return settingsStore.get('lock') as string
    } catch (error) {
      console.error('Error in todo-items-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle('lock-screen-view', async (_event, open: boolean) => {
    try {
      const lock = settingsStore.get('lock')
      lock.view = open
      settingsStore.set('lock', lock)
    } catch (error) {
      console.error('Error in todo-items-get-by-id:', error)
      throw error
    }
  })

  // --- System Settings IPC handlers ---

  ipcMain.handle('system-settings-get-all', async () => {
    try {
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
          settingsStore.set(key as keyof SystemSettings, value)
        }
      }
      logger.info('System settings updated:', Object.keys(updates).join(', '))
      return true
    } catch (error) {
      logger.error('Error in system-settings-update:', error)
      throw error
    }
  })

  // Node Position IPC handlers

  ipcMain.handle('node-positions-get-all', async () => {
    try {
      return await getAllNodePositions()
    } catch (error) {
      logger.error('Error in node-positions-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('node-position-save', async (_event, nodeId: string, x: number, y: number) => {
    try {
      await saveNodePosition(nodeId, x, y)
    } catch (error) {
      logger.error('Error in node-position-save:', error)
      throw error
    }
  })

  ipcMain.handle(
    'node-positions-save-batch',
    async (_event, positions: { node_id: string; x: number; y: number }[]) => {
      try {
        await saveNodePositions(positions)
      } catch (error) {
        logger.error('Error in node-positions-save-batch:', error)
        throw error
      }
    }
  )

  ipcMain.handle('node-position-delete', async (_event, nodeId: string) => {
    try {
      return await deleteNodePosition(nodeId)
    } catch (error) {
      logger.error('Error in node-position-delete:', error)
      throw error
    }
  })

  // Music IPC handlers

  ipcMain.handle('music-select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择音乐根目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('music-get-folders', async () => {
    const rows = await getAllFolders()
    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      name: row.name,
      description: row.description || '',
      track_count: row.track_count,
      coverDataUrl: row.cover_data_url,
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
  })

  ipcMain.handle('music-get-tracks', async (_event, folderId: string) => {
    const rows = await getTracksByFolder(folderId)
    return rows.map((row) => ({
      id: String(row.id),
      filePath: row.file_path,
      title: row.title,
      artist: row.artist || 'Unknown Artist',
      album: row.album || 'Unknown Album',
      duration: row.duration || 0,
      liked: row.liked,
      coverDataUrl: row.cover_data_url
    }))
  })

  ipcMain.handle('music-delete-folder', async (_event, folderId: string) => {
    const folder = await getFolderById(folderId)
    if (folder) {
      // 删除物理文件
      if (fs.existsSync(folder.path)) {
        fs.rmSync(folder.path, { recursive: true, force: true })
      }
    }
    await deleteFolder(folderId)
  })

  ipcMain.handle('music-create-folder', async (_event, name: string, description?: string) => {
    const musicDir = settingsStore.get('musicDirectory') as string | undefined
    if (!musicDir) throw new Error('未设置音乐目录')

    const folderId = crypto.randomUUID()
    const folderPath = `${musicDir}\\${folderId}`.replace(/\//g, '\\')
    fs.mkdirSync(folderPath, { recursive: true })
    await upsertFolder(folderId, folderPath, name, 0, description || '')
    const desc = description || ''
    return {
      id: folderId,
      path: folderPath,
      name,
      description: desc,
      track_count: 0,
      coverDataUrl: null,
      created_at: '',
      updated_at: ''
    }
  })

  ipcMain.handle(
    'music-update-folder',
    async (_event, folderId: string, fields: { name?: string; description?: string | null }) => {
      await updateFolder(folderId, fields)
    }
  )

  ipcMain.handle(
    'music-update-folder-description',
    async (_event, folderId: string, description: string | null) => {
      await updateFolderDescription(folderId, description)
    }
  )

  ipcMain.handle('music-select-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '选择封面图片',
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const imgPath = result.filePaths[0]
    const ext = imgPath.split('.').pop()?.toLowerCase() || 'jpeg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const base64 = fs.readFileSync(imgPath).toString('base64')
    return `data:${mime};base64,${base64}`
  })

  ipcMain.handle(
    'music-save-folder-cover',
    async (_event, folderId: string, coverDataUrl: string | null) => {
      await saveFolderCover(folderId, coverDataUrl)
    }
  )

  ipcMain.handle('music-update-folder-cover', async (_event, folderId: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '选择歌单封面',
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const imgPath = result.filePaths[0]
    const ext = imgPath.split('.').pop()?.toLowerCase() || 'jpeg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const base64 = fs.readFileSync(imgPath).toString('base64')
    const coverDataUrl = `data:${mime};base64,${base64}`

    return await updateFolderCover(folderId, coverDataUrl)
  })

  ipcMain.handle('music-add-tracks', async (_event, folderId: string) => {
    try {
      const folder = await getFolderById(folderId)
      if (!folder) throw new Error('歌单不存在')

      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: '选择音乐文件',
        filters: [
          {
            name: '音频文件',
            extensions: ['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a', 'wma', 'ape', 'wv']
          }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) return null

      const { parseFile } = await import('music-metadata')

      // 先读取歌单中已有曲目的 file_hash，用于去重
      const existingRows = await getTracksByFolder(folderId)
      const existingHashes = new Set(
        existingRows.filter((row) => row.file_hash != null).map((row) => row.file_hash)
      )

      const tracks: {
        filePath: string
        fileHash: string
        title: string
        artist: string
        album: string
        duration: number
        coverDataUrl: string | null
      }[] = []
      const skippedNames: string[] = []

      for (const srcPath of result.filePaths) {
        const origName = srcPath.split(/[/\\]/).pop() || 'unknown'

        try {
          // 计算源文件 MD5 用于去重
          const fileBuffer = fs.readFileSync(srcPath)
          const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex')

          // 同歌单内已存在相同文件，跳过
          if (existingHashes.has(fileHash)) {
            skippedNames.push(origName)
            continue
          }

          existingHashes.add(fileHash)

          const ext = srcPath.split('.').pop() || ''
          const uuid = crypto.randomUUID()
          const fileName = `${uuid}.${ext}`
          const destPath = `${folder.path}\\${fileName}`.replace(/\//g, '\\')
          fs.copyFileSync(srcPath, destPath)
          const meta = await parseFile(destPath)
          const { title, artist, album } = meta.common
          const duration = meta.format.duration || 0
          let coverDataUrl: string | null = null
          if (meta.common.picture && meta.common.picture.length > 0) {
            const pic = meta.common.picture[0]
            const mime = pic.format || 'image/jpeg'
            const base64 = Buffer.from(pic.data).toString('base64')
            coverDataUrl = `data:${mime};base64,${base64}`
          }
          tracks.push({
            filePath: destPath,
            fileHash,
            title: title || origName.replace(/\.[^.]+$/, ''),
            artist: artist || 'Unknown Artist',
            album: album || 'Unknown Album',
            duration,
            coverDataUrl
          })
        } catch {
          // skip files that can't be copied or parsed
        }
      }

      if (tracks.length > 0) {
        // 合并已有曲目（含 file_hash），避免 upsertTracks 的 DELETE 逻辑误删原有数据
        const existingTracks = existingRows
          .filter((row) => row.file_hash != null)
          .map((row) => ({
            filePath: row.file_path,
            fileHash: row.file_hash,
            title: row.title,
            artist: row.artist || 'Unknown Artist',
            album: row.album || 'Unknown Album',
            duration: row.duration || 0,
            coverDataUrl: row.cover_data_url
          }))
        const allTracks = [...existingTracks, ...tracks]
        await upsertTracks(folderId, allTracks)
        await upsertFolder(
          folderId,
          folder.path,
          folder.name,
          allTracks.length,
          folder.description,
          folder.image_id
        )
      }

      return { added: tracks, skipped: skippedNames }
    } catch (error) {
      console.error('Error in music-add-tracks:', error)
      throw error
    }
  })

  ipcMain.handle('music-delete-track', async (_event, trackId: number) => {
    try {
      const result = await deleteTrackById(trackId)
      if (!result) throw new Error('歌曲不存在')

      // 删除物理文件
      if (fs.existsSync(result.filePath)) {
        fs.unlinkSync(result.filePath)
      }

      // 更新歌单的 track_count（保留原有的描述和封面）
      const folder = await getFolderById(result.folderId)
      if (folder) {
        const tracks = await getTracksByFolder(result.folderId)
        await upsertFolder(
          result.folderId,
          folder.path,
          folder.name,
          tracks.length,
          folder.description,
          folder.image_id
        )
      }
    } catch (error) {
      console.error('Error in music-delete-track:', error)
      throw error
    }
  })

  ipcMain.handle(
    'music-update-track',
    async (
      _event,
      trackId: number,
      fields: {
        title?: string
        artist?: string
        album?: string
      }
    ) => {
      await updateTrack(trackId, fields)
    }
  )

  ipcMain.handle('music-update-track-cover', async (_event, trackId: number) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '选择封面图片',
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const imgPath = result.filePaths[0]
    const ext = imgPath.split('.').pop()?.toLowerCase() || 'jpeg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const base64 = fs.readFileSync(imgPath).toString('base64')
    const coverDataUrl = `data:${mime};base64,${base64}`

    return await updateTrackCover(trackId, coverDataUrl)
  })

  ipcMain.handle('music-read-file', async (_event, filePath: string) => {
    const buffer = await fs.promises.readFile(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  })

  ipcMain.handle('music-toggle-like', async (_event, trackId: number) => {
    return await toggleLikeTrack(trackId)
  })

  ipcMain.handle('music-update-last-played', async (_event, trackId: number) => {
    await updateLastPlayed(trackId)
  })

  ipcMain.handle('music-get-liked-tracks', async () => {
    const rows = await getLikedTracks()
    return rows.map((row) => ({
      id: String(row.id),
      filePath: row.file_path,
      title: row.title,
      artist: row.artist || 'Unknown Artist',
      album: row.album || 'Unknown Album',
      duration: row.duration || 0,
      liked: row.liked,
      coverDataUrl: row.cover_data_url
    }))
  })

  ipcMain.handle('music-get-recently-played', async () => {
    const rows = await getRecentlyPlayed(100)
    return rows.map((row) => ({
      id: String(row.id),
      filePath: row.file_path,
      title: row.title,
      artist: row.artist || 'Unknown Artist',
      album: row.album || 'Unknown Album',
      duration: row.duration || 0,
      liked: row.liked,
      coverDataUrl: row.cover_data_url
    }))
  })

  ipcMain.handle('doc-get-by-id', async (_event, id: number) => {
    try {
      return await getDocById(id)
    } catch (error) {
      console.error('Error in doc-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle(
    'doc-get-all',
    async (_event, page?: number, pageSize?: number, excludeWikiId?: number, search?: string) => {
      try {
        return await getAllDocs(page, pageSize, excludeWikiId, search)
      } catch (error) {
        console.error('Error in doc-get-all:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'doc-page-get',
    async (_event, query: string, page?: number, pageSize?: number) => {
      try {
        return await getDocPage(query, page, pageSize)
      } catch (error) {
        console.error('Error in doc-get-by-title:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'doc-add',
    async (
      _event,
      doc: Omit<DocRow, 'id' | 'created_at' | 'updated_at'> & {
        image?: string | null
        content?: string | null
      }
    ) => {
      try {
        return await addDoc(doc)
      } catch (error) {
        console.error('Error in doc-add:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'doc-update',
    async (
      _event,
      id: number,
      updates: Partial<Omit<DocRow, 'id' | 'created_at'>> & {
        image?: string | null
        content?: string | null
      }
    ) => {
      try {
        return await updateDoc(id, updates)
      } catch (error) {
        console.error('Error in doc-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('doc-delete', async (_event, id: number) => {
    try {
      const result = await deleteDoc(id)
      deleteNodePosition(`doc-${id}`).catch((err) =>
        logger.error('Failed to delete node position for doc:', err)
      )
      return result
    } catch (error) {
      console.error('Error in doc-delete:', error)
      throw error
    }
  })

  ipcMain.handle('doc-delete-by-time-range', async (_event, startTime: string, endTime: string) => {
    try {
      // 先查询将要被删除的文档 ID，用于清理节点位置
      const db = (await getDatabaseInstance()).getDatabase()
      const idsResult = await db.query<{ id: number }>(
        'SELECT id FROM documents WHERE created_at >= $1 AND created_at <= $2',
        [startTime, endTime]
      )
      const deletedIds = idsResult.rows.map((r) => r.id)

      const result = await deleteDocsByTimeRange(startTime, endTime)

      // 清理对应的节点位置
      for (const id of deletedIds) {
        deleteNodePosition(`doc-${id}`).catch((err) =>
          logger.error('Failed to delete node position for doc:', err)
        )
      }

      return result
    } catch (error) {
      console.error('Error in doc-delete-by-time-range:', error)
      throw error
    }
  })

  ipcMain.handle('doc-import', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          {
            name: '文档文件',
            extensions: ['txt', 'md', 'docx', 'html', 'htm']
          },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      const fileName = filePath.split(/[\\/]/).pop() || 'file'
      const ext = filePath.split('.').pop()?.toLowerCase() || ''
      const title = fileName.replace(/\.[^/.]+$/, '')

      let content: string

      const htmlToMarkdown = (html: string): string => {
        const turndownService = new TurndownService()
        return turndownService.turndown(html)
      }

      if (ext === 'docx') {
        const buffer = fs.readFileSync(filePath)
        const conversionResult = await mammoth.convertToHtml({ buffer })
        // mammoth 输出的 HTML 不含 <head>/<body>，直接转换即可
        content = htmlToMarkdown(conversionResult.value)
      } else if (ext === 'txt' || ext === 'md') {
        content = fs.readFileSync(filePath, 'utf-8')
      } else if (ext === 'html' || ext === 'htm') {
        const rawHtml = fs.readFileSync(filePath, 'utf-8')
        // 使用 Readability 智能提取文章正文
        const dom = new JSDOM(rawHtml, { url: `file://${filePath}` })
        const reader = new Readability(dom.window.document)
        const article = reader.parse()
        if (article?.content) {
          content = htmlToMarkdown(article.content)
        } else {
          // 降级：提取 <body> 内容
          const bodyMatch = rawHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
          const bodyContent = bodyMatch ? bodyMatch[1] : rawHtml
          const cleaned = bodyContent
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
            .replace(/<!--[\s\S]*?-->/g, '')
          content = htmlToMarkdown(cleaned)
        }
      } else {
        content = fs.readFileSync(filePath, 'utf-8')
      }

      return { title, content }
    } catch (error) {
      console.error('Error in doc-import:', error)
      throw error
    }
  })

  ipcMain.handle('doc-export', async (_event, id: number) => {
    try {
      const doc = await getDocById(id)
      if (!doc) {
        return false
      }

      const result = await dialog.showSaveDialog({
        defaultPath: `${doc.title || 'document'}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })

      if (result.canceled || !result.filePath) {
        return false
      }

      fs.writeFileSync(result.filePath, doc.content || '', 'utf-8')
      return true
    } catch (error) {
      console.error('Error in doc-export:', error)
      throw error
    }
  })

  ipcMain.handle('wiki-get-by-id', async (_event, id: number) => {
    try {
      return await getWikiById(id)
    } catch (error) {
      console.error('Error in wiki-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle('wiki-get-all', async (_event, page?: number, pageSize?: number) => {
    try {
      return await getAllWikis(page, pageSize)
    } catch (error) {
      console.error('Error in wiki-get-all:', error)
      throw error
    }
  })

  ipcMain.handle(
    'wiki-add',
    async (_event, wiki: Omit<WikiRow, 'id' | 'doc_count' | 'created_at' | 'updated_at'>) => {
      try {
        return await addWiki(wiki)
      } catch (error) {
        console.error('Error in wiki-add:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'wiki-update',
    async (
      _event,
      id: number,
      updates: Partial<Omit<WikiRow, 'id' | 'doc_count' | 'created_at'>>
    ) => {
      try {
        return await updateWiki(id, updates)
      } catch (error) {
        console.error('Error in wiki-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('wiki-delete', async (_event, id: number) => {
    try {
      const result = await deleteWiki(id)
      deleteNodePosition(`wiki-${id}`).catch((err) =>
        logger.error('Failed to delete node position for wiki:', err)
      )
      return result
    } catch (error) {
      console.error('Error in wiki-delete:', error)
      throw error
    }
  })

  ipcMain.handle('wiki-directories-get', async (_event, wikiId: number) => {
    try {
      return await getDirectoriesByWikiId(wikiId)
    } catch (error) {
      console.error('Error in wiki-directories-get:', error)
      throw error
    }
  })

  ipcMain.handle(
    'wiki-directory-add',
    async (_event, directory: Omit<WikiDirectoryRow, 'id' | 'created_at' | 'updated_at'>) => {
      try {
        return await addDirectory(directory)
      } catch (error) {
        console.error('Error in wiki-directory-add:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'wiki-directory-update',
    async (_event, id: number, updates: Partial<Omit<WikiDirectoryRow, 'id' | 'created_at'>>) => {
      try {
        return await updateDirectory(id, updates)
      } catch (error) {
        console.error('Error in wiki-directory-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('wiki-directory-delete', async (_event, id: number) => {
    try {
      return await deleteDirectory(id)
    } catch (error) {
      console.error('Error in wiki-directory-delete:', error)
      throw error
    }
  })

  ipcMain.handle('wiki-directory-docs-get', async (_event, directoryId: number) => {
    try {
      return await getDocsByDirectoryId(directoryId)
    } catch (error) {
      console.error('Error in wiki-directory-docs-get:', error)
      throw error
    }
  })

  ipcMain.handle(
    'wiki-directory-note-add',
    async (_event, directoryId: number, noteId: number, sortOrder?: number) => {
      try {
        return await addDocToDirectory(directoryId, noteId, sortOrder)
      } catch (error) {
        console.error('Error in wiki-directory-note-add:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'wiki-directory-doc-remove',
    async (_event, directoryId: number, docId: number) => {
      try {
        return await removeDocFromDirectory(directoryId, docId)
      } catch (error) {
        console.error('Error in wiki-directory-doc-remove:', error)
        throw error
      }
    }
  )

  ipcMain.handle('wiki-doc-directories-get', async (_event, docId: number) => {
    try {
      return await getDirectoriesByDocId(docId)
    } catch (error) {
      console.error('Error in wiki-doc-directories-get:', error)
      throw error
    }
  })

  ipcMain.handle('select-image-file', async (_event, allowImages?: boolean) => {
    try {
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
      const docExts = ['pdf', 'txt', 'md', 'csv', 'json', 'xml', 'doc', 'docx', 'xls', 'xlsx']

      const extensions = allowImages !== false ? [...imageExts, ...docExts] : docExts

      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Supported Files', extensions },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      const fileName = filePath.split(/[\\/]/).pop() || 'file'
      const ext = filePath.split('.').pop()?.toLowerCase() || 'bin'
      const isImage = imageExts.includes(ext)

      // 非视觉模型时禁止选择图片
      if (allowImages === false && isImage) {
        await dialog.showErrorBox(
          '不支持的文件类型',
          '当前模型不支持视觉识别，请选择文档类附件（pdf、txt、md 等）'
        )
        return null
      }

      if (isImage) {
        const fileBuffer = fs.readFileSync(filePath)
        const base64 = fileBuffer.toString('base64')
        const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`
        return { dataUrl: `data:${mimeType};base64,${base64}`, fileName, isImage: true }
      }

      return { dataUrl: filePath, fileName, isImage: false }
    } catch (error) {
      console.error('Error selecting file:', error)
      throw error
    }
  })

  ipcMain.handle('select-text-file', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      const fileName = filePath.split(/[\\/]/).pop() || 'file'
      return { fileName, filePath }
    } catch (error) {
      console.error('Error selecting text file:', error)
      throw error
    }
  })

  ipcMain.handle(
    'chat-send-message',
    async (
      _event,
      question: string,
      options?: {
        tools?: string[]
        providerId?: number
        images?: string[]
        documents?: { fileName: string; filePath: string }[]
      }
    ) => {
      const tools = buildTools(options?.tools || [])
      logger.info(`[Chat] Creating model with providerId: ${options?.providerId ?? 'default'}`)
      const model = await getProviderService().createModel(options?.providerId)
      const chatSettings = settingsStore.get('chat') as ChatSettings | undefined
      const chatService = new ChatService(
        model,
        tools,
        subAgentDefinitions,
        chatSettings?.maxIterations ?? 5,
        getDialoguesByTopicId,
        chatSettings?.historyWindowSize ?? 10,
        chatSettings?.toolCallWindowSize ?? 20,
        chatSettings?.skillsPath || undefined,
        chatSettings?.enabledSkills
      )
      return await chatService.sendMessage(question, options)
    }
  )

  ipcMain.on(
    'chat-start-stream',
    (
      event,
      question: string,
      options?: {
        tools?: string[]
        topicId?: number
        providerId?: number
        images?: string[]
        documents?: { fileName: string; filePath: string }[]
      }
    ) => {
      // 跟踪进行中的流：应用退出时统一中止并等待数据保存完成
      const streamPromise = (async () => {
        const tools = buildTools(options?.tools || [])
        logger.info(`[Chat] Creating model with providerId: ${options?.providerId ?? 'default'}`)
        const model = await getProviderService().createModel(options?.providerId)
        const chatSettings = settingsStore.get('chat') as ChatSettings | undefined

        // 创建 AbortController 用于取消流式输出
        const abortController = new AbortController()
        streamAbortControllers.set(event.sender.id, abortController)

        // 1. 确保话题存在
        let topicId = options?.topicId
        if (!topicId) {
          const title = question.slice(0, 50)
          try {
            topicId = await createTopic(
              title,
              undefined,
              options?.tools ? JSON.stringify(options.tools) : undefined
            )
          } catch (err) {
            logger.error('Failed to create topic:', err)
            topicId = 0
          }
        }

        // 2. 保存用户消息（含图片和文档）
        try {
          const userBlocks: { type: string; image_url?: string; fileName?: string }[] = []
          if (options?.images?.length) {
            for (const img of options.images) {
              userBlocks.push({ type: 'image', image_url: img })
            }
          }
          if (options?.documents?.length) {
            for (const doc of options.documents) {
              userBlocks.push({ type: 'document', fileName: doc.fileName })
            }
          }
          await addDialogue({
            topic_id: topicId,
            role: 'user',
            content: question,
            blocks: JSON.stringify(userBlocks)
          })
        } catch (err) {
          logger.error('Failed to save user message:', err)
        }

        // 2.5. 历史对话上下文由 ChatService 内部从数据库加载

        // 3. 流式输出 + 累积完整内容
        const historyWindowSize = chatSettings?.historyWindowSize ?? 10
        const toolCallWindowSize = chatSettings?.toolCallWindowSize ?? 20
        const chatService = new ChatService(
          model,
          tools,
          subAgentDefinitions,
          chatSettings?.maxIterations ?? 5,
          getDialoguesByTopicId,
          historyWindowSize,
          toolCallWindowSize,
          chatSettings?.skillsPath || undefined
        )
        const stream = chatService.sendMessageStream(question, {
          ...options,
          topicId,
          signal: abortController.signal
        })
        const accumulatedBlocks: {
          type: string
          text?: string
          tool?: ToolCallDetail
          reasoning?: string
          subAgent?: SubAgentEvent
          children?: {
            type: string
            text?: string
            tool?: ToolCallDetail
            reasoning?: string
          }[]
        }[] = []
        let fullContent = ''
        let lastReasoning = ''

        try {
          for await (const chunk of stream) {
            if (abortController.signal.aborted) {
              logger.info('[Chat] Stream cancelled by user')
              break
            }
            if (chunk.reasoning_content) {
              const rc = String(chunk.reasoning_content)
              // 兼容 provider 可能下发完整文本而非增量：若新内容是已有内容的前缀/后缀，则替换/忽略
              if (
                lastReasoning &&
                rc.startsWith(lastReasoning) &&
                rc.length > lastReasoning.length
              ) {
                const delta = rc.slice(lastReasoning.length)
                const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
                if (lastBlock && lastBlock.type === 'reasoning') {
                  lastBlock.reasoning = (lastBlock.reasoning || '') + delta
                } else {
                  accumulatedBlocks.push({ type: 'reasoning', reasoning: delta })
                }
                lastReasoning = rc
              } else if (lastReasoning && lastReasoning.endsWith(rc)) {
                // 重复内容，忽略
              } else {
                lastReasoning = rc
                const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
                if (lastBlock && lastBlock.type === 'reasoning') {
                  lastBlock.reasoning = (lastBlock.reasoning || '') + rc
                } else {
                  accumulatedBlocks.push({ type: 'reasoning', reasoning: rc })
                }
              }
            }
            if (chunk.content) {
              const c = String(chunk.content)
              // 兼容 provider 可能下发完整文本而非增量：若新内容是已有内容的前缀/后缀，则替换/忽略
              if (fullContent && c.startsWith(fullContent) && c.length > fullContent.length) {
                const delta = c.slice(fullContent.length)
                fullContent = c
                const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
                if (lastBlock && lastBlock.type === 'text') {
                  lastBlock.text = (lastBlock.text || '') + delta
                } else {
                  accumulatedBlocks.push({ type: 'text', text: c })
                }
              } else if (fullContent && fullContent.endsWith(c)) {
                // 重复内容，忽略
              } else {
                fullContent += c
                const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
                if (lastBlock && lastBlock.type === 'text') {
                  lastBlock.text = (lastBlock.text || '') + c
                } else {
                  accumulatedBlocks.push({ type: 'text', text: c })
                }
              }
            }
            if (chunk.tool) {
              if (chunk.tool.name === 'task') {
                // task 工具已由 service.ts 转换为 subAgent 事件下发，此处跳过
              } else {
                // 优先按 callId 精确匹配同一次调用；preparing 阶段没有 id 时按名称回退；
                // ID 来自不同来源可能不一致，同名未完成时也按名称回退
                const matchesTool = (t: ToolCallDetail): boolean => {
                  if (chunk.tool!.id) {
                    if (t.id === chunk.tool!.id) return true
                    if (!t.id && t.status === 'preparing' && t.name === chunk.tool!.name)
                      return true
                    if (t.id && t.status && t.status !== 'completed' && t.name === chunk.tool!.name)
                      return true
                    return false
                  }
                  return t.name === chunk.tool!.name || t.name === ''
                }
                if (chunk.tool.status === 'completed') {
                  // 匹配同一次调用的未完成工具块并更新
                  for (let i = accumulatedBlocks.length - 1; i >= 0; i--) {
                    const b = accumulatedBlocks[i]
                    if (
                      b.type === 'tool' &&
                      b.tool &&
                      b.tool.status !== 'completed' &&
                      matchesTool(b.tool)
                    ) {
                      b.tool.output = chunk.tool.output
                      b.tool.status = chunk.tool.status
                      break
                    }
                  }
                } else if (chunk.tool.status === 'preparing') {
                  // 模型开始构建工具参数；后续进度 chunk 仅用于保活，已存在则跳过。
                  // 若同一次调用已处于 executing/completed（事件乱序），也跳过，避免重复块。
                  const exists = accumulatedBlocks.some(
                    (b) => b.type === 'tool' && matchesTool(b.tool as ToolCallDetail)
                  )
                  if (!exists) {
                    accumulatedBlocks.push({
                      type: 'tool',
                      tool: {
                        name: chunk.tool.name,
                        input: {},
                        output: '',
                        status: 'preparing',
                        id: chunk.tool.id
                      }
                    })
                  }
                } else {
                  // executing：优先合并到同一次调用的 preparing 块
                  let merged = false
                  for (let i = accumulatedBlocks.length - 1; i >= 0; i--) {
                    const b = accumulatedBlocks[i]
                    if (
                      b.type === 'tool' &&
                      b.tool?.status === 'preparing' &&
                      matchesTool(b.tool)
                    ) {
                      b.tool.name = chunk.tool.name
                      b.tool.input = chunk.tool.input
                      b.tool.status = 'executing'
                      b.tool.id = b.tool.id ?? chunk.tool.id
                      merged = true
                      break
                    }
                  }
                  if (!merged) {
                    accumulatedBlocks.push({
                      type: 'tool',
                      tool: {
                        name: chunk.tool.name,
                        input: chunk.tool.input,
                        output: chunk.tool.output,
                        status: 'executing',
                        id: chunk.tool.id
                      }
                    })
                  }
                }
              }
            }
            if (chunk.subAgent) {
              const sa = chunk.subAgent

              // 累积子代理最终输出到完整内容，避免历史记录重载时丢失子代理详情
              // 只取 output 作为持久化文本，避免与 blocks 中的流式 text 重复拼接
              if (sa.status === 'completed' && sa.output && !fullContent.includes(sa.output)) {
                fullContent += sa.output
              }

              // 匹配子代理累积块：优先 causeId，回退 name
              const matchesSa = (b: (typeof accumulatedBlocks)[number]): boolean => {
                if (b.type !== 'subAgent' || !b.subAgent) return false
                if (sa.causeId && b.subAgent.causeId) return b.subAgent.causeId === sa.causeId
                return b.subAgent.name === sa.name
              }

              // 查找或创建同名子代理累积块
              let saBlock = accumulatedBlocks.find(matchesSa)
              if (!saBlock) {
                saBlock = {
                  type: 'subAgent',
                  subAgent: {
                    name: sa.name,
                    causeId: sa.causeId,
                    status: sa.status,
                    taskDescription: sa.taskDescription
                  },
                  children: []
                }
                accumulatedBlocks.push(saBlock)
              }

              if (sa.status === 'started') {
                saBlock.subAgent!.status = sa.status
                saBlock.subAgent!.taskDescription =
                  saBlock.subAgent!.taskDescription || sa.taskDescription
              } else if (sa.status === 'completed' || sa.status === 'error') {
                saBlock.subAgent!.status = sa.status
                saBlock.subAgent!.output = sa.output
                saBlock.subAgent!.error = sa.error
              } else if (sa.content || sa.reasoning_content || sa.tool) {
                if (
                  saBlock.subAgent!.status !== 'completed' &&
                  saBlock.subAgent!.status !== 'error'
                ) {
                  saBlock.subAgent!.status = 'running'
                }
                if (!saBlock.children) saBlock.children = []

                if (sa.reasoning_content) {
                  const lastChild = saBlock.children[saBlock.children.length - 1]
                  if (lastChild && lastChild.type === 'reasoning') {
                    lastChild.reasoning = (lastChild.reasoning || '') + sa.reasoning_content
                  } else {
                    saBlock.children.push({ type: 'reasoning', reasoning: sa.reasoning_content })
                  }
                }

                if (sa.content) {
                  const lastChild = saBlock.children[saBlock.children.length - 1]
                  if (lastChild && lastChild.type === 'text') {
                    lastChild.text = (lastChild.text || '') + sa.content
                  } else {
                    saBlock.children.push({ type: 'text', text: sa.content })
                  }
                }

                if (sa.tool) {
                  // 优先按 callId 精确匹配同一次调用；preparing 阶段没有 id 时按名称回退；
                  // ID 来自不同来源可能不一致，同名未完成时也按名称回退
                  const matchesTool = (t: ToolCallDetail): boolean => {
                    if (sa.tool!.id) {
                      if (t.id === sa.tool!.id) return true
                      if (!t.id && t.status === 'preparing' && t.name === sa.tool!.name) return true
                      if (t.id && t.status && t.status !== 'completed' && t.name === sa.tool!.name)
                        return true
                      return false
                    }
                    return t.name === sa.tool!.name || t.name === ''
                  }
                  if (sa.tool.status === 'completed') {
                    for (let i = saBlock.children.length - 1; i >= 0; i--) {
                      const c = saBlock.children[i]
                      if (
                        c.type === 'tool' &&
                        c.tool &&
                        c.tool.status !== 'completed' &&
                        matchesTool(c.tool)
                      ) {
                        c.tool.output = sa.tool.output
                        c.tool.status = 'completed'
                        break
                      }
                    }
                  } else if (sa.tool.status === 'preparing') {
                    const exists = saBlock.children.some(
                      (c) =>
                        c.type === 'tool' && c.tool?.status === 'preparing' && matchesTool(c.tool)
                    )
                    if (!exists) {
                      saBlock.children.push({
                        type: 'tool',
                        tool: {
                          name: sa.tool.name,
                          input: {},
                          output: '',
                          status: 'preparing',
                          id: sa.tool.id
                        }
                      })
                    }
                  } else {
                    let merged = false
                    for (let i = saBlock.children.length - 1; i >= 0; i--) {
                      const c = saBlock.children[i]
                      if (
                        c.type === 'tool' &&
                        c.tool?.status === 'preparing' &&
                        matchesTool(c.tool)
                      ) {
                        c.tool.name = sa.tool.name
                        c.tool.input = sa.tool.input
                        c.tool.status = 'executing'
                        c.tool.id = c.tool.id ?? sa.tool.id
                        merged = true
                        break
                      }
                    }
                    if (!merged) {
                      saBlock.children.push({
                        type: 'tool',
                        tool: {
                          name: sa.tool.name,
                          input: sa.tool.input,
                          output: sa.tool.output || '',
                          status: 'executing',
                          id: sa.tool.id
                        }
                      })
                    }
                  }
                }
              }
            }
            event.sender.send('chat-stream-chunk', chunk)
          }
        } catch (error) {
          if ((error as Error)?.name !== 'AbortError') {
            logger.error('Error in chat stream:', error)
          }
        }

        // 4. 保存完整的 AI 回复
        try {
          await addDialogue({
            topic_id: topicId,
            role: 'assistant',
            content: fullContent,
            blocks: JSON.stringify(accumulatedBlocks)
          })
        } catch (err) {
          logger.error('Failed to save AI message:', err)
        }

        // 5. 清理并通知渲染进程流式输出已完成
        streamAbortControllers.delete(event.sender.id)
        if (!event.sender.isDestroyed()) {
          event.sender.send('chat-stream-done', { topicId })
        }
      })()
      activeChatStreams.add(streamPromise)
      streamPromise.finally(() => activeChatStreams.delete(streamPromise))
    }
  )

  // 取消流式输出
  ipcMain.on('chat-cancel-stream', (event) => {
    const controller = streamAbortControllers.get(event.sender.id)
    if (controller) {
      controller.abort()
      streamAbortControllers.delete(event.sender.id)
    }
  })

  // 选择技能（Skills）存储目录
  ipcMain.handle('chat-select-skills-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择技能存储目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 列出技能目录中的所有技能
  ipcMain.handle('chat-list-skills', async () => {
    try {
      const settings = settingsStore.store
      const skillsPath = (settings.chat as ChatSettings)?.skillsPath
      if (!skillsPath) return []

      const path = await import('path')
      const entries = fs.readdirSync(skillsPath, { withFileTypes: true })
      const skills: { id: string; name: string; description: string }[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillMdPath = path.join(skillsPath, entry.name, 'SKILL.md')
        try {
          fs.accessSync(skillMdPath, fs.constants.R_OK)
          const content = fs.readFileSync(skillMdPath, 'utf-8')
          const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
          let name = entry.name
          let description = ''
          if (fm) {
            const n = fm[1].match(/^name:\s*(.+)$/m)
            const d = fm[1].match(/^description:\s*(.+)$/m)
            if (n) name = n[1].trim()
            if (d) description = d[1].trim()
          }
          skills.push({ id: entry.name, name, description })
        } catch {
          // 目录中没有 SKILL.md，跳过
        }
      }
      return skills
    } catch (error) {
      logger.error('Error listing skills:', error)
      return []
    }
  })

  // --- Chat Topic IPC handlers ---

  ipcMain.handle('chat-topic-get-all', async () => {
    try {
      return await getAllTopics()
    } catch (error) {
      logger.error('Error in chat-topic-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('chat-topic-get-by-id', async (_event, id: number) => {
    try {
      return await getTopicById(id)
    } catch (error) {
      logger.error('Error in chat-topic-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle(
    'chat-topic-create',
    async (_event, title: string, model?: string, selectedTools?: string) => {
      try {
        return await createTopic(title, model, selectedTools)
      } catch (error) {
        logger.error('Error in chat-topic-create:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'chat-topic-update',
    async (
      _event,
      id: number,
      updates: Partial<Pick<ChatTopicRow, 'title' | 'model' | 'selected_tools'>>
    ) => {
      try {
        return await updateTopic(id, updates)
      } catch (error) {
        logger.error('Error in chat-topic-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('chat-topic-delete', async (_event, id: number) => {
    try {
      return await deleteTopic(id)
    } catch (error) {
      logger.error('Error in chat-topic-delete:', error)
      throw error
    }
  })

  // --- Chat Dialogue IPC handlers ---

  ipcMain.handle('chat-dialogue-get-by-topic', async (_event, topicId: number) => {
    try {
      return await getDialoguesByTopicId(topicId)
    } catch (error) {
      logger.error('Error in chat-dialogue-get-by-topic:', error)
      throw error
    }
  })

  ipcMain.handle(
    'chat-dialogue-add',
    async (_event, dialogue: Omit<ChatDialogueRow, 'id' | 'created_at'>) => {
      try {
        return await addDialogue(dialogue)
      } catch (error) {
        logger.error('Error in chat-dialogue-add:', error)
        throw error
      }
    }
  )

  ipcMain.handle('chat-dialogue-delete-by-topic', async (_event, topicId: number) => {
    try {
      return await deleteDialoguesByTopicId(topicId)
    } catch (error) {
      logger.error('Error in chat-dialogue-delete-by-topic:', error)
      throw error
    }
  })

  ipcMain.handle('chat-dialogue-delete', async (_event, id: number) => {
    try {
      return await deleteDialogueById(id)
    } catch (error) {
      logger.error('Error in chat-dialogue-delete:', error)
      throw error
    }
  })

  // --- Graph IPC handlers ---

  ipcMain.handle(
    'graph-data-get',
    async (_event, wikiId: number, typeFilter?: string, docIds?: number[]) => {
      try {
        return await getFullGraphData(wikiId, typeFilter, docIds)
      } catch (error) {
        logger.error('Error in graph-data-get:', error)
        throw error
      }
    }
  )

  ipcMain.handle('graph-entity-get', async (_event, entityId: number) => {
    try {
      return await getEntityById(entityId)
    } catch (error) {
      logger.error('Error in graph-entity-get:', error)
      throw error
    }
  })

  ipcMain.handle('graph-entity-search', async (_event, wikiId: number, query: string) => {
    try {
      return await searchEntities(wikiId, query)
    } catch (error) {
      logger.error('Error in graph-entity-search:', error)
      throw error
    }
  })

  ipcMain.handle(
    'graph-entity-update',
    async (_event, id: number, updates: Record<string, unknown>) => {
      try {
        return await updateEntity(id, updates as Record<string, unknown>)
      } catch (error) {
        logger.error('Error in graph-entity-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('graph-entity-delete', async (_event, id: number) => {
    try {
      return await deleteEntity(id)
    } catch (error) {
      logger.error('Error in graph-entity-delete:', error)
      throw error
    }
  })

  ipcMain.handle('graph-relation-delete', async (_event, id: number) => {
    try {
      return await deleteRelation(id)
    } catch (error) {
      logger.error('Error in graph-relation-delete:', error)
      throw error
    }
  })

  ipcMain.handle('graph-build-status', async (_event, wikiId: number) => {
    try {
      return await getLatestBuildJob(wikiId)
    } catch (error) {
      logger.error('Error in graph-build-status:', error)
      throw error
    }
  })

  ipcMain.on(
    'graph-build-start',
    async (event, wikiId: number, config?: Record<string, unknown>) => {
      const defaultModelId = settingsStore.get('defaultModelId') as number | undefined
      const model = await getProviderService().createModel(defaultModelId)
      const graphService = new KnowledgeGraphService(model)
      // 从系统设置读取图谱构建默认值，用户传入的config可覆盖
      const graphSettings = settingsStore.get('graph') as GraphSettings | undefined
      const mergedConfig: BuildConfig = {
        maxConcurrency: (config?.maxConcurrency as number) ?? graphSettings?.maxConcurrency ?? 8,
        enableGleaning:
          (config?.enableGleaning as boolean) ?? graphSettings?.enableGleaning ?? true,
        gleaningThreshold:
          (config?.gleaningThreshold as number) ?? graphSettings?.gleaningThreshold ?? 50,
        maxChunkSize: (config?.maxChunkSize as number) ?? graphSettings?.maxChunkSize ?? 2000,
        force: config?.force as boolean | undefined
      }
      try {
        const result = await graphService.buildGraph(
          wikiId,
          (progress) => {
            event.sender.send('graph-build-progress', progress)
          },
          mergedConfig
        )
        event.sender.send('graph-build-complete', {
          wikiId,
          entityCount: result.entities.length,
          relationCount: result.relations.length
        })
      } catch (error) {
        logger.error('Error in graph-build-start:', error)
        event.sender.send('graph-build-error', {
          wikiId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  )

  ipcMain.handle('graph-processed-docs-get', async (_event, wikiId: number) => {
    try {
      const job = await getBuildJobByWikiId(wikiId)
      if (job?.processed_note_ids) {
        return JSON.parse(job.processed_note_ids) as number[]
      }
      return []
    } catch (error) {
      logger.error('Error in graph-processed-docs-get:', error)
      throw error
    }
  })

  ipcMain.handle('graph-docs-append', async (event, wikiId: number, docIds: number[]) => {
    const defaultModelId = settingsStore.get('defaultModelId') as number | undefined
    const model = await getProviderService().createModel(defaultModelId)
    const graphService = new KnowledgeGraphService(model)
    try {
      const result = await graphService.appendDocs(wikiId, docIds, (progress) => {
        event.sender.send('graph-build-progress', progress)
      })
      event.sender.send('graph-build-complete', {
        wikiId,
        entityCount: result.entitiesAdded,
        relationCount: result.relationsAdded
      })
      return result
    } catch (error) {
      logger.error('Error in graph-docs-append:', error)
      event.sender.send('graph-build-error', {
        wikiId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  })

  // --- Provider IPC handlers ---

  ipcMain.handle('provider-get-all', async () => {
    try {
      return await getAllProviders()
    } catch (error) {
      logger.error('Error in provider-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('provider-get-by-id', async (_event, id: number) => {
    try {
      return await getProviderById(id)
    } catch (error) {
      logger.error('Error in provider-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle('provider-get-default', async () => {
    try {
      return await getDefaultProvider()
    } catch (error) {
      logger.error('Error in provider-get-default:', error)
      throw error
    }
  })

  ipcMain.handle('provider-get-enabled', async () => {
    try {
      return await getEnabledProviders()
    } catch (error) {
      logger.error('Error in provider-get-enabled:', error)
      throw error
    }
  })

  ipcMain.handle('provider-create', async (_event, input: LlmProviderInput) => {
    try {
      const id = await createProvider(input)
      getProviderService().clearCache()
      return id
    } catch (error) {
      logger.error('Error in provider-create:', error)
      throw error
    }
  })

  ipcMain.handle(
    'provider-update',
    async (_event, id: number, updates: Partial<LlmProviderInput>) => {
      try {
        const result = await updateProvider(id, updates)
        getProviderService().clearCache()
        return result
      } catch (error) {
        logger.error('Error in provider-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('provider-delete', async (_event, id: number) => {
    try {
      const result = await deleteProvider(id)
      getProviderService().clearCache()
      return result
    } catch (error) {
      logger.error('Error in provider-delete:', error)
      throw error
    }
  })

  ipcMain.handle('provider-set-default', async (_event, id: number) => {
    try {
      const result = await setDefaultProvider(id)
      getProviderService().clearCache()
      return result
    } catch (error) {
      logger.error('Error in provider-set-default:', error)
      throw error
    }
  })

  await createLoadingWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLoadingWindow()
    }
  })
})

let quitPrepared = false
app.on('before-quit', (event) => {
  if (quitPrepared) return
  // 拦截首次退出：先完成清理（中止流、保存数据、关闭数据库）再真正退出
  event.preventDefault()
  quitPrepared = true
  ;(async () => {
    try {
      // 中止进行中的对话流，等待其保存对话数据（最多等待 5 秒兜底）
      if (activeChatStreams.size > 0) {
        for (const controller of streamAbortControllers.values()) {
          controller.abort()
        }
        await Promise.race([
          Promise.allSettled([...activeChatStreams]),
          new Promise((resolve) => setTimeout(resolve, 5000))
        ])
      }
      if (database) {
        await database.close()
      }
    } catch (error) {
      logger.error('Error during app shutdown:', error)
    }
    app.quit()
  })()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
