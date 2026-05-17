import { TodoItemRow } from '../../../main/database/mapper/todo'
import { NoteRow, NoteListItem, NoteWithContent } from '../../../main/database/mapper/note'
import { WikiRow, WikiDirectoryRow } from '../../../main/database/mapper/wiki'
import { Lock } from '@renderer/types/settings'

export interface PaginatedResult<T> {
  items: T[]
  hasMore: boolean
  total: number
}

export interface ToolCallDetail {
  name: string
  input: Record<string, unknown>
  output: string
}

export interface StructuredMessage {
  tool?: ToolCallDetail
  content?: string
}

export interface Window {
  loading: {
    onInitProgress: (
      callback: (
        event: Event,
        data: {
          progress: number
          currentTask: string
          taskIndex: number
          totalTasks: number
        }
      ) => void
    ) => void
    onInitComplete: (callback: () => void) => void
    onInitError: (callback: (event: Event, errorMessage: string) => void) => void
    notifyInitComplete: () => void
  }
  api: {
    todoItems: {
      getById: (id: number) => Promise<TodoItemRow[]>
      getByTitle: (title: string) => Promise<TodoItemRow[]>
      getByPriority: (priority: number) => Promise<TodoItemRow[]>
      getByCompletedStatus: (completed: boolean) => Promise<TodoItemRow[]>
      getAll: () => Promise<TodoItemRow[]>
      getByDueDate: (dueDate: string) => Promise<TodoItemRow[]>
      add: (
        todoItem: Omit<
          TodoItemRow,
          'id' | 'created_at' | 'updated_at' | 'completed_at' | 'started_at'
        >
      ) => Promise<number>
      update: (id: number, updates: Partial<Omit<TodoItemRow, 'id'>>) => Promise<boolean>
      delete: (id: number) => Promise<boolean>
    }
    notes: {
      getById: (id: number) => Promise<NoteWithContent | null>
      getAll: (page?: number, pageSize?: number) => Promise<PaginatedResult<NoteListItem>>
      getPage: (
        query: string,
        page?: number,
        pageSize?: number
      ) => Promise<PaginatedResult<NoteListItem>>
      add: (
        note: Omit<NoteRow, 'id' | 'created_at' | 'updated_at' | 'version'> & {
          image?: string | null
          content?: string | null
        }
      ) => Promise<number>
      update: (
        id: number,
        updates: Partial<Omit<NoteRow, 'id' | 'created_at' | 'version'>> & {
          image?: string | null
          content?: string | null
        }
      ) => Promise<boolean>
      delete: (id: number) => Promise<boolean>
    }
    file: {
      selectImageFile: () => Promise<string | null>
    }
    wikis: {
      getById: (id: number) => Promise<WikiRow | null>
      getAll: (page?: number, pageSize?: number) => Promise<PaginatedResult<WikiRow>>
      add: (
        wiki: Omit<WikiRow, 'id' | 'note_count' | 'tags' | 'created_at' | 'updated_at'>
      ) => Promise<number>
      update: (id: number, updates: Partial<Omit<WikiRow, 'id' | 'created_at'>>) => Promise<boolean>
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
      getNotesByDirectory: (
        directoryId: number
      ) => Promise<{ note_id: number; sort_order: number }[]>
      addNoteToDirectory: (
        directoryId: number,
        noteId: number,
        sortOrder?: number
      ) => Promise<number>
      removeNoteFromDirectory: (directoryId: number, noteId: number) => Promise<boolean>
      getDirectoriesByNote: (noteId: number) => Promise<WikiDirectoryRow[]>
    }
    setting: {
      getLockScreenCode: () => Promise<Lock>
      setLockScreenView: (open) => void
    },
    chat: {
      sendMessage: (message: string, options?: { deepThinking?: boolean; smartSearch?: boolean }) => Promise<StructuredMessage[]>
      onStreamChunk: (callback: (chunk: StructuredMessage) => void) => () => void
      startMessageStream: (message: string, options?: { deepThinking?: boolean; smartSearch?: boolean }) => void
    }
  }
}
