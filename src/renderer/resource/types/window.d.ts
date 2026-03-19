import { TodoItemRow } from '../../../main/database/mapper/todo'
import { NoteRow, NoteListItem, NoteWithContent } from '../../../main/database/mapper/note'
import { Lock } from '@renderer/types/settings'

export interface PaginatedResult<T> {
  items: T[]
  hasMore: boolean
  total: number
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
    setting: {
      getLockScreenCode: () => Promise<Lock>
      setLockScreenView: (open) => void
    }
  }
}
