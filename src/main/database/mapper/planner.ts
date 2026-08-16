import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'

export interface PlannerTaskRow {
  id: number
  parent_id: number | null
  title: string
  type: string // 'project' | 'phase' | 'task'
  progress: number // 0-100
  work_hours: number
  priority: number // P0-P7, 0=highest
  start_date: string | null
  end_date: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PlannerDependencyRow {
  id: number
  task_id: number
  depends_on_task_id: number
  created_at: string
}

/** 树节点，含子节点和依赖信息 */
export interface PlannerTreeNode extends PlannerTaskRow {
  children: PlannerTreeNode[]
  dependencies: number[]
  depth: number
}

// --- 查询所有任务（按工作区过滤） ---
async function getAllTasks(workspaceId: number): Promise<PlannerTaskRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM planner_tasks WHERE workspace_id = $1 ORDER BY sort_order ASC'
    const result = await db.query<PlannerTaskRow>(sql, [workspaceId])
    logger.info(`planner: loaded ${result.rows.length} tasks`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get all planner tasks:', error)
    throw error
  }
}

// --- 根据 ID 查询 ---
async function getTaskById(id: number): Promise<PlannerTaskRow | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM planner_tasks WHERE id = $1'
    const result = await db.query<PlannerTaskRow>(sql, [id])
    return result.rows[0] ?? null
  } catch (error) {
    logger.error('Failed to get planner task by id:', error)
    throw error
  }
}

// --- 获取树形结构（含依赖，按工作区过滤） ---
async function getTaskTree(workspaceId: number): Promise<PlannerTreeNode[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    const tasksResult = await db.query<PlannerTaskRow>(
      'SELECT * FROM planner_tasks WHERE workspace_id = $1 ORDER BY start_date ASC NULLS LAST, sort_order ASC',
      [workspaceId]
    )
    const tasks = tasksResult.rows

    const depsResult = await db.query<PlannerDependencyRow>(
      `SELECT d.* FROM planner_dependencies d
       INNER JOIN planner_tasks t ON t.id = d.task_id
       WHERE t.workspace_id = $1`,
      [workspaceId]
    )
    const allDeps = depsResult.rows

    // 构建 taskId -> dependencies[] 映射
    const depMap = new Map<number, number[]>()
    for (const dep of allDeps) {
      const list = depMap.get(dep.task_id) ?? []
      list.push(dep.depends_on_task_id)
      depMap.set(dep.task_id, list)
    }

    // 构建 taskId -> node 映射
    const nodeMap = new Map<number, PlannerTreeNode>()
    for (const task of tasks) {
      nodeMap.set(task.id, {
        ...task,
        children: [],
        dependencies: depMap.get(task.id) ?? [],
        depth: 0
      })
    }

    // 构建树
    const roots: PlannerTreeNode[] = []
    for (const node of nodeMap.values()) {
      if (node.parent_id !== null) {
        const parent = nodeMap.get(node.parent_id)
        if (parent) {
          parent.children.push(node)
        } else {
          roots.push(node)
        }
      } else {
        roots.push(node)
      }
    }

    // 计算深度
    function setDepth(nodes: PlannerTreeNode[], depth: number): void {
      for (const node of nodes) {
        node.depth = depth
        setDepth(node.children, depth + 1)
      }
    }

    setDepth(roots, 0)

    // 按 start_date 递归排序子节点
    function sortChildren(nodes: PlannerTreeNode[]): void {
      nodes.sort((a, b) => {
        const aDate = typeof a.start_date === 'string' ? a.start_date : ''
        const bDate = typeof b.start_date === 'string' ? b.start_date : ''
        if (aDate !== bDate) return aDate.localeCompare(bDate)
        return a.sort_order - b.sort_order
      })
      for (const node of nodes) {
        sortChildren(node.children)
      }
    }

    sortChildren(roots)

    logger.info(`planner: built tree with ${tasks.length} nodes, ${roots.length} roots`)
    return roots
  } catch (error) {
    logger.error('Failed to get planner task tree:', error)
    throw error
  }
}

// --- 添加任务 ---
async function addTask(
  workspaceId: number,
  task: Omit<PlannerTaskRow, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const fields = [
      'workspace_id',
      'parent_id',
      'title',
      'type',
      'progress',
      'work_hours',
      'priority',
      'start_date',
      'end_date',
      'sort_order'
    ]
    const placeholders = fields.map((_, i) => `$${i + 1}`)
    const sql = `INSERT INTO planner_tasks (${fields.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`
    const values = [
      workspaceId,
      task.parent_id,
      task.title,
      task.type,
      task.progress,
      task.work_hours,
      task.priority,
      task.start_date,
      task.end_date,
      task.sort_order
    ]
    const result = await db.query<{ id: number }>(sql, values)
    logger.info(`planner: inserted task id=${result.rows[0].id}`)
    return result.rows[0].id
  } catch (error) {
    logger.error('Failed to add planner task:', error)
    throw error
  }
}

// --- 更新任务 ---
async function updateTask(
  id: number,
  updates: Partial<Omit<PlannerTaskRow, 'id' | 'created_at'>>
): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const allowedFields = [
      'parent_id',
      'title',
      'type',
      'progress',
      'work_hours',
      'priority',
      'start_date',
      'end_date',
      'sort_order'
    ]

    const updateFields: string[] = []
    const updateValues: unknown[] = []
    let paramIdx = 1

    for (const field of allowedFields) {
      if (field in updates) {
        updateFields.push(`${field} = $${paramIdx++}`)
        updateValues.push((updates as Record<string, unknown>)[field])
      }
    }

    updateFields.push(`updated_at = NOW()`)

    if (updateFields.length === 1) {
      logger.warn('planner: no fields to update')
      return false
    }

    const sql = `UPDATE planner_tasks SET ${updateFields.join(', ')} WHERE id = $${paramIdx++}`
    updateValues.push(id)

    const result = await db.query(sql, updateValues)
    const changes = result.affectedRows ?? 0
    logger.info(`planner: updated task id=${id}, ${changes} row(s) affected`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to update planner task:', error)
    throw error
  }
}

// --- 删除任务（级联删除子任务） ---
async function deleteTask(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM planner_tasks WHERE id = $1'
    const result = await db.query(sql, [id])
    const changes = result.affectedRows ?? 0
    logger.info(`planner: deleted task id=${id}, ${changes} row(s)`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to delete planner task:', error)
    throw error
  }
}

// --- 批量调整排序 ---
async function reorderTasks(
  orderList: { id: number; sort_order: number; parent_id: number | null }[]
): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    for (const item of orderList) {
      await db.query('UPDATE planner_tasks SET sort_order = $1, parent_id = $2 WHERE id = $3', [
        item.sort_order,
        item.parent_id,
        item.id
      ])
    }
    return true
  } catch (error) {
    logger.error('Failed to reorder planner tasks:', error)
    throw error
  }
}

// --- 添加依赖 ---
async function addDependency(taskId: number, dependsOnTaskId: number): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql =
      'INSERT INTO planner_dependencies (task_id, depends_on_task_id) VALUES ($1, $2) RETURNING id'
    const result = await db.query<{ id: number }>(sql, [taskId, dependsOnTaskId])
    logger.info(`planner: added dep ${taskId} -> ${dependsOnTaskId}`)
    return result.rows[0].id
  } catch (error) {
    logger.error('Failed to add planner dependency:', error)
    throw error
  }
}

// --- 删除依赖 ---
async function deleteDependency(taskId: number, dependsOnTaskId: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM planner_dependencies WHERE task_id = $1 AND depends_on_task_id = $2'
    const result = await db.query(sql, [taskId, dependsOnTaskId])
    return (result.affectedRows ?? 0) > 0
  } catch (error) {
    logger.error('Failed to delete planner dependency:', error)
    throw error
  }
}

// --- 获取所有依赖（按工作区过滤） ---
async function getAllDependencies(workspaceId: number): Promise<PlannerDependencyRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = `
      SELECT d.* FROM planner_dependencies d
      INNER JOIN planner_tasks t ON t.id = d.task_id
      WHERE t.workspace_id = $1
      ORDER BY d.task_id
    `
    const result = await db.query<PlannerDependencyRow>(sql, [workspaceId])
    return result.rows
  } catch (error) {
    logger.error('Failed to get all planner dependencies:', error)
    throw error
  }
}

export {
  getAllTasks,
  getTaskById,
  getTaskTree,
  addTask,
  updateTask,
  deleteTask,
  reorderTasks,
  addDependency,
  deleteDependency,
  getAllDependencies
}
