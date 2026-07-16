import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'

export interface NodePosition {
  node_id: string
  x: number
  y: number
  updated_at: string
}

// --- 获取所有节点位置 ---
async function getAllNodePositions(): Promise<NodePosition[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM node_positions'
    const result = await db.query<NodePosition>(sql)
    logger.info(`Query for all node positions returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get all node positions:', error)
    throw error
  }
}

// --- 保存单个节点位置（upsert） ---
async function saveNodePosition(nodeId: string, x: number, y: number): Promise<void> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = `
      INSERT INTO node_positions (node_id, x, y, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (node_id)
      DO UPDATE SET x = $2, y = $3, updated_at = NOW()
    `
    await db.query(sql, [nodeId, x, y])
    logger.info(`Saved node position: ${nodeId} -> (${x}, ${y})`)
  } catch (error) {
    logger.error('Failed to save node position:', error)
    throw error
  }
}

// --- 批量保存节点位置 ---
async function saveNodePositions(
  positions: { node_id: string; x: number; y: number }[]
): Promise<void> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    for (const pos of positions) {
      const sql = `
        INSERT INTO node_positions (node_id, x, y, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (node_id)
        DO UPDATE SET x = $2, y = $3, updated_at = NOW()
      `
      await db.query(sql, [pos.node_id, pos.x, pos.y])
    }
    logger.info(`Batch saved ${positions.length} node positions.`)
  } catch (error) {
    logger.error('Failed to batch save node positions:', error)
    throw error
  }
}

// --- 删除单个节点位置 ---
async function deleteNodePosition(nodeId: string): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM node_positions WHERE node_id = $1'
    const result = await db.query(sql, [nodeId])
    const changes = result.affectedRows ?? 0
    if (changes > 0) {
      logger.info(`Deleted node position: ${nodeId}`)
      return true
    }
    return false
  } catch (error) {
    logger.error('Failed to delete node position:', error)
    throw error
  }
}

export { getAllNodePositions, saveNodePosition, saveNodePositions, deleteNodePosition }
