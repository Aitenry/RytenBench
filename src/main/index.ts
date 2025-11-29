import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createDatabase, Database } from './database/loading' // 确保导入 Database 类型
import { getIp } from './address'
import _Store from 'electron-store'
import logger from 'electron-log'

import {
  getTodoItemById,
  getTodoItemByTitle,
  getTodoItemsByPriority,
  getTodoItemsByCompletedStatus,
  getAllTodoItems,
  getTodoItemsByDueDate,
  deleteTodoItem,
  updateTodoItem,
  addTodoItem,
  TodoItemRow
} from './database/mapper/todo' // 替换为实际路径

logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
logger.transports.file.fileName = 'main.log'

const Store = _Store['default'] || _Store
const settingsStore = new Store({ name: 'settings' })
let loadingWindow: BrowserWindow | null = null
let database: Database | null = null // 保持模块级变量

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
    { name: '初始化数据库', execute: async () => (database = await createDatabase()) },
    { name: '加载服务', execute: async () => await loadServices() },
    { name: '准备UI组件', execute: async () => await prepareUIComponents() }
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

  try {
    await Promise.all(configPromises)
  } catch (error) {
    logger.error('Error loading config:', error)
  }
}

async function loadServices(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1800))
}

async function prepareUIComponents(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1200))
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
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('cn.toryu.ryten.bench')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => logger.info('pong'))

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

  ipcMain.handle('todo-items-get-by-completed-status', async (_event, completed: boolean) => {
    try {
      return await getTodoItemsByCompletedStatus(completed)
    } catch (error) {
      console.error('Error in todo-items-get-by-completed-status:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-all', async () => {
    try {
      return await getAllTodoItems()
    } catch (error) {
      console.error('Error in todo-items-get-all:', error)
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
      return await deleteTodoItem(id)
    } catch (error) {
      console.error('Error in todo-items-delete:', error)
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

  await createLoadingWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createLoadingWindow()
    }
  })
})

app.on('before-quit', async () => {
  try {
    // 在退出前关闭数据库
    if (database) {
      await database.close()
    }
  } catch (error) {
    logger.error('Error during app shutdown:', error)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
