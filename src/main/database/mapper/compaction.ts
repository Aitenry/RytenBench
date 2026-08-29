import { getDatabaseInstance } from '../instance'
import logger from 'electron-log'

// --- 类型定义 ---

export interface CompactionRow {
  topic_id: number
  /** 已摘要段最末对话记录 id（压缩边界） */
  boundary_id: number
  /** checkpoint 摘要（LLM 输出） */
  summary: string
  created_at: string
  updated_at: string
}

/** 读取话题的压缩 checkpoint（无则 null） */
export async function getCompactionByTopic(topicId: number): Promise<CompactionRow | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<CompactionRow>(
      'SELECT * FROM topic_compactions WHERE topic_id = $1',
      [topicId]
    )
    return result.rows[0] ?? null
  } catch (error) {
    logger.error('Failed to get compaction by topic:', error)
    throw error
  }
}

/** 写入/覆盖话题的压缩 checkpoint（每个话题一行） */
export async function upsertCompaction(row: {
  topic_id: number
  boundary_id: number
  summary: string
}): Promise<CompactionRow> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<CompactionRow>(
      `INSERT INTO topic_compactions (topic_id, boundary_id, summary)
       VALUES ($1, $2, $3)
       ON CONFLICT (topic_id) DO UPDATE SET
         boundary_id = EXCLUDED.boundary_id,
         summary = EXCLUDED.summary,
         updated_at = now()
       RETURNING *`,
      [row.topic_id, row.boundary_id, row.summary]
    )
    return result.rows[0]
  } catch (error) {
    logger.error('Failed to upsert compaction:', error)
    throw error
  }
}

/** 删除话题的压缩 checkpoint（话题删除时清理） */
export async function deleteCompactionByTopic(topicId: number): Promise<void> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.query('DELETE FROM topic_compactions WHERE topic_id = $1', [topicId])
  } catch (error) {
    logger.error('Failed to delete compaction by topic:', error)
    throw error
  }
}
