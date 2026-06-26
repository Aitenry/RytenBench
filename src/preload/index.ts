import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { TodoItemRow } from '../main/database/mapper/todo'
import { NoteRow } from '../main/database/mapper/note'
import { WikiRow, WikiDirectoryRow } from '../main/database/mapper/wiki'
import { ChatTopicRow, ChatDialogueRow } from '../main/database/mapper/chat'

// Custom APIs for renderer
const api = {
  // TodoItems 相关 API
  todoItems: {
    getById: (id: number) => ipcRenderer.invoke('todo-items-get-by-id', id),
    getByTitle: (title: string) => ipcRenderer.invoke('todo-items-get-by-title', title),
    getByPriority: (priority: number) => ipcRenderer.invoke('todo-items-get-by-priority', priority),
    getByCompletedStatus: (status: number) =>
      ipcRenderer.invoke('todo-items-get-by-completed-status', status),
    getAll: () => ipcRenderer.invoke('todo-items-get-schedule'),
    getByDueDate: (dueDate: string) => ipcRenderer.invoke('todo-items-get-by-due-date', dueDate),
    add: (todoItem: Omit<TodoItemRow, 'id'>) => ipcRenderer.invoke('todo-items-add', todoItem),
    update: (id: number, updates: Partial<Omit<TodoItemRow, 'id'>>) =>
      ipcRenderer.invoke('todo-items-update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('todo-items-delete', id)
  },
  notes: {
    getById: (id: number) => ipcRenderer.invoke('note-get-by-id', id),
    getAll: (page?: number, pageSize?: number) =>
      ipcRenderer.invoke('note-get-all', page, pageSize),
    getPage: (query: string, page?: number, pageSize?: number) =>
      ipcRenderer.invoke('note-page-get', query, page, pageSize),
    add: (
      note: Omit<NoteRow, 'id' | 'created_at' | 'updated_at' | 'version'> & {
        image?: string | null
        content?: string | null
      }
    ) => ipcRenderer.invoke('note-add', note),
    update: (
      id: number,
      updates: Partial<Omit<NoteRow, 'id' | 'created_at' | 'version'>> & {
        image?: string | null
        content?: string | null
      }
    ) => ipcRenderer.invoke('note-update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('note-delete', id)
  },
  wikis: {
    getById: (id: number) => ipcRenderer.invoke('wiki-get-by-id', id),
    getAll: (page?: number, pageSize?: number) =>
      ipcRenderer.invoke('wiki-get-all', page, pageSize),
    add: (wiki: Omit<WikiRow, 'id' | 'created_at' | 'updated_at'>) =>
      ipcRenderer.invoke('wiki-add', wiki),
    update: (id: number, updates: Partial<Omit<WikiRow, 'id' | 'created_at'>>) =>
      ipcRenderer.invoke('wiki-update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('wiki-delete', id),
    getDirectories: (wikiId: number) => ipcRenderer.invoke('wiki-directories-get', wikiId),
    addDirectory: (directory: Omit<WikiDirectoryRow, 'id' | 'created_at' | 'updated_at'>) =>
      ipcRenderer.invoke('wiki-directory-add', directory),
    updateDirectory: (id: number, updates: Partial<Omit<WikiDirectoryRow, 'id' | 'created_at'>>) =>
      ipcRenderer.invoke('wiki-directory-update', id, updates),
    deleteDirectory: (id: number) => ipcRenderer.invoke('wiki-directory-delete', id),
    getNotesByDirectory: (directoryId: number) =>
      ipcRenderer.invoke('wiki-directory-notes-get', directoryId),
    addNoteToDirectory: (directoryId: number, noteId: number, sortOrder?: number) =>
      ipcRenderer.invoke('wiki-directory-note-add', directoryId, noteId, sortOrder),
    removeNoteFromDirectory: (directoryId: number, noteId: number) =>
      ipcRenderer.invoke('wiki-directory-note-remove', directoryId, noteId),
    getDirectoriesByNote: (noteId: number) =>
      ipcRenderer.invoke('wiki-note-directories-get', noteId)
  },
  file: {
    selectImageFile: () => ipcRenderer.invoke('select-image-file')
  },
  setting: {
    getLockScreenCode: () => ipcRenderer.invoke('lock-screen-code'),
    setLockScreenView: (open: boolean) => ipcRenderer.invoke('lock-screen-view', open)
  },
  chat: {
    sendMessage: (
      message: string,
      options?: { deepThinking?: boolean; smartSearch?: boolean; tools?: string[] }
    ) => ipcRenderer.invoke('chat-send-message', message, options),
    startMessageStream: (
      message: string,
      options?: {
        deepThinking?: boolean
        smartSearch?: boolean
        tools?: string[]
        topicId?: number
      }
    ) => {
      ipcRenderer.send('chat-start-stream', message, options)
    },
    getTools: () => ipcRenderer.invoke('chat-get-tools'),
    onStreamChunk: (callback: (chunk: Record<string, unknown>) => void) => {
      ipcRenderer.removeAllListeners('chat-stream-chunk')
      ipcRenderer.on('chat-stream-chunk', (_event, chunk) => callback(chunk))
      return () => {
        ipcRenderer.removeAllListeners('chat-stream-chunk')
      }
    },
    onStreamDone: (callback: (result: { topicId: number }) => void) => {
      ipcRenderer.removeAllListeners('chat-stream-done')
      ipcRenderer.on('chat-stream-done', (_event, result) => callback(result))
      return () => {
        ipcRenderer.removeAllListeners('chat-stream-done')
      }
    },
    // 话题管理
    getAllTopics: () => ipcRenderer.invoke('chat-topic-get-all'),
    getTopicById: (id: number) => ipcRenderer.invoke('chat-topic-get-by-id', id),
    createTopic: (title: string, model?: string, selectedTools?: string) =>
      ipcRenderer.invoke('chat-topic-create', title, model, selectedTools),
    updateTopic: (
      id: number,
      updates: Partial<Pick<ChatTopicRow, 'title' | 'model' | 'selected_tools'>>
    ) => ipcRenderer.invoke('chat-topic-update', id, updates),
    deleteTopic: (id: number) => ipcRenderer.invoke('chat-topic-delete', id),
    // 消息管理
    getDialoguesByTopic: (topicId: number) =>
      ipcRenderer.invoke('chat-dialogue-get-by-topic', topicId),
    addDialogue: (dialogue: Omit<ChatDialogueRow, 'id' | 'created_at'>) =>
      ipcRenderer.invoke('chat-dialogue-add', dialogue),
    deleteDialoguesByTopic: (topicId: number) =>
      ipcRenderer.invoke('chat-dialogue-delete-by-topic', topicId)
  },
  graph: {
    getData: (wikiId: number, typeFilter?: string) =>
      ipcRenderer.invoke('graph-data-get', wikiId, typeFilter),
    getEntity: (entityId: number) => ipcRenderer.invoke('graph-entity-get', entityId),
    searchEntities: (wikiId: number, query: string) =>
      ipcRenderer.invoke('graph-entity-search', wikiId, query),
    updateEntity: (id: number, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('graph-entity-update', id, updates),
    deleteEntity: (id: number) => ipcRenderer.invoke('graph-entity-delete', id),
    deleteRelation: (id: number) => ipcRenderer.invoke('graph-relation-delete', id),
    getBuildStatus: (wikiId: number) => ipcRenderer.invoke('graph-build-status', wikiId),
    buildGraph: (wikiId: number, config?: Record<string, unknown>) => {
      ipcRenderer.send('graph-build-start', wikiId, config)
    },
    onBuildProgress: (
      callback: (progress: {
        phase: string
        processedNotes: number
        totalNotes: number
        message: string
      }) => void
    ) => {
      ipcRenderer.removeAllListeners('graph-build-progress')
      ipcRenderer.on('graph-build-progress', (_event, progress) => callback(progress))
      return () => {
        ipcRenderer.removeAllListeners('graph-build-progress')
      }
    },
    onBuildComplete: (
      callback: (result: { wikiId: number; entityCount: number; relationCount: number }) => void
    ) => {
      ipcRenderer.removeAllListeners('graph-build-complete')
      ipcRenderer.on('graph-build-complete', (_event, result) => callback(result))
      return () => {
        ipcRenderer.removeAllListeners('graph-build-complete')
      }
    },
    onBuildError: (callback: (error: { wikiId: number; error: string }) => void) => {
      ipcRenderer.removeAllListeners('graph-build-error')
      ipcRenderer.on('graph-build-error', (_event, error) => callback(error))
      return () => {
        ipcRenderer.removeAllListeners('graph-build-error')
      }
    }
  }
}

// 将特定的 API 暴露给渲染进程
const loadingAPI = {
  // 添加主窗口就绪监听
  onMainWindowReady: (callback: () => void) => ipcRenderer.on('main-window-ready', callback),

  // 如果需要，添加初始化完成通知
  notifyInitComplete: () => ipcRenderer.send('init-complete'),

  // 添加初始化进度监听
  onInitProgress: (
    callback: (
      event: Electron.IpcRendererEvent,
      data: {
        currentTask: string
        progress: number
        taskIndex: number
        totalTasks: number
      }
    ) => void
  ) => ipcRenderer.on('init-progress', callback),

  // 添加初始化完成监听
  onInitComplete: (callback: () => void) => ipcRenderer.on('init-complete', callback),

  // 添加初始化错误监听
  onInitError: (callback: (event: Electron.IpcRendererEvent, errorMessage: string) => void) =>
    ipcRenderer.on('init-error', callback)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('loading', loadingAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
  // @ts-ignore (define in dts)
  window.loading = loadingAPI
}
