import { ElectronAPI } from '@electron-toolkit/preload'
import { TodoItemRow } from '../main/database/mapper/todo'
import type {
  TaskDependencyRow,
  TaskWithDependencies
} from '../main/database/mapper/todo_dependencies'
import type {
  PlannerTaskRow,
  PlannerTreeNode,
  PlannerDependencyRow
} from '../main/database/mapper/planner'
import {
  DocRow,
  DocListItem,
  DocWithContent,
  PaginatedResult
} from '../main/database/mapper/document'
import { WikiRow, WikiDirectoryRow } from '../main/database/mapper/wiki'
import { ChatTopicRow, ChatDialogueRow } from '../main/database/mapper/chat'
import type { LlmProviderInput, LlmProviderConfig } from '../main/database/mapper/provider'
import type { SystemSettings } from '../main/types/settings'
import type { StructuredMessage, ToolInfo } from '../renderer/resource/types/window'

interface ChatOptions {
  tools?: string[]
  images?: string[]
  documents?: { fileName: string; filePath: string }[]
}

interface Api {
  todoItems: {
    getById: (id: number) => Promise<TodoItemRow[]>
    getByTitle: (title: string) => Promise<TodoItemRow[]>
    getByPriority: (priority: number) => Promise<TodoItemRow[]>
    getByCompletedStatus: (status: number) => Promise<TodoItemRow[]>
    getAll: () => Promise<TodoItemRow[]>
    getAllPaginated: (page?: number, pageSize?: number) => Promise<PaginatedResult<TodoItemRow>>
    getByDueDate: (dueDate: string) => Promise<TodoItemRow[]>
    add: (todoItem: Omit<TodoItemRow, 'id'>) => Promise<number>
    update: (id: number, updates: Partial<Omit<TodoItemRow, 'id'>>) => Promise<boolean>
    delete: (id: number) => Promise<boolean>
  }
  taskDependencies: {
    add: (taskId: number, dependsOnTaskId: number) => Promise<number>
    delete: (taskId: number, dependsOnTaskId: number) => Promise<boolean>
    getAll: () => Promise<TaskDependencyRow[]>
    getTasksWithDeps: () => Promise<TaskWithDependencies[]>
  }
  planner: {
    tasks: {
      getAll: () => Promise<PlannerTaskRow[]>
      getById: (id: number) => Promise<PlannerTaskRow | null>
      getTree: () => Promise<PlannerTreeNode[]>
      add: (task: Omit<PlannerTaskRow, 'id' | 'created_at' | 'updated_at'>) => Promise<number>
      update: (id: number, updates: Partial<Omit<PlannerTaskRow, 'id' | 'created_at'>>) => Promise<boolean>
      delete: (id: number) => Promise<boolean>
      reorder: (orderList: { id: number; sort_order: number; parent_id: number | null }[]) => Promise<boolean>
    }
    deps: {
      add: (taskId: number, dependsOnTaskId: number) => Promise<number>
      delete: (taskId: number, dependsOnTaskId: number) => Promise<boolean>
      getAll: () => Promise<PlannerDependencyRow[]>
    }
  }
  docs: {
    getById: (id: number) => Promise<DocWithContent | null>
    getAll: (
      page?: number,
      pageSize?: number,
      excludeWikiId?: number,
      search?: string
    ) => Promise<PaginatedResult<DocListItem>>
    getPage: (
      query: string,
      page?: number,
      pageSize?: number
    ) => Promise<PaginatedResult<DocListItem>>
    add: (
      doc: Omit<DocRow, 'id' | 'created_at' | 'updated_at' | 'version'> & {
        image?: string | null
        content?: string | null
      }
    ) => Promise<number>
    update: (
      id: number,
      updates: Partial<Omit<DocRow, 'id' | 'created_at'>> & {
        image?: string | null
        content?: string | null
      }
    ) => Promise<boolean>
    delete: (id: number) => Promise<boolean>
    deleteByTimeRange: (startTime: string, endTime: string) => Promise<number>
    importDocument: () => Promise<{ title: string; content: string } | null>
    exportDocument: (id: number) => Promise<boolean>
  }
  wikis: {
    getById: (id: number) => Promise<WikiRow | null>
    getAll: (page?: number, pageSize?: number) => Promise<PaginatedResult<WikiRow>>
    add: (
      wiki: Omit<WikiRow, 'id' | 'doc_count' | 'created_at' | 'updated_at'>
    ) => Promise<number>
    update: (id: number, updates: Partial<Omit<WikiRow, 'id' | 'doc_count' | 'created_at'>>) => Promise<boolean>
    delete: (id: number) => Promise<boolean>
    getDirectories: (wikiId: number) => Promise<WikiDirectoryRow[]>
    addDirectory: (
      directory: Omit<WikiDirectoryRow, 'id' | 'created_at' | 'updated_at'>
    ) => Promise<number>
    updateDirectory: (
      id: number,
      updates: Partial<Omit<WikiDirectoryRow, 'id' | 'created_at'>>
    ) => Promise<boolean>
    deleteDirectory: (id: number) => Promise<boolean>
    getNotesByDirectory: (directoryId: number) => Promise<{ doc_id: number; sort_order: number }[]>
    addNoteToDirectory: (directoryId: number, noteId: number, sortOrder?: number) => Promise<number>
    removeNoteFromDirectory: (directoryId: number, noteId: number) => Promise<boolean>
    getDirectoriesByNote: (noteId: number) => Promise<WikiDirectoryRow[]>
  }
  file: {
    selectImageFile: (
      allowImages?: boolean
    ) => Promise<{ dataUrl: string; fileName: string; isImage: boolean } | null>
    selectTextFile: () => Promise<{ fileName: string; filePath: string } | null>
  }
  setting: {
    getLockScreenCode: () => Promise<string>
    setLockScreenView: (open: boolean) => Promise<void>
  }
  chat: {
    sendMessage: (
      message: string,
      options?: ChatOptions & { providerId?: number }
    ) => Promise<StructuredMessage[]>
    startMessageStream: (
      message: string,
      options?: ChatOptions & { topicId?: number; providerId?: number }
    ) => void
    getTools: () => Promise<ToolInfo[]>
    onStreamChunk: (callback: (chunk: StructuredMessage) => void) => () => void
    onStreamDone: (callback: (result: { topicId: number }) => void) => () => void
    // 话题管理
    getAllTopics: () => Promise<ChatTopicRow[]>
    getTopicById: (id: number) => Promise<ChatTopicRow[]>
    createTopic: (title: string, model?: string, selectedTools?: string) => Promise<number>
    updateTopic: (
      id: number,
      updates: Partial<Pick<ChatTopicRow, 'title' | 'model' | 'selected_tools'>>
    ) => Promise<boolean>
    deleteTopic: (id: number) => Promise<boolean>
    // 消息管理
    getDialoguesByTopic: (topicId: number) => Promise<ChatDialogueRow[]>
    addDialogue: (dialogue: Omit<ChatDialogueRow, 'id' | 'created_at'>) => Promise<number>
    deleteDialoguesByTopic: (topicId: number) => Promise<boolean>
  }
  providers: {
    getAll: () => Promise<LlmProviderConfig[]>
    getById: (id: number) => Promise<LlmProviderConfig | null>
    getDefault: () => Promise<LlmProviderConfig | null>
    getEnabled: () => Promise<LlmProviderConfig[]>
    create: (input: LlmProviderInput) => Promise<number>
    update: (id: number, updates: Partial<LlmProviderInput>) => Promise<boolean>
    delete: (id: number) => Promise<boolean>
    setDefault: (id: number) => Promise<boolean>
  }
  systemSettings: {
    getAll: () => Promise<SystemSettings>
    update: (updates: Partial<SystemSettings>) => Promise<boolean>
  }
  nodePositions: {
    getAll: () => Promise<{ node_id: string; x: number; y: number; updated_at: string }[]>
    save: (nodeId: string, x: number, y: number) => Promise<void>
    saveBatch: (positions: { node_id: string; x: number; y: number }[]) => Promise<void>
    delete: (nodeId: string) => Promise<boolean>
  }
  music: {
    selectDirectory: () => Promise<string | null>
    getFolders: () => Promise<
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
    >
    getTracks: (folderId: string) => Promise<
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
    deleteFolder: (folderId: string) => Promise<void>
    createFolder: (
      name: string,
      description?: string
    ) => Promise<{
      id: string
      path: string
      name: string
      description: string
      track_count: number
      coverDataUrl: string | null
      created_at: string
      updated_at: string
    }>
    updateFolderDescription: (folderId: string, description: string | null) => Promise<void>
    updateFolderCover: (folderId: string) => Promise<string | null>
    saveFolderCover: (folderId: string, coverDataUrl: string | null) => Promise<void>
    selectImage: () => Promise<string | null>
    updateFolder: (
      folderId: string,
      fields: { name?: string; description?: string | null }
    ) => Promise<void>
    addTracks: (folderId: string) => Promise<{
      added: {
        filePath: string
        title: string
        artist: string
        album: string
        duration: number
        coverDataUrl: string | null
      }[]
      skipped: string[]
    } | null>
    updateTrack: (
      trackId: number,
      fields: { title?: string; artist?: string; album?: string }
    ) => Promise<void>
    updateTrackCover: (trackId: number) => Promise<string | null>
    deleteTrack: (trackId: number) => Promise<void>
    readFile: (filePath: string) => Promise<ArrayBuffer>
    toggleLike: (trackId: number) => Promise<boolean>
    updateLastPlayed: (trackId: number) => Promise<void>
    getLikedTracks: () => Promise<
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
    getRecentlyPlayed: () => Promise<
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
    /** 监听来自 AI 对话的播放请求，返回取消监听的函数 */
    onMusicPlay: (callback: (data: {
      track: {
        id: string
        filePath: string
        title: string
        artist: string
        album: string
        duration: number
        liked: boolean
        coverDataUrl: string | null
      }
      folderTracks: {
        id: string
        filePath: string
        title: string
        artist: string
        album: string
        duration: number
        liked: boolean
        coverDataUrl: string | null
      }[]
      folderId: string
      targetIndex: number
    }) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
