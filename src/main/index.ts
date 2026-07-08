import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createDatabase, Database } from './database/loading' // 确保导入 Database 类型
import { getIp } from './address'
import _Store from 'electron-store'
import logger from 'electron-log'
import * as fs from 'fs'
import crypto from 'crypto'

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
        defaultEmbeddingModelId: all.defaultEmbeddingModelId,
        musicDirectory: all.musicDirectory,
        theme: all.theme
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
      return await deleteDoc(id)
    } catch (error) {
      console.error('Error in doc-delete:', error)
      throw error
    }
  })

  ipcMain.handle(
    'doc-delete-by-time-range',
    async (_event, startTime: string, endTime: string) => {
      try {
        return await deleteDocsByTimeRange(startTime, endTime)
      } catch (error) {
        console.error('Error in doc-delete-by-time-range:', error)
        throw error
      }
    }
  )

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
