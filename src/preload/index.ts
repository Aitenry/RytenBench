import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { TodoItemRow } from '../main/database/mapper/todo'
import { NoteRow } from '../main/database/mapper/note'
import { WikiRow, WikiDirectoryRow } from '../main/database/mapper/wiki'

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
    sendMessage: (message: string, options?: { deepThinking?: boolean; smartSearch?: boolean }) =>
      ipcRenderer.invoke('chat-send-message', message, options),
    startMessageStream: (message: string, options?: { deepThinking?: boolean; smartSearch?: boolean }) => {
      ipcRenderer.send('chat-start-stream', message, options)
    },
    onStreamChunk: (callback: (chunk: any) => void) => {
      // 先移除所有旧的监听器
      ipcRenderer.removeAllListeners('chat-stream-chunk')
      // 添加新的监听器
      ipcRenderer.on('chat-stream-chunk', (_event, chunk) => callback(chunk))
      return () => {
        ipcRenderer.removeAllListeners('chat-stream-chunk')
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
