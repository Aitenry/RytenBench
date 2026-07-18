import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { TodoItemRow } from '../main/database/mapper/todo'
import { DocRow } from '../main/database/mapper/document'
import { WikiRow, WikiDirectoryRow } from '../main/database/mapper/wiki'
import { ChatTopicRow, ChatDialogueRow } from '../main/database/mapper/chat'
import type { LlmProviderInput, LlmProviderConfig } from '../main/database/mapper/provider'
import type { SystemSettings } from '../main/types/settings'

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
    getAllPaginated: (page?: number, pageSize?: number) =>
      ipcRenderer.invoke('todo-items-get-paginated', page, pageSize),
    getByDueDate: (dueDate: string) => ipcRenderer.invoke('todo-items-get-by-due-date', dueDate),
    add: (todoItem: Omit<TodoItemRow, 'id'>) => ipcRenderer.invoke('todo-items-add', todoItem),
    update: (id: number, updates: Partial<Omit<TodoItemRow, 'id'>>) =>
      ipcRenderer.invoke('todo-items-update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('todo-items-delete', id)
  },
  taskDependencies: {
    add: (taskId: number, dependsOnTaskId: number) =>
      ipcRenderer.invoke('task-deps-add', taskId, dependsOnTaskId),
    delete: (taskId: number, dependsOnTaskId: number) =>
      ipcRenderer.invoke('task-deps-delete', taskId, dependsOnTaskId),
    getAll: () => ipcRenderer.invoke('task-deps-get-all'),
    getTasksWithDeps: () => ipcRenderer.invoke('task-deps-get-with-tasks')
  },
  planner: {
    tasks: {
      getAll: () => ipcRenderer.invoke('planner-tasks-get-all'),
      getById: (id: number) => ipcRenderer.invoke('planner-tasks-get-by-id', id),
      getTree: () => ipcRenderer.invoke('planner-tasks-get-tree'),
      add: (task) => ipcRenderer.invoke('planner-tasks-add', task),
      update: (id: number, updates) => ipcRenderer.invoke('planner-tasks-update', id, updates),
      delete: (id: number) => ipcRenderer.invoke('planner-tasks-delete', id),
      reorder: (orderList) => ipcRenderer.invoke('planner-tasks-reorder', orderList)
    },
    deps: {
      add: (taskId: number, dependsOnTaskId: number) =>
        ipcRenderer.invoke('planner-deps-add', taskId, dependsOnTaskId),
      delete: (taskId: number, dependsOnTaskId: number) =>
        ipcRenderer.invoke('planner-deps-delete', taskId, dependsOnTaskId),
      getAll: () => ipcRenderer.invoke('planner-deps-get-all')
    }
  },
  docs: {
    getById: (id: number) => ipcRenderer.invoke('doc-get-by-id', id),
    getAll: (page?: number, pageSize?: number, excludeWikiId?: number, search?: string) =>
      ipcRenderer.invoke('doc-get-all', page, pageSize, excludeWikiId, search),
    getPage: (query: string, page?: number, pageSize?: number) =>
      ipcRenderer.invoke('doc-page-get', query, page, pageSize),
    add: (
      doc: Omit<DocRow, 'id' | 'created_at' | 'updated_at'> & {
        image?: string | null
        content?: string | null
      }
    ) => ipcRenderer.invoke('doc-add', doc),
    update: (
      id: number,
      updates: Partial<Omit<DocRow, 'id' | 'created_at'>> & {
        image?: string | null
        content?: string | null
      }
    ) => ipcRenderer.invoke('doc-update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('doc-delete', id),
    deleteByTimeRange: (startTime: string, endTime: string) =>
      ipcRenderer.invoke('doc-delete-by-time-range', startTime, endTime),
    importDocument: () =>
      ipcRenderer.invoke('doc-import') as Promise<{ title: string; content: string } | null>,
    exportDocument: (id: number) => ipcRenderer.invoke('doc-export', id) as Promise<boolean>
  },
  wikis: {
    getById: (id: number) => ipcRenderer.invoke('wiki-get-by-id', id),
    getAll: (page?: number, pageSize?: number) =>
      ipcRenderer.invoke('wiki-get-all', page, pageSize),
    add: (wiki: Omit<WikiRow, 'id' | 'doc_count' | 'created_at' | 'updated_at'>) =>
      ipcRenderer.invoke('wiki-add', wiki),
    update: (id: number, updates: Partial<Omit<WikiRow, 'id' | 'doc_count' | 'created_at'>>) =>
      ipcRenderer.invoke('wiki-update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('wiki-delete', id),
    getDirectories: (wikiId: number) => ipcRenderer.invoke('wiki-directories-get', wikiId),
    addDirectory: (directory: Omit<WikiDirectoryRow, 'id' | 'created_at' | 'updated_at'>) =>
      ipcRenderer.invoke('wiki-directory-add', directory),
    updateDirectory: (id: number, updates: Partial<Omit<WikiDirectoryRow, 'id' | 'created_at'>>) =>
      ipcRenderer.invoke('wiki-directory-update', id, updates),
    deleteDirectory: (id: number) => ipcRenderer.invoke('wiki-directory-delete', id),
    getNotesByDirectory: (directoryId: number) =>
      ipcRenderer.invoke('wiki-directory-docs-get', directoryId),
    addNoteToDirectory: (directoryId: number, noteId: number, sortOrder?: number) =>
      ipcRenderer.invoke('wiki-directory-note-add', directoryId, noteId, sortOrder),
    removeNoteFromDirectory: (directoryId: number, noteId: number) =>
      ipcRenderer.invoke('wiki-directory-doc-remove', directoryId, noteId),
    getDirectoriesByNote: (noteId: number) => ipcRenderer.invoke('wiki-doc-directories-get', noteId)
  },
  file: {
    selectImageFile: (allowImages?: boolean) =>
      ipcRenderer.invoke('select-image-file', allowImages),
    selectTextFile: () =>
      ipcRenderer.invoke('select-text-file') as Promise<{
        fileName: string
        filePath: string
      } | null>
  },
  setting: {
    getLockScreenCode: () => ipcRenderer.invoke('lock-screen-code'),
    setLockScreenView: (open: boolean) => ipcRenderer.invoke('lock-screen-view', open)
  },
  chat: {
    sendMessage: (
      message: string,
      options?: {
        tools?: string[]
        providerId?: number
      }
    ) => ipcRenderer.invoke('chat-send-message', message, options),
    startMessageStream: (
      message: string,
      options?: {
        tools?: string[]
        topicId?: number
        providerId?: number
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
    getData: (wikiId: number, typeFilter?: string, docIds?: number[]) =>
      ipcRenderer.invoke('graph-data-get', wikiId, typeFilter, docIds),
    getEntity: (entityId: number) => ipcRenderer.invoke('graph-entity-get', entityId),
    searchEntities: (wikiId: number, query: string) =>
      ipcRenderer.invoke('graph-entity-search', wikiId, query),
    updateEntity: (id: number, updates: Record<string, unknown>) =>
      ipcRenderer.invoke('graph-entity-update', id, updates),
    deleteEntity: (id: number) => ipcRenderer.invoke('graph-entity-delete', id),
    deleteRelation: (id: number) => ipcRenderer.invoke('graph-relation-delete', id),
    getBuildStatus: (wikiId: number) => ipcRenderer.invoke('graph-build-status', wikiId),
    appendDocs: (wikiId: number, docIds: number[]) =>
      ipcRenderer.invoke('graph-docs-append', wikiId, docIds),
    getProcessedDocIds: (wikiId: number) =>
      ipcRenderer.invoke('graph-processed-docs-get', wikiId) as Promise<number[]>,
    buildGraph: (wikiId: number, config?: Record<string, unknown>) => {
      ipcRenderer.send('graph-build-start', wikiId, config)
    },
    onBuildProgress: (
      callback: (progress: {
        wikiId: number
        phase: string
        phaseLabel: string
        phaseProgress: number
        overallProgress: number
        processedDocs: number
        totalDocs: number
        processedChunks: number
        totalChunks: number
        entityCount: number
        relationCount: number
        message: string
        needsRefresh?: boolean
      }) => void
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: {
          wikiId: number
          phase: string
          phaseLabel: string
          phaseProgress: number
          overallProgress: number
          processedDocs: number
          totalDocs: number
          processedChunks: number
          totalChunks: number
          entityCount: number
          relationCount: number
          message: string
          needsRefresh?: boolean
        }
      ): void => {
        callback(progress)
      }
      ipcRenderer.on('graph-build-progress', handler)
      return () => {
        ipcRenderer.off('graph-build-progress', handler)
      }
    },
    onBuildComplete: (
      callback: (result: { wikiId: number; entityCount: number; relationCount: number }) => void
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        result: {
          wikiId: number
          entityCount: number
          relationCount: number
        }
      ): void => {
        callback(result)
      }
      ipcRenderer.on('graph-build-complete', handler)
      return () => {
        ipcRenderer.off('graph-build-complete', handler)
      }
    },
    onBuildError: (callback: (error: { wikiId: number; error: string }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        error: { wikiId: number; error: string }
      ): void => {
        callback(error)
      }
      ipcRenderer.on('graph-build-error', handler)
      return () => {
        ipcRenderer.off('graph-build-error', handler)
      }
    }
  },
  providers: {
    getAll: () => ipcRenderer.invoke('provider-get-all') as Promise<LlmProviderConfig[]>,
    getById: (id: number) =>
      ipcRenderer.invoke('provider-get-by-id', id) as Promise<LlmProviderConfig | null>,
    getDefault: () =>
      ipcRenderer.invoke('provider-get-default') as Promise<LlmProviderConfig | null>,
    getEnabled: () => ipcRenderer.invoke('provider-get-enabled') as Promise<LlmProviderConfig[]>,
    create: (input: LlmProviderInput) =>
      ipcRenderer.invoke('provider-create', input) as Promise<number>,
    update: (id: number, updates: Partial<LlmProviderInput>) =>
      ipcRenderer.invoke('provider-update', id, updates) as Promise<boolean>,
    delete: (id: number) => ipcRenderer.invoke('provider-delete', id) as Promise<boolean>,
    setDefault: (id: number) => ipcRenderer.invoke('provider-set-default', id) as Promise<boolean>
  },
  systemSettings: {
    getAll: () => ipcRenderer.invoke('system-settings-get-all') as Promise<SystemSettings>,
    update: (updates: Partial<SystemSettings>) =>
      ipcRenderer.invoke('system-settings-update', updates) as Promise<boolean>
  },
  nodePositions: {
    getAll: (): Promise<{ node_id: string; x: number; y: number; updated_at: string }[]> =>
      ipcRenderer.invoke('node-positions-get-all'),
    save: (nodeId: string, x: number, y: number) =>
      ipcRenderer.invoke('node-position-save', nodeId, x, y),
    saveBatch: (positions: { node_id: string; x: number; y: number }[]) =>
      ipcRenderer.invoke('node-positions-save-batch', positions),
    delete: (nodeId: string) => ipcRenderer.invoke('node-position-delete', nodeId)
  },
  music: {
    selectDirectory: () => ipcRenderer.invoke('music-select-directory') as Promise<string | null>,
    getFolders: () =>
      ipcRenderer.invoke('music-get-folders') as Promise<
        {
          id: string
          path: string
          name: string
          description: string
          track_count: number
          coverDataUrl: string | null
          created_at: string
          updated_at: string
        }[]
      >,
    getTracks: (folderId: string) =>
      ipcRenderer.invoke('music-get-tracks', folderId) as Promise<
        {
          id: string
          filePath: string
          title: string
          artist: string
          album: string
          duration: number
          liked: boolean
          coverDataUrl: string | null
        }[]
      >,
    deleteFolder: (folderId: string) => ipcRenderer.invoke('music-delete-folder', folderId),
    createFolder: (name: string, description?: string) =>
      ipcRenderer.invoke('music-create-folder', name, description) as Promise<{
        id: string
        path: string
        name: string
        description: string
        track_count: number
        coverDataUrl: string | null
        created_at: string
        updated_at: string
      }>,
    updateFolderDescription: (folderId: string, description: string | null) =>
      ipcRenderer.invoke('music-update-folder-description', folderId, description) as Promise<void>,
    updateFolderCover: (folderId: string) =>
      ipcRenderer.invoke('music-update-folder-cover', folderId) as Promise<string | null>,
    saveFolderCover: (folderId: string, coverDataUrl: string | null) =>
      ipcRenderer.invoke('music-save-folder-cover', folderId, coverDataUrl) as Promise<void>,
    selectImage: () => ipcRenderer.invoke('music-select-image') as Promise<string | null>,
    updateFolder: (folderId: string, fields: { name?: string; description?: string | null }) =>
      ipcRenderer.invoke('music-update-folder', folderId, fields) as Promise<void>,
    addTracks: (folderId: string) =>
      ipcRenderer.invoke('music-add-tracks', folderId) as Promise<{
        added: {
          filePath: string
          title: string
          artist: string
          album: string
          duration: number
          coverDataUrl: string | null
        }[]
        skipped: string[]
      } | null>,
    updateTrack: (trackId: number, fields: { title?: string; artist?: string; album?: string }) =>
      ipcRenderer.invoke('music-update-track', trackId, fields) as Promise<void>,
    updateTrackCover: (trackId: number) =>
      ipcRenderer.invoke('music-update-track-cover', trackId) as Promise<string | null>,
    deleteTrack: (trackId: number) =>
      ipcRenderer.invoke('music-delete-track', trackId) as Promise<void>,
    readFile: (filePath: string) =>
      ipcRenderer.invoke('music-read-file', filePath) as Promise<ArrayBuffer>,
    toggleLike: (trackId: number) =>
      ipcRenderer.invoke('music-toggle-like', trackId) as Promise<boolean>,
    updateLastPlayed: (trackId: number) =>
      ipcRenderer.invoke('music-update-last-played', trackId) as Promise<void>,
    getLikedTracks: () =>
      ipcRenderer.invoke('music-get-liked-tracks') as Promise<
        {
          id: string
          filePath: string
          title: string
          artist: string
          album: string
          duration: number
          liked: boolean
          coverDataUrl: string | null
        }[]
      >,
    getRecentlyPlayed: () =>
      ipcRenderer.invoke('music-get-recently-played') as Promise<
        {
          id: string
          filePath: string
          title: string
          artist: string
          album: string
          duration: number
          liked: boolean
          coverDataUrl: string | null
        }[]
      >
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
