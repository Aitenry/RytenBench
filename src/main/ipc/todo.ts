import { ipcMain } from 'electron'
import logger from 'electron-log'
import { getActiveWorkspaceId } from '../database/workspace-context'
import { deleteNodePosition } from '../database/mapper/node_position'
import {
  getTodoItemById,
  getTodoItemByTitle,
  getTodoItemsByPriority,
  getAllTodoItems,
  getTodoItemsPaginated,
  getTodoItemsByDueDate,
  deleteTodoItem,
  updateTodoItem,
  addTodoItem,
  TodoItemRow
} from '../database/mapper/todo'
import {
  addDependency,
  deleteDependency,
  deleteAllDependenciesForTask,
  getAllDependencies,
  getAllTasksWithDependencies
} from '../database/mapper/todo_dependencies'

/** 待办事项 + 任务依赖关系 IPC */
export function registerTodoIpc(): void {
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
      return await getTodoItemByTitle(getActiveWorkspaceId(), title)
    } catch (error) {
      console.error('Error in todo-items-get-by-title:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-by-priority', async (_event, priority: number) => {
    try {
      return await getTodoItemsByPriority(getActiveWorkspaceId(), priority)
    } catch (error) {
      console.error('Error in todo-items-get-by-priority:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-by-completed-status', async (_event, status: number) => {
    try {
      return await getTodoItemsByPriority(getActiveWorkspaceId(), status)
    } catch (error) {
      console.error('Error in todo-items-get-by-completed-status:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-schedule', async () => {
    try {
      return await getAllTodoItems(getActiveWorkspaceId())
    } catch (error) {
      console.error('Error in todo-items-get-schedule:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-paginated', async (_event, page: number, pageSize: number) => {
    try {
      return await getTodoItemsPaginated(getActiveWorkspaceId(), page, pageSize)
    } catch (error) {
      console.error('Error in todo-items-get-paginated:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-get-by-due-date', async (_event, dueDate: string) => {
    try {
      return await getTodoItemsByDueDate(getActiveWorkspaceId(), dueDate)
    } catch (error) {
      console.error('Error in todo-items-get-by-due-date:', error)
      throw error
    }
  })

  ipcMain.handle('todo-items-add', async (_event, todoItem: Omit<TodoItemRow, 'id'>) => {
    try {
      return await addTodoItem(getActiveWorkspaceId(), todoItem)
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
      const result = await deleteTodoItem(id)
      // 同时清理该任务的所有依赖关系
      deleteAllDependenciesForTask(id).catch((err) =>
        logger.error('Failed to delete dependencies for todo:', err)
      )
      deleteNodePosition(`todo-${id}`).catch((err) =>
        logger.error('Failed to delete node position for todo:', err)
      )
      return result
    } catch (error) {
      console.error('Error in todo-items-delete:', error)
      throw error
    }
  })

  // --- 任务依赖关系 IPC handlers ---
  ipcMain.handle('task-deps-add', async (_event, taskId: number, dependsOnTaskId: number) => {
    try {
      return await addDependency(taskId, dependsOnTaskId)
    } catch (error) {
      console.error('Error in task-deps-add:', error)
      throw error
    }
  })

  ipcMain.handle('task-deps-delete', async (_event, taskId: number, dependsOnTaskId: number) => {
    try {
      return await deleteDependency(taskId, dependsOnTaskId)
    } catch (error) {
      console.error('Error in task-deps-delete:', error)
      throw error
    }
  })

  ipcMain.handle('task-deps-get-all', async () => {
    try {
      return await getAllDependencies(getActiveWorkspaceId())
    } catch (error) {
      console.error('Error in task-deps-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('task-deps-get-with-tasks', async () => {
    try {
      return await getAllTasksWithDependencies(getActiveWorkspaceId())
    } catch (error) {
      console.error('Error in task-deps-get-with-tasks:', error)
      throw error
    }
  })
}
