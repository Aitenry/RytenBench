import { and, asc, eq, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import logger from 'electron-log'
import { withOrm } from '../orm'
import { planner_dependencies, planner_tasks } from '../schema'

/** 计划任务行（字段由 schema 推导） */
export type PlannerTaskRow = typeof planner_tasks.$inferSelect

/** 计划任务依赖行 */
export type PlannerDependencyRow = typeof planner_dependencies.$inferSelect

/** 树节点，含子节点和依赖信息 */
export interface PlannerTreeNode extends PlannerTaskRow {
  children: PlannerTreeNode[]
  dependencies: number[]
  depth: number
}

/** 可由更新语句写入的列（与原实现的 allowedFields 一致） */
const UPDATABLE_FIELDS = [
  'parent_id',
  'title',
  'type',
  'progress',
  'work_hours',
  'priority',
  'start_date',
  'end_date',
  'sort_order'
] as const

// --- 查询所有任务 ---
async function getAllTasks(): Promise<PlannerTaskRow[]> {
  return withOrm('getAllTasks', async (db) => {
    const rows = await db.select().from(planner_tasks).orderBy(asc(planner_tasks.sort_order))
    logger.info(`planner: loaded ${rows.length} tasks`)
    return rows
  })
}

// --- 根据 ID 查询 ---
async function getTaskById(id: number): Promise<PlannerTaskRow | null> {
  return withOrm('getTaskById', async (db) => {
    const rows = await db.select().from(planner_tasks).where(eq(planner_tasks.id, id)).limit(1)
    return rows[0] ?? null
  })
}

// --- 获取树形结构（含依赖） ---
async function getTaskTree(): Promise<PlannerTreeNode[]> {
  return withOrm('getTaskTree', async (db) => {
    const tasks = await db
      .select()
      .from(planner_tasks)
      // PostgreSQL 的 ASC 默认即 NULLS LAST，与原实现的 `start_date ASC NULLS LAST` 一致
      .orderBy(asc(planner_tasks.start_date), asc(planner_tasks.sort_order))

    const allDeps = await db.select().from(planner_dependencies)

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
        // sort_order 库列为可空（DEFAULT 0），null 按默认值参与排序
        return (a.sort_order ?? 0) - (b.sort_order ?? 0)
      })
      for (const node of nodes) {
        sortChildren(node.children)
      }
    }

    sortChildren(roots)

    logger.info(`planner: built tree with ${tasks.length} nodes, ${roots.length} roots`)
    return roots
  })
}

// --- 添加任务 ---
async function addTask(
  task: Omit<PlannerTaskRow, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  return withOrm('addTask', async (db) => {
    const rows = await db
      .insert(planner_tasks)
      .values({
        parent_id: task.parent_id,
        title: task.title,
        type: task.type,
        progress: task.progress,
        work_hours: task.work_hours,
        priority: task.priority,
        start_date: task.start_date,
        end_date: task.end_date,
        sort_order: task.sort_order
      })
      .returning({ id: planner_tasks.id })
    logger.info(`planner: inserted task id=${rows[0].id}`)
    return rows[0].id
  })
}

// --- 更新任务 ---
async function updateTask(
  id: number,
  updates: Partial<Omit<PlannerTaskRow, 'id' | 'created_at'>>
): Promise<boolean> {
  return withOrm('updateTask', async (db) => {
    const patch: PgUpdateSetSource<typeof planner_tasks> = {}

    for (const field of UPDATABLE_FIELDS) {
      const value = (updates as Record<string, unknown>)[field]
      // !== undefined（修复：此前 `field in updates` 会把显式 undefined 键拼进 SET）
      if (value !== undefined) {
        patch[field] = value as never
      }
    }

    if (Object.keys(patch).length === 0) {
      logger.warn('planner: no fields to update')
      return false
    }

    patch.updated_at = sql`now()`
    const updated = await db
      .update(planner_tasks)
      .set(patch)
      .where(eq(planner_tasks.id, id))
      .returning({ id: planner_tasks.id })

    logger.info(`planner: updated task id=${id}, ${updated.length} row(s) affected`)
    return updated.length > 0
  })
}

// --- 删除任务（级联删除子任务） ---
async function deleteTask(id: number): Promise<boolean> {
  return withOrm('deleteTask', async (db) => {
    const deleted = await db
      .delete(planner_tasks)
      .where(eq(planner_tasks.id, id))
      .returning({ id: planner_tasks.id })
    logger.info(`planner: deleted task id=${id}, ${deleted.length} row(s)`)
    return deleted.length > 0
  })
}

// --- 批量调整排序 ---
async function reorderTasks(
  orderList: { id: number; sort_order: number; parent_id: number | null }[]
): Promise<boolean> {
  return withOrm('reorderTasks', async (db) => {
    // 单事务批量更新（修复：逐条 UPDATE 无事务,中断即半重排）
    await db.transaction(async (tx) => {
      for (const item of orderList) {
        await tx
          .update(planner_tasks)
          .set({ sort_order: item.sort_order, parent_id: item.parent_id })
          .where(eq(planner_tasks.id, item.id))
      }
    })
    return true
  })
}

// --- 添加依赖 ---
async function addDependency(taskId: number, dependsOnTaskId: number): Promise<number> {
  return withOrm('addDependency', async (db) => {
    const rows = await db
      .insert(planner_dependencies)
      .values({ task_id: taskId, depends_on_task_id: dependsOnTaskId })
      .returning({ id: planner_dependencies.id })
    logger.info(`planner: added dep ${taskId} -> ${dependsOnTaskId}`)
    return rows[0].id
  })
}

// --- 删除依赖 ---
async function deleteDependency(taskId: number, dependsOnTaskId: number): Promise<boolean> {
  return withOrm('deleteDependency', async (db) => {
    const deleted = await db
      .delete(planner_dependencies)
      .where(
        and(
          eq(planner_dependencies.task_id, taskId),
          eq(planner_dependencies.depends_on_task_id, dependsOnTaskId)
        )
      )
      .returning({ id: planner_dependencies.id })
    return deleted.length > 0
  })
}

// --- 获取所有依赖 ---
async function getAllDependencies(): Promise<PlannerDependencyRow[]> {
  return withOrm('getAllDependencies', async (db) => {
    return db.select().from(planner_dependencies).orderBy(asc(planner_dependencies.task_id))
  })
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
