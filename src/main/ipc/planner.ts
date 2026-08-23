import { ipcMain } from 'electron'
import {
  getAllTasks as getAllPlannerTasks,
  getTaskById as getPlannerTaskById,
  getTaskTree as getPlannerTaskTree,
  addTask as addPlannerTask,
  updateTask as updatePlannerTask,
  deleteTask as deletePlannerTask,
  reorderTasks as reorderPlannerTasks,
  addDependency as addPlannerDependency,
  deleteDependency as deletePlannerDependency,
  getAllDependencies as getAllPlannerDependencies
} from '../database/mapper/planner'

/** Planner（甘特图）IPC */
export function registerPlannerIpc(): void {
  ipcMain.handle('planner-tasks-get-all', async () => {
    try {
      return await getAllPlannerTasks()
    } catch (error) {
      console.error('Error in planner-tasks-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-get-by-id', async (_event, id: number) => {
    try {
      return await getPlannerTaskById(id)
    } catch (error) {
      console.error('Error in planner-tasks-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-get-tree', async () => {
    try {
      return await getPlannerTaskTree()
    } catch (error) {
      console.error('Error in planner-tasks-get-tree:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-add', async (_event, task) => {
    try {
      return await addPlannerTask(task)
    } catch (error) {
      console.error('Error in planner-tasks-add:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-update', async (_event, id: number, updates) => {
    try {
      return await updatePlannerTask(id, updates)
    } catch (error) {
      console.error('Error in planner-tasks-update:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-delete', async (_event, id: number) => {
    try {
      return await deletePlannerTask(id)
    } catch (error) {
      console.error('Error in planner-tasks-delete:', error)
      throw error
    }
  })

  ipcMain.handle('planner-tasks-reorder', async (_event, orderList) => {
    try {
      return await reorderPlannerTasks(orderList)
    } catch (error) {
      console.error('Error in planner-tasks-reorder:', error)
      throw error
    }
  })

  ipcMain.handle('planner-deps-add', async (_event, taskId: number, dependsOnTaskId: number) => {
    try {
      return await addPlannerDependency(taskId, dependsOnTaskId)
    } catch (error) {
      console.error('Error in planner-deps-add:', error)
      throw error
    }
  })

  ipcMain.handle('planner-deps-delete', async (_event, taskId: number, dependsOnTaskId: number) => {
    try {
      return await deletePlannerDependency(taskId, dependsOnTaskId)
    } catch (error) {
      console.error('Error in planner-deps-delete:', error)
      throw error
    }
  })

  ipcMain.handle('planner-deps-get-all', async () => {
    try {
      return await getAllPlannerDependencies()
    } catch (error) {
      console.error('Error in planner-deps-get-all:', error)
      throw error
    }
  })
}
