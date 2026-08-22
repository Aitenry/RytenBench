import { app, shell, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createDatabase, Database } from './database/loading'
import { migrateWorkspaceData } from './database/workspace-migration'
import { getActiveWorkspaceId, setActiveWorkspaceIdProvider } from './database/workspace-context'
import { getIp } from './address'
import _Store from 'electron-store'
import logger from 'electron-log'
import * as fs from 'fs'
import crypto from 'crypto'
import { fetchWeatherApi } from 'openmeteo'
import { weatherCodeMap, formatDate, weekdayLabel } from './shared/weather-utils'
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
import { ChatService, buildTools, loadSubAgentDefinitions, availableTools } from './chat'
import type { ToolCallDetail, SubAgentEvent, MemoryInjection } from './chat/types'
import { todoStore } from './chat/runtime/todo'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
// BaseMessage 等 LangChain 类型已移入 ChatService 内部使用
import { KnowledgeGraphService, BuildConfig } from './graph'
import { getProviderService } from './provider/service'
import { type FetchedModelInfo, findModelProfile, geminiModelId } from './provider/model-tags'
import {
  getAllProviders,
  getProviderById,
  getDefaultProvider,
  getEnabledProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  setDefaultProvider,
  LlmProviderInput,
  LlmProviderConfig
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
  getAllWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getAllTopics,
  getAllTopicsPaginated,
  getTopicById,
  createTopic,
  updateTopic,
  deleteTopic,
  getDialoguesByTopicId,
  getDialoguesByTopicIdPaginated,
  addDialogue,
  deleteDialoguesByTopicId,
  deleteDialogueById
} from './database/mapper/chat'
import type { ChatTopicRow, ChatDialogueRow } from './database/mapper/chat'
import {
  getAllAgents,
  getAgentsPaginated,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  AgentConfigInput
} from './database/mapper/agent'
import type { SubAgentConfig } from './chat/types'

// 单实例锁：防止多开，同时确保安装程序能正确检测和关闭进程
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
logger.transports.file.fileName = 'main.log'

const Store = _Store['default'] || _Store
const settingsStore = new Store({ name: 'settings' })
// 全局活动工作区读取器（IPC 层与 AI 工具层共用）
setActiveWorkspaceIdProvider(() => {
  const chat = settingsStore.get('chat') as ChatSettings | undefined
  return chat?.activeWorkspaceId ?? 0
})
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

// ── 预加载缓存：loading 阶段预取 ChatProvider 所需数据 ──
let cachedEnabledProviders: LlmProviderConfig[] | null = null
let cachedDefaultProvider: LlmProviderConfig | null = null
let cachedSubAgentDefs: Map<number, SubAgentConfig[]> | null = null

function clearProviderCache(): void {
  cachedEnabledProviders = null
  cachedDefaultProvider = null
}

function clearAgentCache(): void {
  cachedSubAgentDefs = null
}

async function getSubAgentDefs(workspaceId: number): Promise<SubAgentConfig[]> {
  if (!cachedSubAgentDefs) cachedSubAgentDefs = new Map()
  if (cachedSubAgentDefs.has(workspaceId)) return cachedSubAgentDefs.get(workspaceId)!
  const defs = await loadSubAgentDefinitions(workspaceId)
  cachedSubAgentDefs.set(workspaceId, defs)
  return defs
}

function clearTopicCache(): void {
  // 话题数据不再全量缓存，前端使用分页查询
}

async function preloadChatData(): Promise<void> {
  try {
    const chatSettings = settingsStore.get('chat') as ChatSettings | undefined
    const workspaceId = chatSettings?.activeWorkspaceId ?? 0
    const [enabled, defaultProvider, topicsResult, subAgents] = await Promise.all([
      getEnabledProviders(),
      getDefaultProvider(),
      getAllTopicsPaginated(workspaceId, 0, 20),
      loadSubAgentDefinitions(workspaceId)
    ])
    cachedEnabledProviders = enabled
    cachedDefaultProvider = defaultProvider
    if (!cachedSubAgentDefs) cachedSubAgentDefs = new Map()
    cachedSubAgentDefs.set(workspaceId, subAgents)
    logger.info('[Preload] Chat data preloaded:', {
      providers: enabled.length,
      topics: topicsResult.items.length,
      topicsTotal: topicsResult.total,
      subAgents: subAgents.length
    })
  } catch (err) {
    logger.error('[Preload] Failed to preload chat data:', err)
  }
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
    { name: '初始化数据库', execute: async () => (database = await createDatabase()) },
    {
      name: '初始化工作区',
      execute: async () => {
        if (!database) return
        const result = await migrateWorkspaceData(database.getDatabase(), () => {
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
    .then(async () => {
      logger.info('All initialization tasks completed.')
      // 预加载 ChatProvider 所需数据，不阻塞 init-complete 发送
      preloadChatData()
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
    width: 1200,
    height: 800, // 打开应用时即为最小尺寸（与 min 一致），可后续手动拉大
    minWidth: 1200,
    minHeight: 800,
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

  // 窗口控制 IPC（作用于发送方窗口：主窗口与 mermaid 预览窗口共用）
  const windowMaxStates = new Map<
    number,
    { isMaximized: boolean; normalBounds: Electron.Rectangle | null }
  >()

  const winFromEvent = (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent
  ): BrowserWindow | null => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.once('closed', () => windowMaxStates.delete(win.id))
    }
    return win
  }

  ipcMain.on('window-minimize', (event) => {
    winFromEvent(event)?.minimize()
  })
  ipcMain.on('window-maximize', (event) => {
    const win = winFromEvent(event)
    if (!win || win.isDestroyed()) return
    let st = windowMaxStates.get(win.id)
    if (!st) {
      st = { isMaximized: false, normalBounds: null }
      windowMaxStates.set(win.id, st)
    }
    if (st.isMaximized) {
      // 还原到之前的尺寸和位置
      if (st.normalBounds) win.setBounds(st.normalBounds)
      st.isMaximized = false
    } else {
      // 保存当前尺寸，然后最大化到可用工作区
      st.normalBounds = win.getBounds()
      const { workArea } = screen.getPrimaryDisplay()
      win.setBounds({
        x: workArea.x,
        y: workArea.y,
        width: workArea.width,
        height: workArea.height
      })
      st.isMaximized = true
    }
    win.webContents.send('window-maximized', st.isMaximized)
  })
  ipcMain.on('window-close', (event) => {
    winFromEvent(event)?.close()
  })
  ipcMain.handle('window-is-maximized', (event) => {
    const win = winFromEvent(event)
    return win ? (windowMaxStates.get(win.id)?.isMaximized ?? false) : false
  })

  /* ── Mermaid 预览窗口（可拖拽/缩放画布） ── */

  const ICON_CENTER =
    'M13 1L13.001 4.06201C16.6192 4.51365 19.4869 7.38163 19.9381 11L23 11V13L19.938 13.001C19.4864 16.6189 16.6189 19.4864 13.001 19.938L13 23H11L11 19.9381C7.38163 19.4869 4.51365 16.6192 4.06201 13.001L1 13V11L4.06189 11C4.51312 7.38129 7.38129 4.51312 11 4.06189L11 1H13ZM12 6C8.68629 6 6 8.68629 6 12C6 15.3137 8.68629 18 12 18C15.3137 18 18 15.3137 18 12C18 8.68629 15.3137 6 12 6ZM12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12C10 10.8954 10.8954 10 12 10Z'
  // 标题栏图标（与应用 TitleBar 同款）：最小化 / 最大化 / 还原 / 关闭 / 图表
  const ICON_MIN = 'M5 11V13H19V11H5Z'
  const ICON_MAX =
    'M6.41421 5H10V3H3V10H5V6.41421L9.29289 10.7071L10.7071 9.29289L6.41421 5ZM21 14H19V17.5858L14.7071 13.2929L13.2929 14.7071L17.5858 19H14V21H21V14Z'
  const ICON_RESTORE =
    'M9.00008 4.00008H11.0001V11.0001H4.00008V9.00008H7.58586L3.29297 4.70718L4.70718 3.29297L9.00008 7.58586V4.00008ZM20 15H16.4142L20.7071 19.2929L19.2929 20.7071L15 16.4142V20H13V13H20V15Z'
  const ICON_POWER =
    'M6.26489 3.80698L7.41191 5.44558C5.34875 6.89247 4 9.28873 4 12C4 16.4183 7.58172 20 12 20C16.4183 20 20 16.4183 20 12C20 9.28873 18.6512 6.89247 16.5881 5.44558L17.7351 3.80698C20.3141 5.61559 22 8.61091 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 8.61091 3.68594 5.61559 6.26489 3.80698ZM11 12V2H13V12H11Z'
  const ICON_FLOW =
    'M6 21.5C4.067 21.5 2.5 19.933 2.5 18C2.5 16.067 4.067 14.5 6 14.5C7.5852 14.5 8.92427 15.5539 9.35481 16.9992L15 16.9994V15L17 14.9994V9.24339L14.757 6.99938H9V9.00003H3V3.00003H9V4.99939H14.757L18 1.75739L22.2426 6.00003L19 9.24139V14.9994L21 15V21H15V18.9994L9.35499 19.0003C8.92464 20.4459 7.58543 21.5 6 21.5ZM6 16.5C5.17157 16.5 4.5 17.1716 4.5 18C4.5 18.8285 5.17157 19.5 6 19.5C6.82843 19.5 7.5 18.8285 7.5 18C7.5 17.1716 6.82843 16.5 6 16.5ZM19 17H17V19H19V17ZM18 4.58581L16.5858 6.00003L18 7.41424L19.4142 6.00003L18 4.58581ZM7 5.00003H5V7.00003H7V5.00003Z'

  function buildMermaidPreviewHtml(svg: string): string {
    const safeSvg = svg.replace(/\$\{/g, '\\${')
    const icon = (d: string, size = 14): string =>
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: transparent; font-family: system-ui, sans-serif; }
  /* 与应用主窗口同款：圆角无边框自定义窗口 */
  #app { height: 100vh; box-sizing: border-box; border-radius: 12px; background: #141414; border: 1px solid rgba(255,255,255,0.08); overflow: hidden; display: flex; flex-direction: column; }
  #titlebar { height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 6px 0 12px; -webkit-app-region: drag; user-select: none; background: #171717; border-bottom: 1px solid rgba(255,255,255,0.08); }
  #titlebar .title { display: flex; align-items: center; gap: 8px; font-size: 12px; color: rgba(255,255,255,0.6); }
  #titlebar .title svg { color: rgba(255,255,255,0.45); }
  #titlebar .controls { display: flex; align-items: center; gap: 2px; -webkit-app-region: no-drag; }
  #titlebar .ctrl-btn { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 26px; border: none; background: transparent; color: rgba(255,255,255,0.65); border-radius: 6px; cursor: pointer; transition: background 0.15s, color 0.15s; }
  #titlebar .ctrl-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
  #titlebar .ctrl-btn.close:hover { background: #e81123; color: #fff; }
  #stage { flex: 1; position: relative; cursor: grab; touch-action: none; user-select: none; }
  #stage.dragging { cursor: grabbing; }
  #viewport { position: absolute; left: 0; right: 0; top: 0; padding: 24px; box-sizing: border-box; transform-origin: 0 0; will-change: transform; text-align: center; }
  #viewport svg { display: block; max-width: none !important; height: auto; margin: 0; }
  #toolbar { position: absolute; top: 14px; right: 14px; display: flex; gap: 8px; z-index: 10; }
  #toolbar button { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: 1px solid rgba(255,255,255,0.18); border-radius: 10px; background: rgba(20,20,20,0.72); color: #d8d8d8; cursor: pointer; transition: background 0.15s, color 0.15s; }
  #toolbar button:hover { background: rgba(255,255,255,0.14); color: #fff; }
  #hint { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,0.35); font-size: 12px; z-index: 10; pointer-events: none; }
</style>
</head>
<body>
  <div id="app">
    <div id="titlebar">
      <div class="title">${icon(ICON_FLOW, 14)}<span>Mermaid 预览</span></div>
      <div class="controls">
        <button id="win-min" class="ctrl-btn" title="最小化">${icon(ICON_MIN)}</button>
        <button id="win-max" class="ctrl-btn" title="最大化">${icon(ICON_MAX)}</button>
        <button id="win-close" class="ctrl-btn close" title="关闭">${icon(ICON_POWER)}</button>
      </div>
    </div>
    <div id="stage">
      <div id="viewport">${safeSvg}</div>
      <div id="toolbar"><button id="fit" title="居中画布">${icon(ICON_CENTER, 18)}</button></div>
      <div id="hint">拖拽平移 · 滚轮缩放 · 双击居中 · Esc 关闭</div>
    </div>
  </div>
<script>
  var stage = document.getElementById('stage')
  var viewport = document.getElementById('viewport')
  var tx = 0, ty = 0, scale = 1
  var MIN = 0.2, MAX = 5
  function apply() { viewport.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')' }
  // 适配：把 SVG 等比缩小到窗口可见区域并居中（先量未缩放尺寸）
  function fit() {
    var svg = viewport.querySelector('svg')
    if (!svg) { tx = 0; ty = 0; scale = 1; apply(); return }
    // 按自然尺寸（viewBox）布局，覆盖 mermaid 输出的 width="100%"，避免拉伸
    if (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width > 0) {
      svg.style.width = svg.viewBox.baseVal.width + 'px'
      svg.style.height = svg.viewBox.baseVal.height + 'px'
    }
    viewport.style.transform = ''
    var w = svg.getBoundingClientRect().width
    var h = svg.getBoundingClientRect().height
    var r = stage.getBoundingClientRect()
    var s = Math.min(1, (r.width - 48) / Math.max(1, w), (r.height - 48) / Math.max(1, h))
    scale = s
    // svg 从 viewport padding 内左上起排，且 padding 偏移会随 scale 放大，
    // 居中偏移需减 24*s 才能精确居中
    tx = (r.width - w * s) / 2 - 24 * s
    ty = (r.height - h * s) / 2 - 24 * s
    apply()
  }
  stage.addEventListener('wheel', function (e) {
    e.preventDefault()
    var r = stage.getBoundingClientRect()
    var mx = e.clientX - r.left, my = e.clientY - r.top
    var next = Math.min(MAX, Math.max(MIN, scale * Math.exp(-e.deltaY * 0.0015)))
    var k = next / scale
    tx = mx - (mx - tx) * k
    ty = my - (my - ty) * k
    scale = next
    apply()
  }, { passive: false })
  var drag = null
  stage.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return
    e.preventDefault()
    drag = { sx: e.clientX, sy: e.clientY, tx: tx, ty: ty }
    stage.classList.add('dragging')
  })
  window.addEventListener('mousemove', function (e) {
    if (!drag) return
    tx = drag.tx + e.clientX - drag.sx
    ty = drag.ty + e.clientY - drag.sy
    apply()
  })
  window.addEventListener('mouseup', function () { drag = null; stage.classList.remove('dragging') })
  stage.addEventListener('dblclick', function (e) { e.preventDefault(); fit() })
  document.getElementById('fit').onclick = fit
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.api.window.close() })
  // 窗口尺寸变化（拉伸/最大化）后重新适配居中
  var resizeTimer = null
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(fit, 120)
  })
  // 标题栏窗口控制（复用主窗口 IPC，按发送方窗口生效）
  document.getElementById('win-min').onclick = function () { window.api.window.minimize() }
  document.getElementById('win-close').onclick = function () { window.api.window.close() }
  var maxBtn = document.getElementById('win-max')
  function setMaxIcon(m) {
    maxBtn.innerHTML = m ? '${icon(ICON_RESTORE)}' : '${icon(ICON_MAX)}'
    maxBtn.title = m ? '还原' : '最大化'
  }
  maxBtn.onclick = function () { window.api.window.maximize() }
  window.api.window.onMaximized(function (m) { setMaxIcon(m) })
  window.api.window.isMaximized().then(setMaxIcon)
  fit()
</script>
</body>
</html>`
  }

  let mermaidPreviewWin: BrowserWindow | null = null
  ipcMain.handle('mermaid-preview', (_event, svg: string) => {
    const dataUrl =
      'data:text/html;charset=utf-8,' + encodeURIComponent(buildMermaidPreviewHtml(svg))
    if (mermaidPreviewWin && !mermaidPreviewWin.isDestroyed()) {
      void mermaidPreviewWin.loadURL(dataUrl)
      mermaidPreviewWin.focus()
      return
    }
    // 独立预览窗口：与应用同款自定义无边框标题栏，可拉伸、可最大化，不占满全屏
    const { workAreaSize } = screen.getPrimaryDisplay()
    mermaidPreviewWin = new BrowserWindow({
      width: Math.round(Math.min(1200, workAreaSize.width * 0.7)),
      height: Math.round(Math.min(800, workAreaSize.height * 0.75)),
      minWidth: 480,
      minHeight: 360,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      title: 'Mermaid 预览',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false
      }
    })
    mermaidPreviewWin.on('closed', () => {
      mermaidPreviewWin = null
    })
    mermaidPreviewWin.on('ready-to-show', () => {
      mermaidPreviewWin?.show()
    })
    void mermaidPreviewWin.loadURL(dataUrl)
  })

  // --- Weather ---

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
      const todayStr = formatDate(new Date())

      for (let i = 0; i < wc.length; i++) {
        const dayTime = new Date((startTime + i * dayInterval) * 1000)
        const dateStr = formatDate(dayTime)
        ;(result.daily as Record<string, unknown>[]).push({
          label: dateStr === todayStr ? '今天' : weekdayLabel(dayTime),
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

      let ip = settingsStore.get('ip') as Record<string, unknown> | undefined
      // 如果 IP 数据在初始化时没取到，尝试现场获取
      if (!ip) {
        try {
          ip = (await getIp()) as unknown as Record<string, unknown> | undefined
          if (ip) settingsStore.set('ip', ip)
        } catch {
          // getIp 失败（超时等），静默处理
        }
        if (!ip) return {}
      }
      const lat = ip.lat as number | undefined
      const lon = ip.lon as number | undefined
      const city = (ip.city as string) || (ip.regionName as string) || ''
      if (!lat || !lon) return {}
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
      return await getTodoItemByTitle(getActiveWorkspaceId(), title)
    } catch (error) {
      console.error('Error in todo-items-get-by-title:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-by-priority', async (_event, priority: number) => {
    try {
      return await getTodoItemsByPriority(getActiveWorkspaceId(), priority)
    } catch (error) {
      console.error('Error in todo-items-get-by-priority:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-by-completed-status', async (_event, status: number) => {
    try {
      return await getTodoItemsByPriority(getActiveWorkspaceId(), status)
    } catch (error) {
      console.error('Error in todo-items-get-by-completed-status:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-schedule', async () => {
    try {
      return await getAllTodoItems(getActiveWorkspaceId())
    } catch (error) {
      console.error('Error in todo-items-get-schedule:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-paginated', async (_event, page: number, pageSize: number) => {
    try {
      return await getTodoItemsPaginated(getActiveWorkspaceId(), page, pageSize)
    } catch (error) {
      console.error('Error in todo-items-get-paginated:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-by-due-date', async (_event, dueDate: string) => {
    try {
      return await getTodoItemsByDueDate(getActiveWorkspaceId(), dueDate)
    } catch (error) {
      console.error('Error in todo-items-get-by-due-date:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-add', async (_event, todoItem: Omit<TodoItemRow, 'id'>) => {
    try {
      return await addTodoItem(getActiveWorkspaceId(), todoItem)
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
      return await getAllDependencies(getActiveWorkspaceId())
    } catch (error) {
      console.error('Error in task-deps-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('task-deps-get-with-tasks', async () => {
    try {
      return await getAllTasksWithDependencies(getActiveWorkspaceId())
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
        return await getAllDocs(getActiveWorkspaceId(), page, pageSize, excludeWikiId, search)
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
        return await getDocPage(getActiveWorkspaceId(), query, page, pageSize)
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
        return await addDoc(getActiveWorkspaceId(), doc)
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
        'SELECT id FROM documents WHERE workspace_id = $1 AND created_at >= $2 AND created_at <= $3',
        [getActiveWorkspaceId(), startTime, endTime]
      )
      const deletedIds = idsResult.rows.map((r) => r.id)

      const result = await deleteDocsByTimeRange(getActiveWorkspaceId(), startTime, endTime)

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
      return await getAllWikis(getActiveWorkspaceId(), page, pageSize)
    } catch (error) {
      console.error('Error in wiki-get-all:', error)
      throw error
    }
  })

  ipcMain.handle(
    'wiki-add',
    async (_event, wiki: Omit<WikiRow, 'id' | 'doc_count' | 'created_at' | 'updated_at'>) => {
      try {
        return await addWiki(getActiveWorkspaceId(), wiki)
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
        providerId?: number
        images?: string[]
        documents?: { fileName: string; filePath: string }[]
      }
    ) => {
      // 加载主智能体默认配置（electron-store）
      const mainAgentDefaults = settingsStore.get('mainAgent') as
        { tools?: string[]; skills?: string[] } | undefined
      const tools = buildTools(mainAgentDefaults?.tools ?? [])
      logger.info(`[Chat] Creating model with providerId: ${options?.providerId ?? 'default'}`)
      const model = await getProviderService().createModel(options?.providerId)
      const chatSettings = settingsStore.get('chat') as ChatSettings | undefined

      // 技能优先级：chatSettings.enabledSkills > mainAgent.skills
      const effectiveSkills = chatSettings?.enabledSkills ?? mainAgentDefaults?.skills

      const chatService = new ChatService(
        model,
        tools,
        await getSubAgentDefs(chatSettings?.activeWorkspaceId ?? 0),
        getDialoguesByTopicId,
        chatSettings?.skillsPath || undefined,
        effectiveSkills,
        chatSettings?.workspacePath || undefined,
        chatSettings?.memoryPath || undefined,
        chatSettings?.activeWorkspaceId ?? 0
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
        topicId?: number
        providerId?: number
        images?: string[]
        documents?: { fileName: string; filePath: string }[]
      }
    ) => {
      // 跟踪进行中的流：应用退出时统一中止并等待数据保存完成
      const streamPromise = (async () => {
        // 加载主智能体默认配置（electron-store）
        const mainAgentDefaults = settingsStore.get('mainAgent') as
          { tools?: string[]; skills?: string[] } | undefined
        const tools = buildTools(mainAgentDefaults?.tools ?? [])
        logger.info(`[Chat] Creating model with providerId: ${options?.providerId ?? 'default'}`)

        // 模型创建可能因供应商不存在、被禁用、模型名称为空等原因失败，需要捕获并通知前端
        let model: BaseChatModel
        try {
          model = await getProviderService().createModel(options?.providerId)
        } catch (modelErr) {
          const errMsg = modelErr instanceof Error ? modelErr.message : String(modelErr)
          logger.error('[Chat] Model creation failed:', errMsg)
          if (!event.sender.isDestroyed()) {
            try {
              event.sender.send('chat-stream-error', { error: errMsg, topicId: options?.topicId })
              event.sender.send('chat-stream-done', { topicId: options?.topicId ?? 0 })
            } catch (sendErr) {
              logger.warn('[Chat] Failed to send stream error/done (renderer disposed):', sendErr)
            }
          }
          return
        }

        const chatSettings = settingsStore.get('chat') as ChatSettings | undefined

        // 创建 AbortController 用于取消流式输出
        const abortController = new AbortController()
        streamAbortControllers.set(event.sender.id, abortController)

        // 1. 确保话题存在
        let topicId = options?.topicId
        if (!topicId) {
          const title = question.slice(0, 50)
          const workspaceId = chatSettings?.activeWorkspaceId ?? 0
          try {
            topicId = await createTopic(
              workspaceId,
              title,
              undefined,
              mainAgentDefaults?.tools?.length ? JSON.stringify(mainAgentDefaults.tools) : undefined
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

        // 2.5. 历史对话上下文由 ChatService 内部从数据库加载（超长自动压缩）

        // 技能优先级：chatSettings.enabledSkills > mainAgent.skills
        const effectiveSkills = chatSettings?.enabledSkills ?? mainAgentDefaults?.skills

        const chatService = new ChatService(
          model,
          tools,
          await getSubAgentDefs(chatSettings?.activeWorkspaceId ?? 0),
          getDialoguesByTopicId,
          chatSettings?.skillsPath || undefined,
          effectiveSkills,
          chatSettings?.workspacePath || undefined,
          chatSettings?.memoryPath || undefined,
          chatSettings?.activeWorkspaceId ?? 0
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
          /** 本轮注入的热记忆（memoryInjected 类型；随 blocks 持久化，历史对话可恢复显示） */
          memory?: MemoryInjection
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
            // 本轮热记忆注入：置于消息块最顶部（首个 chunk 到达，仅累积一次，随 blocks 持久化）
            if (chunk.memoryInjected) {
              const exists = accumulatedBlocks.some((b) => b.type === 'memoryInjected')
              if (!exists) {
                accumulatedBlocks.unshift({
                  type: 'memoryInjected',
                  memory: chunk.memoryInjected
                })
              }
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
                      b.tool.card = chunk.tool.card
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

              // 注意：不把子智能体输出拼入 fullContent（主消息 content）。
              // 子智能体详情已持久化在 blocks 的 subAgent 块（含 children），
              // 历史重载按 blocks 渲染即可；若再拼入 content，会导致：
              // ① 复制消息/上下文注入时子智能体全文重复出现在主智能体发言中；
              // ② 主模型下一轮看到重复文本，进一步放大复述行为。
              // 子智能体块匹配逻辑见下：

              // 匹配智能体累积块：优先 causeId，回退 name
              const matchesSa = (b: (typeof accumulatedBlocks)[number]): boolean => {
                if (b.type !== 'subAgent' || !b.subAgent) return false
                if (sa.causeId && b.subAgent.causeId) return b.subAgent.causeId === sa.causeId
                return b.subAgent.name === sa.name
              }

              // 查找或创建同名智能体累积块
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
                        c.tool.card = sa.tool.card
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
            if (!event.sender.isDestroyed()) {
              try {
                event.sender.send('chat-stream-chunk', { ...chunk, __topicId: topicId })
              } catch (sendErr) {
                logger.warn('[Chat] Failed to send stream chunk (renderer disposed):', sendErr)
                break
              }
            }
          }
        } catch (error) {
          if ((error as Error)?.name !== 'AbortError') {
            logger.error('Error in chat stream:', error)
            const errMsg = error instanceof Error ? error.message : String(error)
            if (!event.sender.isDestroyed()) {
              try {
                event.sender.send('chat-stream-error', { error: errMsg, topicId })
              } catch (sendErr) {
                logger.warn('[Chat] Failed to send stream error (renderer disposed):', sendErr)
              }
            }
            // 流异常中断时不保存不完整的 AI 回复，直接跳到清理
            streamAbortControllers.delete(event.sender.id)
            if (!event.sender.isDestroyed()) {
              try {
                event.sender.send('chat-stream-done', { topicId })
              } catch (sendErr) {
                logger.warn('[Chat] Failed to send stream done (renderer disposed):', sendErr)
              }
            }
            return
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
          try {
            event.sender.send('chat-stream-done', { topicId })
          } catch (sendErr) {
            logger.warn('[Chat] Failed to send stream done (renderer disposed):', sendErr)
          }
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

  // 对话计划清单（write_todos）变更 → 广播到渲染进程（输入框上方的进行中任务卡片）
  todoStore.onChange = (topicId, todos) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('chat-todos-updated', { topicId, todos })
      }
    }
  }

  // 选择记忆（Memory）存储目录
  ipcMain.handle('chat-select-memory-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择记忆存储目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // --- Mnemon 记忆管理 IPC（三层记忆：热记忆 / 长期空间 / 档案） ---

  // 当前记忆目录（从设置读取）
  const currentMemoryPath = (): string | undefined => {
    const chatSettings = settingsStore.get('chat') as ChatSettings | undefined
    return chatSettings?.memoryPath || undefined
  }

  // 当前工作区 Mnemon 组件（记忆按工作区目录隔离：<memoryPath>/workspace-<id>/mnemon）
  const currentMnemonComponent = async () => {
    const { getMnemonComponent } = await import('./chat/mnemon-singleton')
    return getMnemonComponent(currentMemoryPath(), getActiveWorkspaceId())
  }

  // 记忆系统总览快照
  ipcMain.handle('mnemon-snapshot', async () => {
    const component = await currentMnemonComponent()
    if (!component) {
      return { configured: false, error: '未配置记忆存储目录' }
    }
    const [runtime, bodies, documents] = await Promise.all([
      Promise.resolve(component.runtimeMemory.snapshot()),
      component.service.bodies(),
      Promise.resolve(component.documents.snapshot())
    ])
    return { configured: true, runtime, bodies, documents }
  })

  // 热记忆增删改（add / replace / remove）
  ipcMain.handle(
    'mnemon-runtime-mutate',
    async (
      _event,
      request: {
        action: string
        target: string
        content?: string
        old_text?: string
        importance?: string
      }
    ) => {
      const component = await currentMnemonComponent()
      if (!component) return { success: false, message: '未配置记忆存储目录' }
      return await component.runtimeMemory.mutate({
        action: request.action as 'add' | 'replace' | 'remove',
        target: request.target as 'user' | 'memory',
        content: request.content,
        oldText: request.old_text,
        importance: request.importance as 'critical' | 'normal' | 'low' | undefined
      })
    }
  )

  // 长期记忆空间目录
  ipcMain.handle('mnemon-bodies', async () => {
    const component = await currentMnemonComponent()
    if (!component) return { items: [], total: 0, activeCount: 0, directory: '', generatedAt: '' }
    return await component.service.bodies()
  })

  // 创建记忆空间
  ipcMain.handle(
    'mnemon-body-create',
    async (_event, request: { name: string; description: string }) => {
      const component = await currentMnemonComponent()
      if (!component) return { success: false, message: '未配置记忆存储目录' }
      try {
        const body = await component.service.createBody(request)
        return { success: true, body }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // 更新记忆空间（名称/描述/激活）
  ipcMain.handle(
    'mnemon-body-update',
    async (
      _event,
      id: string,
      request: { name?: string; description?: string; active?: boolean }
    ) => {
      const component = await currentMnemonComponent()
      if (!component) return { success: false, message: '未配置记忆存储目录' }
      try {
        const body = component.service.updateBody(id, request)
        return { success: true, body }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // 记忆空间内容浏览
  ipcMain.handle('mnemon-body-list', async (_event, memoryBodyIds?: string[]) => {
    const component = await currentMnemonComponent()
    if (!component) return []
    try {
      return await component.service.list(memoryBodyIds, 200)
    } catch {
      return []
    }
  })

  // 档案快照
  ipcMain.handle('mnemon-document-snapshot', async () => {
    const component = await currentMnemonComponent()
    if (!component) return null
    return component.documents.snapshot()
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

  // 选择 AI 工作区目录（FilesystemBackend 挂载根目录）
  ipcMain.handle('chat-select-workspace', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择 AI 工作区目录'
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

  // --- Chat Workspace IPC handlers ---

  ipcMain.handle('workspace-get-all', async () => {
    try {
      return await getAllWorkspaces()
    } catch (error) {
      logger.error('Error in workspace-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('workspace-create', async (_event, name: string, path: string) => {
    try {
      return await createWorkspace(name, path)
    } catch (error) {
      logger.error('Error in workspace-create:', error)
      throw error
    }
  })

  ipcMain.handle('workspace-update', async (_event, id: number, updates: { name: string }) => {
    try {
      return await updateWorkspace(id, updates)
    } catch (error) {
      logger.error('Error in workspace-update:', error)
      throw error
    }
  })

  ipcMain.handle('workspace-delete', async (_event, id: number) => {
    try {
      clearTopicCache()
      return await deleteWorkspace(id)
    } catch (error) {
      logger.error('Error in workspace-delete:', error)
      throw error
    }
  })

  // --- Chat Topic IPC handlers ---

  ipcMain.handle('chat-topic-get-all', async (_event, workspaceId: number) => {
    try {
      return await getAllTopics(workspaceId)
    } catch (error) {
      logger.error('Error in chat-topic-get-all:', error)
      throw error
    }
  })

  ipcMain.handle(
    'chat-topic-get-paginated',
    async (_event, workspaceId: number, page: number, pageSize: number) => {
      try {
        return await getAllTopicsPaginated(workspaceId, page, pageSize)
      } catch (error) {
        logger.error('Error in chat-topic-get-paginated:', error)
        throw error
      }
    }
  )

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
    async (_event, workspaceId: number, title: string, model?: string, selectedTools?: string) => {
      try {
        clearTopicCache()
        return await createTopic(workspaceId, title, model, selectedTools)
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
        clearTopicCache()
        return await updateTopic(id, updates)
      } catch (error) {
        logger.error('Error in chat-topic-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('chat-topic-delete', async (_event, id: number) => {
    try {
      clearTopicCache()
      // 清理该话题的对话计划清单（进程级 todoStore）
      todoStore.clear(id)
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
    'chat-dialogue-get-by-topic-paginated',
    async (_event, topicId: number, page: number, pageSize: number) => {
      try {
        return await getDialoguesByTopicIdPaginated(topicId, page, pageSize)
      } catch (error) {
        logger.error('Error in chat-dialogue-get-by-topic-paginated:', error)
        throw error
      }
    }
  )

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

  // --- Workspace File Explorer IPC handlers ---

  ipcMain.handle('workspace-list-dir', async (_event, dirPath: string) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      return entries
        .filter((d) => !d.name.startsWith('.') || d.name === '.gitignore')
        .map((d) => ({
          name: d.name,
          isDirectory: d.isDirectory(),
          path: join(dirPath, d.name)
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
    } catch (error) {
      logger.error('Error in workspace-list-dir:', error)
      throw error
    }
  })

  ipcMain.handle('workspace-read-file', async (_event, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return content
    } catch (error) {
      logger.error('Error in workspace-read-file:', error)
      throw error
    }
  })

  ipcMain.handle('workspace-save-file', async (_event, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return true
    } catch (error) {
      logger.error('Error in workspace-save-file:', error)
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
      // 未配置图谱构建模型时，不进入构建流程——通过错误事件通知渲染层弹出友好提醒
      let model: BaseChatModel
      try {
        const defaultModelId = settingsStore.get('defaultModelId') as number | undefined
        model = await getProviderService().createModel(defaultModelId)
      } catch (error) {
        logger.error('Error in graph-build-start (model):', error)
        event.sender.send('graph-build-error', {
          wikiId,
          error: '未配置图谱构建模型：请先到「系统设置 → 图谱」中选择用于构建知识图谱的大模型。'
        })
        return
      }
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
    // 未配置图谱构建模型时，不进入追加流程——通过错误事件通知渲染层弹出友好提醒
    let model: BaseChatModel
    try {
      const defaultModelId = settingsStore.get('defaultModelId') as number | undefined
      model = await getProviderService().createModel(defaultModelId)
    } catch (error) {
      logger.error('Error in graph-docs-append (model):', error)
      event.sender.send('graph-build-error', {
        wikiId,
        error: '未配置图谱构建模型：请先到「系统设置 → 图谱」中选择用于构建知识图谱的大模型。'
      })
      return { entitiesAdded: 0, relationsAdded: 0 }
    }
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
      if (cachedDefaultProvider) return cachedDefaultProvider
      const provider = await getDefaultProvider()
      cachedDefaultProvider = provider
      return provider
    } catch (error) {
      logger.error('Error in provider-get-default:', error)
      throw error
    }
  })

  ipcMain.handle('provider-get-enabled', async () => {
    try {
      if (cachedEnabledProviders) return cachedEnabledProviders
      const providers = await getEnabledProviders()
      cachedEnabledProviders = providers
      return providers
    } catch (error) {
      logger.error('Error in provider-get-enabled:', error)
      throw error
    }
  })

  ipcMain.handle('provider-create', async (_event, input: LlmProviderInput) => {
    try {
      const id = await createProvider(input)
      clearProviderCache()
      getProviderService().clearCache()
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('providers-changed'))
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
        clearProviderCache()
        getProviderService().clearCache()
        BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('providers-changed'))
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
      clearProviderCache()
      getProviderService().clearCache()
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('providers-changed'))
      return result
    } catch (error) {
      logger.error('Error in provider-delete:', error)
      throw error
    }
  })

  ipcMain.handle('provider-set-default', async (_event, id: number) => {
    try {
      const result = await setDefaultProvider(id)
      clearProviderCache()
      getProviderService().clearCache()
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('providers-changed'))
      return result
    } catch (error) {
      logger.error('Error in provider-set-default:', error)
      throw error
    }
  })

  // --- Agent (智能体) IPC handlers ---

  ipcMain.handle('agent-get-all', async (_event, workspaceId: number) => {
    try {
      return await getAllAgents(workspaceId)
    } catch (error) {
      logger.error('Error in agent-get-all:', error)
      throw error
    }
  })

  ipcMain.handle(
    'agent-get-paginated',
    async (_event, workspaceId: number, page: number, pageSize: number) => {
      try {
        return await getAgentsPaginated(workspaceId, page, pageSize)
      } catch (error) {
        logger.error('Error in agent-get-paginated:', error)
        throw error
      }
    }
  )

  ipcMain.handle('agent-get-by-id', async (_event, workspaceId: number, id: number) => {
    try {
      return await getAgentById(workspaceId, id)
    } catch (error) {
      logger.error('Error in agent-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle('agent-create', async (_event, input: AgentConfigInput) => {
    try {
      const id = await createAgent(input)
      clearAgentCache()
      return id
    } catch (error) {
      logger.error('Error in agent-create:', error)
      throw error
    }
  })

  ipcMain.handle(
    'agent-update',
    async (_event, workspaceId: number, id: number, updates: Partial<AgentConfigInput>) => {
      try {
        const result = await updateAgent(workspaceId, id, updates)
        clearAgentCache()
        return result
      } catch (error) {
        logger.error('Error in agent-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('agent-delete', async (_event, workspaceId: number, id: number) => {
    try {
      // 先获取 agent 信息（需要 name 来删除记忆目录）
      const agent = await getAgentById(workspaceId, id)
      await deleteAgent(workspaceId, id)
      clearAgentCache()
      // 自动删除子Agent记忆目录
      if (agent) {
        const settings = settingsStore.store
        const memoryPath = (settings.chat as ChatSettings)?.memoryPath
        if (memoryPath) {
          try {
            const path = await import('path')
            const agentDir = path.join(
              memoryPath,
              `workspace-${workspaceId}`,
              'sub-agents',
              agent.name
            )
            if (fs.existsSync(agentDir)) {
              fs.rmSync(agentDir, { recursive: true, force: true })
              logger.info(`Auto-removed memory directories for sub-agent: ${agent.name}`)
            }
          } catch (memErr) {
            logger.warn('Failed to auto-remove sub-agent memory directories:', memErr)
          }
        }
      }
      return true
    } catch (error) {
      logger.error('Error in agent-delete:', error)
      throw error
    }
  })

  // 主智能体配置（electron-store）
  ipcMain.handle('main-agent-get', async () => {
    return (settingsStore.get('mainAgent') as Record<string, unknown>) ?? { tools: [], skills: [] }
  })

  ipcMain.handle('main-agent-update', async (_event, config: Record<string, unknown>) => {
    settingsStore.set('mainAgent', config)
    return true
  })

  // 拉取供应商的模型列表（元数据直接来自 models-profile.json 档案，不做名称/接口能力推导；
  // 档案中不存在的模型返回 metadata = null，由用户在设置界面自行填写）
  ipcMain.handle(
    'provider-fetch-models',
    async (_event, providerType: string, baseUrl?: string, apiKey?: string) => {
      try {
        const models: FetchedModelInfo[] = []

        if (providerType === 'ollama') {
          const url = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/api/tags'
          logger.info(`[FetchModels] Ollama: ${url}`)
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)
          const res = await fetch(url, { signal: controller.signal })
          clearTimeout(timeout)
          if (!res.ok) {
            throw new Error(`Ollama 返回 HTTP ${res.status}`)
          }
          const data = (await res.json()) as { models?: Record<string, unknown>[] }
          for (const m of data.models || []) {
            const id = typeof m.name === 'string' ? m.name : ''
            if (!id) continue
            models.push({ id, metadata: findModelProfile(id) })
          }
        } else if (providerType === 'google-genai') {
          // Gemini 原生接口: GET /v1beta/models?key=...
          const base = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')
          const url = `${base}/v1beta/models` + (apiKey ? `?key=${encodeURIComponent(apiKey)}` : '')
          logger.info(`[FetchModels] Gemini: ${url}`)
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)
          const res = await fetch(url, { signal: controller.signal })
          clearTimeout(timeout)
          if (!res.ok) {
            throw new Error(`Gemini 返回 HTTP ${res.status}`)
          }
          const data = (await res.json()) as { models?: Record<string, unknown>[] }
          for (const m of data.models || []) {
            const id = geminiModelId(m)
            if (!id) continue
            models.push({ id, metadata: findModelProfile(id) })
          }
        } else {
          // OpenAI 兼容协议: GET /v1/models
          const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
          const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`
          logger.info(`[FetchModels] OpenAI-compatible: ${url}`)
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)
          const res = await fetch(url, { headers, signal: controller.signal })
          clearTimeout(timeout)
          if (!res.ok) {
            throw new Error(`API 返回 HTTP ${res.status}`)
          }
          const data = (await res.json()) as { data?: Record<string, unknown>[] }
          for (const m of data.data || []) {
            const id = typeof m.id === 'string' ? m.id : ''
            if (!id) continue
            models.push({ id, metadata: findModelProfile(id) })
          }
        }

        logger.info(`[FetchModels] Got ${models.length} models for ${providerType}`)
        return models
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        logger.error(`[FetchModels] Failed for ${providerType}:`, errMsg)
        throw new Error(`拉取模型列表失败：${errMsg}`)
      }
    }
  )

  await createLoadingWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLoadingWindow()
    }
  })
})

let isQuitting = false

app.on('before-quit', (event) => {
  if (isQuitting) return
  isQuitting = true

  // 没有活跃流时直接退出，不阻塞进程终止
  if (activeChatStreams.size === 0) {
    return
  }

  // 有活跃流时拦截退出，先保存数据再退出
  event.preventDefault()
  ;(async () => {
    try {
      for (const controller of streamAbortControllers.values()) {
        controller.abort()
      }
      await Promise.race([
        Promise.allSettled([...activeChatStreams]),
        new Promise((resolve) => setTimeout(resolve, 5000))
      ])
    } catch (error) {
      logger.error('Error during stream abort:', error)
    } finally {
      try {
        if (database) {
          await database.close()
        }
      } finally {
        try {
          const { closeAllMnemon } = await import('./chat/mnemon-singleton')
          await closeAllMnemon()
        } catch (err) {
          logger.warn('[Mnemon] 退出清理失败:', err)
        }
        app.quit()
      }
    }
  })()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
