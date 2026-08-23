import { getDatabaseInstance } from '../instance'
import type { SubAgentConfig } from '../../chat/types'
import logger from 'electron-log'

// --- 类型定义 ---

export interface AgentConfigRow {
  id: number
  workspace_id: number
  name: string
  rename: string | null
  prompt: string | null
  description: string | null
  skills: string | null
  model: string | null
  tools: string | null
  enable: boolean
  created_at: string
  updated_at: string
}

export interface PaginatedResult<T> {
  items: T[]
  hasMore: boolean
  total: number
}

export interface AgentConfigInput {
  workspace_id: number
  name: string
  rename?: string | null
  prompt?: string | null
  description?: string | null
  skills?: string[] | null
  model?: string | null
  tools?: string[] | null
  enable?: boolean
}

// --- 内部工具 ---

function rowToSubAgentConfig(row: AgentConfigRow): SubAgentConfig {
  return {
    name: row.name,
    ...(row.rename ? { rename: row.rename } : {}),
    description: row.description ?? '',
    systemPrompt: row.prompt ?? '',
    tools: row.tools ? JSON.parse(row.tools) : [],
    ...(row.model ? { model: row.model } : {}),
    ...(row.skills ? { skills: JSON.parse(row.skills) as string[] } : {})
  }
}

// --- CRUD ---

/** 获取指定工作区下所有代理配置 */
async function getAllAgents(workspaceId: number): Promise<AgentConfigRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM agent_config WHERE workspace_id = $1 ORDER BY id ASC'
    const result = await db.query<AgentConfigRow>(sql, [workspaceId])
    logger.info(
      `Query for all agents (workspace=${workspaceId}) returned ${result.rows.length} rows.`
    )
    return result.rows
  } catch (error) {
    logger.error('Failed to get all agents:', error)
    throw error
  }
}

/** 分页获取指定工作区下代理配置 */
async function getAgentsPaginated(
  workspaceId: number,
  page: number,
  pageSize: number
): Promise<PaginatedResult<AgentConfigRow>> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const countResult = await db.query<{ total: number }>(
      'SELECT COUNT(*)::int as total FROM agent_config WHERE workspace_id = $1',
      [workspaceId]
    )
    const total = countResult.rows[0]?.total ?? 0
    const sql =
      'SELECT * FROM agent_config WHERE workspace_id = $1 ORDER BY id ASC LIMIT $2 OFFSET $3'
    const offset = page * pageSize
    const result = await db.query<AgentConfigRow>(sql, [workspaceId, pageSize, offset])
    logger.info(
      `Paginated agents: workspace=${workspaceId}, page=${page}, size=${pageSize}, got=${result.rows.length}, total=${total}`
    )
    return {
      items: result.rows,
      hasMore: (page + 1) * pageSize < total,
      total
    }
  } catch (error) {
    logger.error('Failed to get paginated agents:', error)
    throw error
  }
}

/** 获取指定工作区下所有已启用的代理（转换为 SubAgentConfig 供 ChatService 使用） */
async function getEnabledSubAgentConfigs(workspaceId: number): Promise<SubAgentConfig[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql =
      'SELECT * FROM agent_config WHERE workspace_id = $1 AND enable = TRUE ORDER BY id ASC'
    const result = await db.query<AgentConfigRow>(sql, [workspaceId])
    logger.info(
      `Query for enabled agents (workspace=${workspaceId}) returned ${result.rows.length} rows.`
    )
    return result.rows.map(rowToSubAgentConfig)
  } catch (error) {
    logger.error('Failed to get enabled sub-agent configs:', error)
    throw error
  }
}

/** 根据 ID 获取代理（同时校验 workspace_id） */
async function getAgentById(workspaceId: number, id: number): Promise<AgentConfigRow | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM agent_config WHERE workspace_id = $1 AND id = $2'
    const result = await db.query<AgentConfigRow>(sql, [workspaceId, id])
    if (result.rows.length === 0) return null
    return result.rows[0]
  } catch (error) {
    logger.error('Failed to get agent by id:', error)
    throw error
  }
}

/** 创建代理 */
async function createAgent(input: AgentConfigInput): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const tools = input.tools && input.tools.length > 0 ? JSON.stringify(input.tools) : null
    const skills = input.skills && input.skills.length > 0 ? JSON.stringify(input.skills) : null

    const sql = `
      INSERT INTO agent_config (workspace_id, name, rename, prompt, description, skills, model, tools, enable)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `
    const result = await db.query<{ id: number }>(sql, [
      input.workspace_id,
      input.name,
      input.rename || null,
      input.prompt || null,
      input.description || null,
      skills,
      input.model || null,
      tools,
      input.enable ?? true
    ])

    const newId = result.rows[0].id
    logger.info(`Created agent "${input.name}" (workspace=${input.workspace_id}) with ID: ${newId}`)
    return newId
  } catch (error) {
    logger.error('Failed to create agent:', error)
    throw error
  }
}

/** 更新代理（同时校验 workspace_id） */
async function updateAgent(
  workspaceId: number,
  id: number,
  updates: Partial<AgentConfigInput>
): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    const updateFields: string[] = []
    const updateValues: (string | number | boolean | null)[] = []
    let paramIndex = 1

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`)
      updateValues.push(updates.name)
    }
    if (updates.rename !== undefined) {
      updateFields.push(`rename = $${paramIndex++}`)
      updateValues.push(updates.rename)
    }
    if (updates.prompt !== undefined) {
      updateFields.push(`prompt = $${paramIndex++}`)
      updateValues.push(updates.prompt)
    }
    if (updates.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`)
      updateValues.push(updates.description)
    }
    if (updates.skills !== undefined) {
      const skills =
        updates.skills && updates.skills.length > 0 ? JSON.stringify(updates.skills) : null
      updateFields.push(`skills = $${paramIndex++}`)
      updateValues.push(skills)
    }
    if (updates.model !== undefined) {
      updateFields.push(`model = $${paramIndex++}`)
      updateValues.push(updates.model)
    }
    if (updates.tools !== undefined) {
      const tools = updates.tools && updates.tools.length > 0 ? JSON.stringify(updates.tools) : null
      updateFields.push(`tools = $${paramIndex++}`)
      updateValues.push(tools)
    }
    if (updates.enable !== undefined) {
      updateFields.push(`enable = $${paramIndex++}`)
      updateValues.push(updates.enable)
    }

    if (updateFields.length === 0) {
      logger.warn('No fields to update for agent:', id)
      return false
    }

    updateFields.push('updated_at = NOW()')
    const sql = `UPDATE agent_config SET ${updateFields.join(', ')} WHERE workspace_id = $${paramIndex++} AND id = $${paramIndex++}`
    updateValues.push(workspaceId, id)

    const result = await db.query(sql, updateValues)
    const changes = result.affectedRows ?? 0
    logger.info(`Updated agent workspace=${workspaceId} id=${id}, ${changes} row(s) affected.`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to update agent:', error)
    throw error
  }
}

/** 删除代理（同时校验 workspace_id） */
async function deleteAgent(workspaceId: number, id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM agent_config WHERE workspace_id = $1 AND id = $2'
    const result = await db.query(sql, [workspaceId, id])
    const changes = result.affectedRows ?? 0
    logger.info(`Deleted agent workspace=${workspaceId} id=${id}, ${changes} row(s) affected.`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to delete agent:', error)
    throw error
  }
}

export type { SubAgentConfig }

export {
  getAllAgents,
  getAgentsPaginated,
  getEnabledSubAgentConfigs,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent
}
