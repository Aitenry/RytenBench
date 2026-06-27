import { ElectronAPI } from '@electron-toolkit/preload'
import { TodoItemRow } from '../main/database/mapper/todo'
import { NoteRow, NoteListItem, NoteWithContent, PaginatedResult } from '../main/database/mapper/note'
import { WikiRow, WikiDirectoryRow } from '../main/database/mapper/wiki'
import { ChatTopicRow, ChatDialogueRow } from '../main/database/mapper/chat'
import type { LlmProviderInput, LlmProviderConfig } from '../main/database/mapper/provider'
import type { SystemSettings } from '../main/types/settings'
import type { StructuredMessage, ToolInfo } from '../renderer/resource/types/window'

interface ChatOptions {
  tools?: string[]
}

interface Api {
  todoItems: {
    getById: (id: number) => Promise<TodoItemRow[]>
    getByTitle: (title: string) => Promise<TodoItemRow[]>
    getByPriority: (priority: number) => Promise<TodoItemRow[]>
    getByCompletedStatus: (status: number) => Promise<TodoItemRow[]>
    getAll: () => Promise<TodoItemRow[]>
    getByDueDate: (dueDate: string) => Promise<TodoItemRow[]>
    add: (todoItem: Omit<TodoItemRow, 'id'>) => Promise<number>
    update: (id: number, updates: Partial<Omit<TodoItemRow, 'id'>>) => Promise<boolean>
    delete: (id: number) => Promise<boolean>
  }
  notes: {
    getById: (id: number) => Promise<NoteWithContent | null>
    getAll: (page?: number, pageSize?: number) => Promise<PaginatedResult<NoteListItem>>
    getPage: (query: string, page?: number, pageSize?: number) => Promise<PaginatedResult<NoteListItem>>
    add: (note: Omit<NoteRow, 'id' | 'created_at' | 'updated_at' | 'version'> & {
      image?: string | null
      content?: string | null
    }) => Promise<number>
    update: (id: number, updates: Partial<Omit<NoteRow, 'id' | 'created_at' | 'version'>> & {
      image?: string | null
      content?: string | null
    }) => Promise<boolean>
    delete: (id: number) => Promise<boolean>
  }
  wikis: {
    getById: (id: number) => Promise<WikiRow | null>
    getAll: (page?: number, pageSize?: number) => Promise<PaginatedResult<WikiRow>>
    add: (wiki: Omit<WikiRow, 'id' | 'note_count' | 'tags' | 'created_at' | 'updated_at'>) => Promise<number>
    update: (id: number, updates: Partial<Omit<WikiRow, 'id' | 'created_at'>>) => Promise<boolean>
    delete: (id: number) => Promise<boolean>
    getDirectories: (wikiId: number) => Promise<WikiDirectoryRow[]>
    addDirectory: (directory: Omit<WikiDirectoryRow, 'id' | 'created_at' | 'updated_at'>) => Promise<number>
    updateDirectory: (id: number, updates: Partial<Omit<WikiDirectoryRow, 'id' | 'created_at'>>) => Promise<boolean>
    deleteDirectory: (id: number) => Promise<boolean>
    getNotesByDirectory: (directoryId: number) => Promise<{ note_id: number; sort_order: number }[]>
    addNoteToDirectory: (directoryId: number, noteId: number, sortOrder?: number) => Promise<number>
    removeNoteFromDirectory: (directoryId: number, noteId: number) => Promise<boolean>
    getDirectoriesByNote: (noteId: number) => Promise<WikiDirectoryRow[]>
  }
  file: {
    selectImageFile: () => Promise<string | null>
  }
  setting: {
    getLockScreenCode: () => Promise<string>
    setLockScreenView: (open: boolean) => Promise<void>
  }
  chat: {
    sendMessage: (message: string, options?: ChatOptions & { providerId?: number }) => Promise<StructuredMessage[]>
    startMessageStream: (message: string, options?: ChatOptions & { topicId?: number; providerId?: number }) => void
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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
