import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import type { PGlite } from '@electric-sql/pglite'
import logger from 'electron-log'

export interface WorkspaceMigrationResult {
  /** 迁移后确定的活动工作区 id；0 表示暂无工作区 */
  activeWorkspaceId: number
  /** 是否新建了默认工作区 */
  createdDefault: boolean
  /** 默认工作区路径（新建时才有值） */
  defaultPath?: string
}

/** 工作区数据表（需要按工作区隔离/回填；计划与歌单为全局数据，不隔离） */
const WORKSPACE_TABLES = ['documents', 'wiki', 'todo_items']

/** 旧版本自动生成的默认工作区路径（Documents 下，用户曾明确不喜欢，识别后回滚） */
function legacyAutoPath(): string {
  return join(app.getPath('documents'), 'RytenBench 工作区')
}

/** 新版默认工作区路径：放在 userData 下，不污染用户文档目录 */
function defaultWorkspacePath(): string {
  return join(app.getPath('userData'), 'workspaces', 'default')
}

/**
 * 工作区数据迁移（启动时执行，幂等）：
 * 1. 回滚旧版本在 Documents 下自动创建的「默认工作区」（无聊天记录时）——内容归回 NULL 后删除；
 * 2. 保证至少一个工作区：为空时自动创建「默认工作区」（userData/workspaces/default），
 *    应用不再因未设置工作区而被拦截；
 * 3. 确定活动工作区：沿用设置里的 activeWorkspaceId（若仍存在），否则取第一个，
 *    并把 workspace_id 为 NULL 的存量数据回填到活动工作区。
 */
export async function migrateWorkspaceData(
  db: PGlite,
  getActiveWorkspaceId: () => number | undefined
): Promise<WorkspaceMigrationResult> {
  let createdDefault = false
  let defaultPath: string | undefined

  // 1. 回滚旧版 Documents 自动路径的默认工作区（精确匹配；已有聊天记录的不动）
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
    logger.info(`[WorkspaceMigration] Reverted legacy auto-created default workspace id=${autoId}`)
  }

  // 2. 保证至少一个工作区：为空时创建默认工作区
  const listResult = await db.query<{ id: number }>(
    'SELECT id FROM workspace ORDER BY created_at ASC, id ASC'
  )
  const workspaces = listResult.rows

  if (workspaces.length === 0) {
    defaultPath = defaultWorkspacePath()
    try {
      if (!existsSync(defaultPath)) mkdirSync(defaultPath, { recursive: true })
    } catch (err) {
      logger.warn('[WorkspaceMigration] Failed to create default workspace dir:', err)
    }
    const created = await db.query<{ id: number }>(
      'INSERT INTO workspace (name, path) VALUES ($1, $2) RETURNING id',
      ['默认工作区', defaultPath]
    )
    workspaces.push({ id: created.rows[0].id })
    createdDefault = true
    logger.info(`[WorkspaceMigration] Created default workspace id=${created.rows[0].id}`)
  }

  // 3. 确定活动工作区
  const storedActive = getActiveWorkspaceId()
  const storedExists = storedActive != null && workspaces.some((w) => w.id === storedActive)
  const activeWorkspaceId = storedExists ? storedActive! : workspaces[0].id

  // 4. 回填存量数据到活动工作区
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

  return { activeWorkspaceId, createdDefault, defaultPath }
}
