import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'
import type { TodoItemRow } from './todo'

export interface TaskDependencyRow {
  id: number
  task_id: number
  depends_on_task_id: number
  created_at: string
}

/** 带依赖关系的任务信息 */
export interface TaskWithDependencies extends TodoItemRow {
  dependencies: number[] // 该任务依赖的前置任务 ID 列表
  dependents: number[] // 依赖该任务的后置任务 ID 列表
}

// --- 添加依赖关系 ---
async function addDependency(taskId: number, dependsOnTaskId: number): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql =
      'INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2) RETURNING id'
    const result = await db.query<{ id: number }>(sql, [taskId, dependsOnTaskId])
    const newId = result.rows[0].id
    logger.info(`Added dependency: task ${taskId} depends on ${dependsOnTaskId}, id=${newId}`)
    return newId
  } catch (error) {
    logger.error('Failed to add dependency:', error)
    throw error
  }
}

// --- 删除依赖关系 ---
async function deleteDependency(taskId: number, dependsOnTaskId: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2'
    const result = await db.query(sql, [taskId, dependsOnTaskId])
    const changes = result.affectedRows ?? 0
    logger.info(
      `Deleted dependency: task ${taskId} -> depends on ${dependsOnTaskId}, ${changes} row(s) affected.`
    )
    return changes > 0
  } catch (error) {
    logger.error('Failed to delete dependency:', error)
    throw error
  }
}

// --- 删除某个任务的所有依赖（作为前置或后置） ---
async function deleteAllDependenciesForTask(taskId: number): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM task_dependencies WHERE task_id = $1 OR depends_on_task_id = $1'
    const result = await db.query(sql, [taskId])
    const count = result.affectedRows ?? 0
    logger.info(`Deleted ${count} dependency row(s) for task ${taskId}.`)
    return count
  } catch (error) {
    logger.error('Failed to delete all dependencies for task:', error)
    throw error
  }
}

// --- 获取某个任务的直接前置依赖 ---
async function getDirectDependencies(taskId: number): Promise<TaskDependencyRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM task_dependencies WHERE task_id = $1'
    const result = await db.query<TaskDependencyRow>(sql, [taskId])
    return result.rows
  } catch (error) {
    logger.error('Failed to get direct dependencies:', error)
    throw error
  }
}

// --- 获取某个任务的后置依赖（哪些任务依赖它） ---
async function getDependents(taskId: number): Promise<TaskDependencyRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM task_dependencies WHERE depends_on_task_id = $1'
    const result = await db.query<TaskDependencyRow>(sql, [taskId])
    return result.rows
  } catch (error) {
    logger.error('Failed to get dependents:', error)
    throw error
  }
}

// --- 获取所有依赖关系（按工作区过滤） ---
async function getAllDependencies(workspaceId: number): Promise<TaskDependencyRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = `
      SELECT d.* FROM task_dependencies d
      INNER JOIN todo_items t ON t.id = d.task_id
      WHERE t.workspace_id = $1
      ORDER BY d.task_id
    `
    const result = await db.query<TaskDependencyRow>(sql, [workspaceId])
    return result.rows
  } catch (error) {
    logger.error('Failed to get all dependencies:', error)
    throw error
  }
}

// --- 获取所有任务及其依赖关系（用于甘特图，按工作区过滤） ---
async function getAllTasksWithDependencies(workspaceId: number): Promise<TaskWithDependencies[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    const tasksResult = await db.query<TodoItemRow>(
      'SELECT * FROM todo_items WHERE workspace_id = $1 ORDER BY priority ASC, due_date ASC',
      [workspaceId]
    )
    const tasks = tasksResult.rows

    const depsResult = await db.query<TaskDependencyRow>(
      `SELECT d.* FROM task_dependencies d
       INNER JOIN todo_items t ON t.id = d.task_id
       WHERE t.workspace_id = $1`,
      [workspaceId]
    )
    const allDeps = depsResult.rows

    const taskMap = new Map<number, TaskWithDependencies>()
    for (const task of tasks) {
      taskMap.set(task.id, {
        ...task,
        dependencies: [],
        dependents: []
      })
    }

    for (const dep of allDeps) {
      const task = taskMap.get(dep.task_id)
      if (task) {
        task.dependencies.push(dep.depends_on_task_id)
      }
      const predecessor = taskMap.get(dep.depends_on_task_id)
      if (predecessor) {
        predecessor.dependents.push(dep.task_id)
      }
    }

    logger.info(
      `Loaded ${tasks.length} tasks with ${allDeps.length} dependency relations for Gantt chart.`
    )
    return Array.from(taskMap.values())
  } catch (error) {
    logger.error('Failed to get all tasks with dependencies:', error)
    throw error
  }
}

export {
  addDependency,
  deleteDependency,
  deleteAllDependenciesForTask,
  getDirectDependencies,
  getDependents,
  getAllDependencies,
  getAllTasksWithDependencies
}
