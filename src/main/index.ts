import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createDatabase, Database } from './database/loading' // 确保导入 Database 类型
import { getIp } from './address'
import _Store from 'electron-store'
import logger from 'electron-log'
import * as fs from 'fs'

import {
  getTodoItemById,
  getTodoItemByTitle,
  getTodoItemsByPriority,
  getAllTodoItems,
  getTodoItemsByDueDate,
  deleteTodoItem,
  updateTodoItem,
  addTodoItem,
  TodoItemRow
} from './database/mapper/todo'
import {
  getNoteById,
  getAllNotes,
  getNotePage,
  addNote,
  updateNote,
  deleteNote,
  NoteRow
} from './database/mapper/note'
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
  getNotesByDirectoryId,
  addNoteToDirectory,
  removeNoteFromDirectory,
  getDirectoriesByNoteId,
  WikiRow,
  WikiDirectoryRow
} from './database/mapper/wiki'
import { FlexSearchIndexer } from './search/indexer'
import path from 'path'
import * as z from 'zod'
import { tool } from '@langchain/core/tools'
import { ChatService } from './chat/service'

logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
logger.transports.file.fileName = 'main.log'

const Store = _Store['default'] || _Store
const settingsStore = new Store({ name: 'settings' })
let loadingWindow: BrowserWindow | null = null
let database: Database | null = null // 保持模块级变量
let flexSearchIndexer: FlexSearchIndexer | null = null

// --- 获取数据库实例的函数 ---
let initializationPromise: Promise<void> | null = null // 用于追踪初始化过程
const flexSearchInitializationPromise: Promise<void> | null = null

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

export async function getFlexSearchIndexer(): Promise<FlexSearchIndexer> {
  if (flexSearchIndexer && flexSearchIndexer.initialized) {
    return flexSearchIndexer
  }

  if (flexSearchInitializationPromise) {
    await flexSearchInitializationPromise
    if (flexSearchIndexer && flexSearchIndexer.initialized) {
      return flexSearchIndexer
    }
  }

  throw new Error('FlexSearch indexer has not been initialized yet.')
}

async function performInitializationTasks(): Promise<void> {
  const tasks = [
    { name: '加载配置', execute: async () => await loadConfig() },
    { name: '初始化数据库', execute: async () => (database = await createDatabase()) },
    {
      name: '初始化索引',
      execute: async () => {
        if (database) {
          const dbPath = path.join(app.getPath('userData'), 'RytenBenchIndex.sqlite')
          flexSearchIndexer = new FlexSearchIndexer(dbPath) // 指定索引文件路径
          await flexSearchIndexer.initializeIndex()
        } else {
          logger.warn('Database not available, skipping FlexSearch initialization.')
        }
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

  ipcMain.handle('note-get-by-id', async (_event, id: number) => {
    try {
      return await getNoteById(id)
    } catch (error) {
      console.error('Error in note-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle('note-get-all', async (_event, page?: number, pageSize?: number) => {
    try {
      return await getAllNotes(page, pageSize)
    } catch (error) {
      console.error('Error in note-get-all:', error)
      throw error
    }
  })

  ipcMain.handle(
    'note-page-get',
    async (_event, query: string, page?: number, pageSize?: number) => {
      try {
        return await getNotePage(query, page, pageSize)
      } catch (error) {
        console.error('Error in note-get-by-title:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'note-add',
    async (
      _event,
      note: Omit<NoteRow, 'id' | 'created_at' | 'updated_at' | 'version'> & {
        image?: string | null
        content?: string | null
      }
    ) => {
      try {
        return await addNote(note)
      } catch (error) {
        console.error('Error in note-add:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'note-update',
    async (
      _event,
      id: number,
      updates: Partial<Omit<NoteRow, 'id' | 'created_at' | 'version'>> & {
        image?: string | null
        content?: string | null
      }
    ) => {
      try {
        return await updateNote(id, updates)
      } catch (error) {
        console.error('Error in note-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('note-delete', async (_event, id: number) => {
    try {
      return await deleteNote(id)
    } catch (error) {
      console.error('Error in note-delete:', error)
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
    async (_event, wiki: Omit<WikiRow, 'id' | 'created_at' | 'updated_at'>) => {
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
    async (_event, id: number, updates: Partial<Omit<WikiRow, 'id' | 'created_at'>>) => {
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
      return await deleteWiki(id)
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

  ipcMain.handle('wiki-directory-notes-get', async (_event, directoryId: number) => {
    try {
      return await getNotesByDirectoryId(directoryId)
    } catch (error) {
      console.error('Error in wiki-directory-notes-get:', error)
      throw error
    }
  })

  ipcMain.handle(
    'wiki-directory-note-add',
    async (_event, directoryId: number, noteId: number, sortOrder?: number) => {
      try {
        return await addNoteToDirectory(directoryId, noteId, sortOrder)
      } catch (error) {
        console.error('Error in wiki-directory-note-add:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'wiki-directory-note-remove',
    async (_event, directoryId: number, noteId: number) => {
      try {
        return await removeNoteFromDirectory(directoryId, noteId)
      } catch (error) {
        console.error('Error in wiki-directory-note-remove:', error)
        throw error
      }
    }
  )

  ipcMain.handle('wiki-note-directories-get', async (_event, noteId: number) => {
    try {
      return await getDirectoriesByNoteId(noteId)
    } catch (error) {
      console.error('Error in wiki-note-directories-get:', error)
      throw error
    }
  })

  ipcMain.handle('select-image-file', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      const fileBuffer = fs.readFileSync(filePath)
      const base64 = fileBuffer.toString('base64')
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
      const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`

      return `data:${mimeType};base64,${base64}`
    } catch (error) {
      console.error('Error selecting image file:', error)
      throw error
    }
  })

  ipcMain.handle(
    'chat-send-message',
    async (
      _event,
      question: string,
      options?: { deepThinking?: boolean; smartSearch?: boolean }
    ) => {
      const getWeather = tool((input: { location: string }) => `It's sunny in ${input.location}.`, {
        name: 'get_weather',
        description: 'Get the weather at a location.',
        schema: z.object({
          location: z.string().describe('The location to get the weather for')
        })
      })

      // 创建服务并传入工具
      const chatService = new ChatService([getWeather])
      return await chatService.sendMessage(question, options)
    }
  )

  ipcMain.on(
    'chat-start-stream',
    async (
      event,
      question: string,
      options?: { deepThinking?: boolean; smartSearch?: boolean }
    ) => {
      const getWeather = tool((input: { location: string }) => `It's sunny in ${input.location}.`, {
        name: 'get_weather',
        description: 'Get the weather at a location.',
        schema: z.object({
          location: z.string().describe('The location to get the weather for')
        })
      })

      // 创建服务并传入工具
      const chatService = new ChatService([getWeather])

      // 开始流式输出
      const stream = chatService.sendMessageStream(question, options)

      try {
        for await (const chunk of stream) {
          event.sender.send('chat-stream-chunk', chunk)
        }
      } catch (error) {
        logger.error('Error in chat stream:', error)
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
