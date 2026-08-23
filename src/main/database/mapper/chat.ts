import { getDatabaseInstance } from '../instance'
import logger from 'electron-log'

// --- 类型定义 ---

export interface WorkspaceRow {
  id: number
  name: string
  path: string
  created_at: string
  updated_at: string
}

export interface ChatTopicRow {
  id: number
  workspace_id: number
  title: string
  model: string | null
  selected_tools: string | null
  created_at: string
  updated_at: string
}

export interface ChatDialogueRow {
  id: number
  topic_id: number
  role: 'user' | 'assistant'
  content: string
  blocks: string | null
  created_at: string
}

export interface PaginatedResult<T> {
  items: T[]
  hasMore: boolean
  total: number
}

// --- workspace CRUD ---

async function getAllWorkspaces(): Promise<WorkspaceRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM workspace ORDER BY created_at ASC'
    const result = await db.query<WorkspaceRow>(sql)
    logger.info(`Query for all workspaces returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get all workspaces:', error)
    throw error
  }
}

async function createWorkspace(name: string, path: string): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'INSERT INTO workspace (name, path) VALUES ($1, $2) RETURNING id'
    const result = await db.query<{ id: number }>(sql, [name, path])
    const newId = result.rows[0].id
    logger.info(`Created workspace ID=${newId}, name="${name}", path="${path}"`)
    // 首个工作区承接历史存量数据（workspace_id 为 NULL 的旧数据归入其中；计划与歌单为全局数据不参与）
    const tables = ['documents', 'wiki', 'todo_items']
    for (const table of tables) {
      const backfill = await db.query(
        `UPDATE ${table} SET workspace_id = $1 WHERE workspace_id IS NULL`,
        [newId]
      )
      const count = backfill.affectedRows ?? 0
      if (count > 0) {
        logger.info(`Backfilled ${count} rows of ${table} to new workspace ${newId}`)
      }
    }
    return newId
  } catch (error) {
    logger.error('Failed to create workspace:', error)
    throw error
  }
}

async function updateWorkspace(id: number, updates: { name: string }): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query(
      'UPDATE workspace SET name = $1, updated_at = NOW() WHERE id = $2',
      [updates.name, id]
    )
    const changes = result.affectedRows ?? 0
    logger.info(`Updated workspace ID=${id} name="${updates.name}", ${changes} row(s) affected.`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to update workspace:', error)
    throw error
  }
}

async function deleteWorkspace(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.transaction(async (tx) => {
      // 保证至少保留一个工作区：只剩一个时禁止删除
      const countResult = await tx.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM workspace')
      if (Number(countResult.rows[0]?.n) <= 1) {
        throw new Error('至少需要保留一个工作区')
      }
      // 级联清理该工作区的内容（顺序满足外键依赖）：
      // 文档（级联删除内容与目录关联）→ 知识库（级联删除目录、目录关联、图谱）→ 待办（级联删除依赖）
      // 计划与歌单为全局数据，不属于任一工作区，不随工作区删除
      await tx.query('DELETE FROM documents WHERE workspace_id = $1', [id])
      await tx.query('DELETE FROM wiki WHERE workspace_id = $1', [id])
      await tx.query('DELETE FROM todo_items WHERE workspace_id = $1', [id])
      // 聊天话题与子代理配置有外键级联，删除工作区行即可
      const result = await tx.query('DELETE FROM workspace WHERE id = $1', [id])
      const changes = result.affectedRows ?? 0
      logger.info(`Deleted workspace ID=${id}, ${changes} row(s) affected.`)
    })
    return true
  } catch (error) {
    logger.error('Failed to delete workspace:', error)
    throw error
  }
}

// --- chat_topic CRUD ---

async function getAllTopics(workspaceId: number): Promise<ChatTopicRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM chat_topic WHERE workspace_id = $1 ORDER BY updated_at DESC'
    const result = await db.query<ChatTopicRow>(sql, [workspaceId])
    logger.info(
      `Query for chat topics in workspace=${workspaceId} returned ${result.rows.length} rows.`
    )
    return result.rows
  } catch (error) {
    logger.error('Failed to get all chat topics:', error)
    throw error
  }
}

async function getAllTopicsPaginated(
  workspaceId: number,
  page: number,
  pageSize: number
): Promise<PaginatedResult<ChatTopicRow>> {
  try {
    const safePage = Number.isFinite(page) ? Math.floor(page) : 0
    const safePageSize = Number.isFinite(pageSize) ? Math.floor(pageSize) : 20
    const safeWorkspaceId = Number.isFinite(workspaceId) ? Math.floor(workspaceId) : 0

    const db = (await getDatabaseInstance()).getDatabase()
    const countResult = await db.query<{ total: number }>(
      'SELECT COUNT(*)::int as total FROM chat_topic WHERE workspace_id = $1',
      [safeWorkspaceId]
    )
    const total = countResult.rows[0]?.total ?? 0
    const sql =
      'SELECT * FROM chat_topic WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3'
    const result = await db.query<ChatTopicRow>(sql, [
      safeWorkspaceId,
      safePageSize,
      safePage * safePageSize
    ])
    logger.info(
      `Paginated topics: workspace=${workspaceId}, page=${page}, size=${pageSize}, got=${result.rows.length}, total=${total}`
    )
    return {
      items: result.rows,
      hasMore: (page + 1) * pageSize < total,
      total
    }
  } catch (error) {
    logger.error('Failed to get paginated chat topics:', error)
    throw error
  }
}

async function getTopicById(id: number): Promise<ChatTopicRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM chat_topic WHERE id = $1'
    const result = await db.query<ChatTopicRow>(sql, [id])
    return result.rows
  } catch (error) {
    logger.error('Failed to get chat topic by id:', error)
    throw error
  }
}

async function createTopic(
  workspaceId: number,
  title: string,
  model?: string,
  selectedTools?: string
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql =
      'INSERT INTO chat_topic (workspace_id, title, model, selected_tools) VALUES ($1, $2, $3, $4) RETURNING id'
    const result = await db.query<{ id: number }>(sql, [
      workspaceId,
      title,
      model || null,
      selectedTools || null
    ])
    const newId = result.rows[0].id
    logger.info(`Created chat topic ID=${newId} in workspace=${workspaceId}, title: ${title}`)
    return newId
  } catch (error) {
    logger.error('Failed to create chat topic:', error)
    throw error
  }
}

async function updateTopic(
  id: number,
  updates: Partial<Pick<ChatTopicRow, 'title' | 'model' | 'selected_tools'>>
): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const updateFields: string[] = []
    const updateValues: (string | number | null)[] = []
    let paramIndex = 1

    if (updates.title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`)
      updateValues.push(updates.title)
    }
    if (updates.model !== undefined) {
      updateFields.push(`model = $${paramIndex++}`)
      updateValues.push(updates.model)
    }
    if (updates.selected_tools !== undefined) {
      updateFields.push(`selected_tools = $${paramIndex++}`)
      updateValues.push(updates.selected_tools)
    }

    if (updateFields.length === 0) {
      logger.warn('No fields to update for chat topic:', id)
      return false
    }

    updateFields.push('updated_at = NOW()')
    const sql = `UPDATE chat_topic SET ${updateFields.join(', ')} WHERE id = $${paramIndex++}`
    updateValues.push(id)

    const result = await db.query(sql, updateValues)
    const changes = result.affectedRows ?? 0
    logger.info(`Updated chat topic ID=${id}, ${changes} row(s) affected.`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to update chat topic:', error)
    throw error
  }
}

async function deleteTopic(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM chat_topic WHERE id = $1'
    const result = await db.query(sql, [id])
    const changes = result.affectedRows ?? 0
    logger.info(`Deleted chat topic ID=${id}, ${changes} row(s) affected.`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to delete chat topic:', error)
    throw error
  }
}

// --- chat_dialogue CRUD ---

async function getDialoguesByTopicId(topicId: number): Promise<ChatDialogueRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM chat_dialogue WHERE topic_id = $1 ORDER BY created_at ASC'
    const result = await db.query<ChatDialogueRow>(sql, [topicId])
    logger.info(`Query dialogues for topic=${topicId} returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get dialogues by topic id:', error)
    throw error
  }
}

async function getDialoguesByTopicIdPaginated(
  topicId: number,
  page: number,
  pageSize: number
): Promise<PaginatedResult<ChatDialogueRow>> {
  try {
    const safePage = Number.isFinite(page) ? Math.floor(page) : 0
    const safePageSize = Number.isFinite(pageSize) ? Math.floor(pageSize) : 20
    const safeTopicId = Number.isFinite(topicId) ? Math.floor(topicId) : 0

    const db = (await getDatabaseInstance()).getDatabase()
    const countResult = await db.query<{ total: number }>(
      'SELECT COUNT(*)::int as total FROM chat_dialogue WHERE topic_id = $1',
      [safeTopicId]
    )
    const total = countResult.rows[0]?.total ?? 0
    // 从最新消息开始分页：DESC 排序，取一页后反转，上层得到 oldest→newest
    const sql =
      'SELECT * FROM chat_dialogue WHERE topic_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3'
    const result = await db.query<ChatDialogueRow>(sql, [
      safeTopicId,
      safePageSize,
      safePage * safePageSize
    ])
    const items = result.rows.reverse()
    logger.info(
      `Paginated dialogues: topic=${topicId}, page=${page}, size=${pageSize}, got=${items.length}, total=${total}`
    )
    return { items, hasMore: (page + 1) * pageSize < total, total }
  } catch (error) {
    logger.error('Failed to get paginated dialogues by topic id:', error)
    throw error
  }
}

async function addDialogue(dialogue: Omit<ChatDialogueRow, 'id' | 'created_at'>): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const { topic_id, role, content, blocks } = dialogue
    const sql =
      'INSERT INTO chat_dialogue (topic_id, role, content, blocks) VALUES ($1, $2, $3, $4) RETURNING id'
    const result = await db.query<{ id: number }>(sql, [topic_id, role, content, blocks || null])
    const newId = result.rows[0].id
    logger.info(`Added dialogue ID=${newId} to topic=${topic_id}`)
    return newId
  } catch (error) {
    logger.error('Failed to add dialogue:', error)
    throw error
  }
}

async function deleteDialoguesByTopicId(topicId: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM chat_dialogue WHERE topic_id = $1'
    const result = await db.query(sql, [topicId])
    const changes = result.affectedRows ?? 0
    logger.info(`Deleted ${changes} dialogues for topic=${topicId}`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to delete dialogues by topic id:', error)
    throw error
  }
}

async function deleteDialogueById(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM chat_dialogue WHERE id = $1'
    const result = await db.query(sql, [id])
    const changes = result.affectedRows ?? 0
    logger.info(`Deleted dialogue ID=${id}, ${changes} row(s) affected.`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to delete dialogue by id:', error)
    throw error
  }
}

export {
  getAllWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getAllTopics,
  getAllTopicsPaginated,
  getTopicById,
  createTopic,
  updateTopic,
  deleteTopic,
  getDialoguesByTopicId,
  getDialoguesByTopicIdPaginated,
  addDialogue,
  deleteDialoguesByTopicId,
  deleteDialogueById
}
