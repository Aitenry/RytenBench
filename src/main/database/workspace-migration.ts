import { app } from 'electron'
import { join } from 'path'
import type { PGlite } from '@electric-sql/pglite'
import logger from 'electron-log'

export interface WorkspaceMigrationResult {
  /** 迁移后确定的活动工作区 id；null 表示当前没有任何工作区（等待用户在对话页配置） */
  activeWorkspaceId: number | null
  /** 活动工作区的目录路径（与 id 同步写回设置，避免两者不一致） */
  activeWorkspacePath: string | null
}

/** 旧版本自动生成的默认工作区路径（Documents 下，用户曾明确不喜欢，识别后回滚） */
function legacyAutoPath(): string {
  return join(app.getPath('documents'), 'RytenBench 工作区')
}

/** 旧版本自动生成的默认工作区路径（userData 下，现已改为「不自动创建工作区」） */
function legacyUserDataAutoPath(): string {
  return join(app.getPath('userData'), 'workspaces', 'default')
}

/**
 * 回滚旧版本自动创建的「默认工作区」（幂等）。
 *
 * 应用不再在初始化时自动创建工作区，因此历史上自动生成的那两个默认工作区
 * 需要清掉，让用户回到「未配置工作区」状态，由对话页引导配置。
 * 仅在该工作区**没有任何会话与智能体配置**时删除，避免误删用户真正在用的工作区。
 */
async function revertAutoCreatedWorkspace(db: PGlite, path: string, label: string): Promise<void> {
  const found = await db.query<{ id: number; topics: number; agents: number }>(
    `SELECT w.id,
       (SELECT COUNT(*)::int FROM chat_topic t WHERE t.workspace_id = w.id) AS topics,
       (SELECT COUNT(*)::int FROM agent_config a WHERE a.workspace_id = w.id) AS agents
     FROM workspace w
     WHERE w.name = '默认工作区' AND w.path = $1
     ORDER BY w.id ASC
     LIMIT 1`,
    [path]
  )
  const row = found.rows[0]
  if (!row) return
  if (row.topics > 0 || row.agents > 0) {
    logger.info(
      `[WorkspaceMigration] Keep ${label} default workspace id=${row.id} (topics=${row.topics}, agents=${row.agents})`
    )
    return
  }
  await db.query('DELETE FROM workspace WHERE id = $1', [row.id])
  logger.info(`[WorkspaceMigration] Reverted ${label} auto-created default workspace id=${row.id}`)
}

/**
 * 工作区数据迁移（启动时执行，幂等）：
 * 1. 回滚旧版本自动创建的「默认工作区」（Documents 路径与 userData 路径各一次，
 *    仅当其没有会话与智能体配置时）；
 * 2. 确定活动工作区：沿用设置里的 activeWorkspaceId（若仍存在），否则取第一个；
 *    一个工作区都没有时返回 null —— 应用不再自动创建，由对话页的引导让用户选择目录。
 *
 * 注意：文档 / 知识库 / 待办已是全局数据（无 workspace_id 列），不参与任何回填或归属处理。
 */
export async function migrateWorkspaceData(
  db: PGlite,
  getActiveWorkspaceId: () => number | undefined
): Promise<WorkspaceMigrationResult> {
  await revertAutoCreatedWorkspace(db, legacyAutoPath(), 'legacy-documents')
  await revertAutoCreatedWorkspace(db, legacyUserDataAutoPath(), 'legacy-userData')

  // 确定活动工作区（不创建）
  const listResult = await db.query<{ id: number; path: string }>(
    'SELECT id, path FROM workspace ORDER BY created_at ASC, id ASC'
  )
  const workspaces = listResult.rows
  if (workspaces.length === 0) {
    logger.info('[WorkspaceMigration] No workspace configured — waiting for user setup')
    return { activeWorkspaceId: null, activeWorkspacePath: null }
  }

  const storedActive = getActiveWorkspaceId()
  const stored = workspaces.find((w) => w.id === storedActive) ?? workspaces[0]
  return { activeWorkspaceId: stored.id, activeWorkspacePath: stored.path }
}
