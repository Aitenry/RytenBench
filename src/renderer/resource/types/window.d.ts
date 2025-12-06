import { TodoItemRow } from '../../../main/database/mapper/todo'
import { Lock } from '@renderer/types/settings'

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
    setting: {
      getLockScreenCode: () => Promise<Lock>
      setLockScreenView: (open) => void
    }
  }
}
