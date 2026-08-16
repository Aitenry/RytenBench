import { app } from 'electron'
import { join } from 'path'
import type { PGlite } from '@electric-sql/pglite'
import logger from 'electron-log'

export interface WorkspaceMigrationResult {
  /** 迁移后确定的活动工作区 id；0 表示暂无工作区 */
  activeWorkspaceId: number
}

/** 工作区数据表（需要按工作区隔离/回填） */
const WORKSPACE_TABLES = ['documents', 'wiki', 'todo_items', 'planner_tasks', 'music_folders']

/** 旧版本自动生成的默认工作区路径（用于识别并回滚，路径选择应交还用户） */
function legacyAutoPath(): string {
  return join(app.getPath('documents'), 'RytenBench 工作区')
}

/**
 * 工作区数据迁移（启动时执行，幂等）：
 * 1. 回滚旧版本自动创建的「默认工作区」（无聊天记录时）——内容归回 NULL 后删除，
 *    工作区路径必须由用户通过标题栏/引导页自选文件夹；
 * 2. 已有工作区时：沿用设置里的 activeWorkspaceId（若仍存在），否则取第一个，
 *    并把 workspace_id 为 NULL 的存量数据回填到活动工作区；
 * 3. 没有任何工作区时不自动创建、不设定路径，返回 0，等用户自建（新建首个工作区时
 *    由 createWorkspace 承接 NULL 存量数据）。
 */
export async function migrateWorkspaceData(
  db: PGlite,
  getActiveWorkspaceId: () => number | undefined
): Promise<WorkspaceMigrationResult> {
  // 1. 回滚自动创建的默认工作区（精确匹配：名称 + 旧版固定路径；已有聊天记录的不动）
  const autoResult = await db.query<{ id: number; topics: number }>(
    `SELECT w.id,
       (SELECT COUNT(*)::int FROM chat_topic t WHERE t.workspace_id = w.id) AS topics
     FROM workspace w
     WHERE w.name = '默认工作区' AND w.path = $1
     ORDER BY w.id ASC
     LIMIT 1`,
    [legacyAutoPath()]
  )
  if (autoResult.rows.length > 0 && autoResult.rows[0].topics === 0) {
    const autoId = autoResult.rows[0].id
    for (const table of WORKSPACE_TABLES) {
      await db.query(`UPDATE ${table} SET workspace_id = NULL WHERE workspace_id = $1`, [autoId])
    }
    await db.query('DELETE FROM workspace WHERE id = $1', [autoId])
    logger.info(`[WorkspaceMigration] Reverted auto-created default workspace id=${autoId}`)
  }

  // 2. 确定活动工作区
  const listResult = await db.query<{ id: number }>(
    'SELECT id FROM workspace ORDER BY created_at ASC, id ASC'
  )
  const workspaces = listResult.rows

  if (workspaces.length === 0) {
    return { activeWorkspaceId: 0 }
  }

  const storedActive = getActiveWorkspaceId()
  const storedExists = storedActive != null && workspaces.some((w) => w.id === storedActive)
  const activeWorkspaceId = storedExists ? storedActive! : workspaces[0].id

  // 3. 回填存量数据到活动工作区
  for (const table of WORKSPACE_TABLES) {
    const result = await db.query(
      `UPDATE ${table} SET workspace_id = $1 WHERE workspace_id IS NULL`,
      [activeWorkspaceId]
    )
    const count = result.affectedRows ?? 0
    if (count > 0) {
      logger.info(
        `[WorkspaceMigration] Backfilled ${count} rows of ${table} to workspace ${activeWorkspaceId}`
      )
    }
  }

  return { activeWorkspaceId }
}
