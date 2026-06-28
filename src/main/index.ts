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
import { ChatService } from './chat/service'
import { buildTools, availableTools } from './chat/tools'
import type { ToolCallDetail } from './chat/types'
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
  getAllTopics,
  getTopicById,
  createTopic,
  updateTopic,
  deleteTopic,
  getDialoguesByTopicId,
  addDialogue,
  deleteDialoguesByTopicId,
  ChatTopicRow,
  ChatDialogueRow
} from './database/mapper/chat'

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
        settingsStore.set('chat', { maxIterations: 5 } as ChatSettings)
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
        defaultEmbeddingModelId: all.defaultEmbeddingModelId
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

  ipcMain.handle('note-get-by-id', async (_event, id: number) => {
    try {
      return await getNoteById(id)
    } catch (error) {
      console.error('Error in note-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle(
    'note-get-all',
    async (_event, page?: number, pageSize?: number, excludeWikiId?: number) => {
      try {
        return await getAllNotes(page, pageSize, excludeWikiId)
      } catch (error) {
        console.error('Error in note-get-all:', error)
        throw error
      }
    }
  )

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
      const chatService = new ChatService(model, tools, chatSettings?.maxIterations ?? 5)
      return await chatService.sendMessage(question, options)
    }
  )

  ipcMain.on(
    'chat-start-stream',
    async (
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
      const tools = buildTools(options?.tools || [])
      logger.info(`[Chat] Creating model with providerId: ${options?.providerId ?? 'default'}`)
      const model = await getProviderService().createModel(options?.providerId)
      const chatSettings = settingsStore.get('chat') as ChatSettings | undefined

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

      // 3. 流式输出 + 累积完整内容
      const chatService = new ChatService(model, tools, chatSettings?.maxIterations ?? 5)
      const stream = chatService.sendMessageStream(question, options)
      const accumulatedBlocks: {
        type: string
        text?: string
        tool?: ToolCallDetail
        reasoning?: string
      }[] = []
      let fullContent = ''

      try {
        for await (const chunk of stream) {
          if (chunk.reasoning_content) {
            // 合并连续 reasoning block
            const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
            if (lastBlock && lastBlock.type === 'reasoning') {
              lastBlock.reasoning = (lastBlock.reasoning || '') + chunk.reasoning_content
            } else {
              accumulatedBlocks.push({ type: 'reasoning', reasoning: chunk.reasoning_content })
            }
          }
          if (chunk.content) {
            fullContent += chunk.content
            // 合并连续 text block，避免每个 chunk 独立成块导致渲染间距
            const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
            if (lastBlock && lastBlock.type === 'text') {
              lastBlock.text = (lastBlock.text || '') + chunk.content
            } else {
              accumulatedBlocks.push({ type: 'text', text: chunk.content })
            }
          }
          if (chunk.tool) {
            accumulatedBlocks.push({
              type: 'tool',
              tool: {
                name: chunk.tool.name,
                input: chunk.tool.input,
                output: chunk.tool.output
              }
            })
          }
          event.sender.send('chat-stream-chunk', chunk)
        }
      } catch (error) {
        logger.error('Error in chat stream:', error)
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

      // 5. 通知渲染进程流式输出已完成
      event.sender.send('chat-stream-done', { topicId })
    }
  )

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

  // --- Graph IPC handlers ---

  ipcMain.handle('graph-data-get', async (_event, wikiId: number, typeFilter?: string) => {
    try {
      return await getFullGraphData(wikiId, typeFilter)
    } catch (error) {
      logger.error('Error in graph-data-get:', error)
      throw error
    }
  })

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

  ipcMain.handle('graph-processed-notes-get', async (_event, wikiId: number) => {
    try {
      const job = await getBuildJobByWikiId(wikiId)
      if (job?.processed_note_ids) {
        return JSON.parse(job.processed_note_ids) as number[]
      }
      return []
    } catch (error) {
      logger.error('Error in graph-processed-notes-get:', error)
      throw error
    }
  })

  ipcMain.handle('graph-notes-append', async (event, wikiId: number, noteIds: number[]) => {
    const defaultModelId = settingsStore.get('defaultModelId') as number | undefined
    const model = await getProviderService().createModel(defaultModelId)
    const graphService = new KnowledgeGraphService(model)
    try {
      const result = await graphService.appendNotes(wikiId, noteIds, (progress) => {
        event.sender.send('graph-build-progress', progress)
      })
      event.sender.send('graph-build-complete', {
        wikiId,
        entityCount: result.entitiesAdded,
        relationCount: result.relationsAdded
      })
      return result
    } catch (error) {
      logger.error('Error in graph-notes-append:', error)
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
