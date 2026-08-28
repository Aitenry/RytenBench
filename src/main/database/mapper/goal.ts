import { getDatabaseInstance } from '../instance'
import logger from 'electron-log'

// --- 类型定义 ---

export interface GoalRow {
  topic_id: number
  goal_id: string
  revision: number
  objective: string
  phase: 'active' | 'paused' | 'blocked' | 'complete'
  rounds_started: number
  max_goal_rounds: number
  blocked_reason: string | null
  created_at: string
  updated_at: string
}

/** 按话题读取当前目标（无则 null） */
export async function getGoalByTopic(topicId: number): Promise<GoalRow | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<GoalRow>('SELECT * FROM chat_goals WHERE topic_id = $1', [
      topicId
    ])
    return result.rows[0] ?? null
  } catch (error) {
    logger.error('Failed to get goal by topic:', error)
    throw error
  }
}

/**
 * 写入/覆盖目标（每个话题一行）。
 * 返回写入后的行。
 */
export async function upsertGoal(
  row: Omit<GoalRow, 'created_at' | 'updated_at'>
): Promise<GoalRow> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<GoalRow>(
      `INSERT INTO chat_goals
         (topic_id, goal_id, revision, objective, phase, rounds_started, max_goal_rounds, blocked_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (topic_id) DO UPDATE SET
         goal_id = EXCLUDED.goal_id,
         revision = EXCLUDED.revision,
         objective = EXCLUDED.objective,
         phase = EXCLUDED.phase,
         rounds_started = EXCLUDED.rounds_started,
         max_goal_rounds = EXCLUDED.max_goal_rounds,
         blocked_reason = EXCLUDED.blocked_reason,
         updated_at = now()
       RETURNING *`,
      [
        row.topic_id,
        row.goal_id,
        row.revision,
        row.objective,
        row.phase,
        row.rounds_started,
        row.max_goal_rounds,
        row.blocked_reason
      ]
    )
    return result.rows[0]
  } catch (error) {
    logger.error('Failed to upsert goal:', error)
    throw error
  }
}

/** 删除话题的目标（话题删除时级联清理） */
export async function deleteGoalByTopic(topicId: number): Promise<void> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.query('DELETE FROM chat_goals WHERE topic_id = $1', [topicId])
  } catch (error) {
    logger.error('Failed to delete goal by topic:', error)
    throw error
  }
}
