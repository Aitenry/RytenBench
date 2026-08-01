import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'

// --- 类型定义 ---

export interface ChatTopicRow {
  id: number
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

// --- chat_topic CRUD ---

async function getAllTopics(): Promise<ChatTopicRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM chat_topic ORDER BY updated_at DESC'
    const result = await db.query<ChatTopicRow>(sql)
    logger.info(`Query for all chat topics returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get all chat topics:', error)
    throw error
  }
}

async function getAllTopicsPaginated(
  page: number,
  pageSize: number
): Promise<PaginatedResult<ChatTopicRow>> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const countResult = await db.query<{ total: number }>(
      'SELECT COUNT(*)::int as total FROM chat_topic'
    )
    const total = countResult.rows[0]?.total ?? 0
    const sql = 'SELECT * FROM chat_topic ORDER BY updated_at DESC LIMIT $1 OFFSET $2'
    const result = await db.query<ChatTopicRow>(sql, [pageSize, page * pageSize])
    logger.info(
      `Paginated topics: page=${page}, size=${pageSize}, got=${result.rows.length}, total=${total}`
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

async function createTopic(title: string, model?: string, selectedTools?: string): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql =
      'INSERT INTO chat_topic (title, model, selected_tools) VALUES ($1, $2, $3) RETURNING id'
    const result = await db.query<{ id: number }>(sql, [
      title,
      model || null,
      selectedTools || null
    ])
    const newId = result.rows[0].id
    logger.info(`Created chat topic with ID: ${newId}, title: ${title}`)
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
    const db = (await getDatabaseInstance()).getDatabase()
    const countResult = await db.query<{ total: number }>(
      'SELECT COUNT(*)::int as total FROM chat_dialogue WHERE topic_id = $1',
      [topicId]
    )
    const total = countResult.rows[0]?.total ?? 0
    // 从最新消息开始分页：DESC 排序，取一页后反转，上层得到 oldest→newest
    const sql =
      'SELECT * FROM chat_dialogue WHERE topic_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3'
    const result = await db.query<ChatDialogueRow>(sql, [topicId, pageSize, page * pageSize])
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
