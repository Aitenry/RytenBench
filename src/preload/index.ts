import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { TodoItemRow } from '../main/database/mapper/todo'

// Custom APIs for renderer
const api = {
  // TodoItems 相关 API
  todoItems: {
    getById: (id: number) => ipcRenderer.invoke('todo-items-get-by-id', id),
    getByTitle: (title: string) => ipcRenderer.invoke('todo-items-get-by-title', title),
    getByPriority: (priority: number) => ipcRenderer.invoke('todo-items-get-by-priority', priority),
    getByCompletedStatus: (completed: boolean) =>
      ipcRenderer.invoke('todo-items-get-by-completed-status', completed),
    getAll: () => ipcRenderer.invoke('todo-items-get-all'),
    getByDueDate: (dueDate: string) => ipcRenderer.invoke('todo-items-get-by-due-date', dueDate),
    add: (todoItem: Omit<TodoItemRow, 'id'>) => ipcRenderer.invoke('todo-items-add', todoItem),
    update: (id: number, updates: Partial<Omit<TodoItemRow, 'id'>>) =>
      ipcRenderer.invoke('todo-items-update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('todo-items-delete', id)
  },
  setting: {
    getLockScreenCode: () => ipcRenderer.invoke('lock-screen-code'),
    setLockScreenView: (open: boolean) => ipcRenderer.invoke('lock-screen-view', open)
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
