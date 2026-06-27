import { getDatabaseInstance } from '../../index'
import { encryptApiKey, decryptApiKey } from '../../crypto/provider-key'
import logger from 'electron-log'

// --- 类型定义 ---

/** 数据库原始行 */
export interface LlmProviderRow {
  id: number
  name: string
  provider: string
  base_url: string | null
  api_key_encrypted: string | null
  model: string
  temperature: number
  max_tokens: number | null
  extra_config: string | null
  is_default: boolean
  is_enabled: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/** 解密后的供应商配置（API调用方使用） */
export interface LlmProviderConfig {
  id: number
  name: string
  provider: string
  base_url: string | null
  api_key: string | null
  model: string
  temperature: number
  max_tokens: number | null
  extra_config: Record<string, unknown> | null
  is_default: boolean
  is_enabled: boolean
  sort_order: number
}

/** 创建/更新时的输入（不含自动生成的字段） */
export interface LlmProviderInput {
  name: string
  provider: string
  base_url?: string | null
  api_key?: string | null // 明文输入，mapper内部加密
  model: string
  temperature?: number
  max_tokens?: number | null
  extra_config?: Record<string, unknown> | null
  is_default?: boolean
  is_enabled?: boolean
  sort_order?: number
}

// --- 内部工具 ---

function rowToConfig(row: LlmProviderRow): LlmProviderConfig {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    base_url: row.base_url,
    api_key: row.api_key_encrypted ? decryptApiKey(row.api_key_encrypted) : null,
    model: row.model,
    temperature: row.temperature,
    max_tokens: row.max_tokens,
    extra_config: row.extra_config ? JSON.parse(row.extra_config) : null,
    is_default: row.is_default,
    is_enabled: row.is_enabled,
    sort_order: row.sort_order
  }
}

// --- CRUD ---

/**
 * 获取所有供应商（按 sort_order, id 排序），返回解密后的配置
 */
async function getAllProviders(): Promise<LlmProviderConfig[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM llm_providers ORDER BY sort_order ASC, id ASC'
    const result = await db.query<LlmProviderRow>(sql)
    logger.info(`Query for all providers returned ${result.rows.length} rows.`)
    return result.rows.map(rowToConfig)
  } catch (error) {
    logger.error('Failed to get all providers:', error)
    throw error
  }
}

/**
 * 根据 ID 获取供应商
 */
async function getProviderById(id: number): Promise<LlmProviderConfig | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM llm_providers WHERE id = $1'
    const result = await db.query<LlmProviderRow>(sql, [id])
    if (result.rows.length === 0) return null
    return rowToConfig(result.rows[0])
  } catch (error) {
    logger.error('Failed to get provider by id:', error)
    throw error
  }
}

/**
 * 获取默认供应商（已启用的）
 */
async function getDefaultProvider(): Promise<LlmProviderConfig | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM llm_providers WHERE is_default = TRUE AND is_enabled = TRUE LIMIT 1'
    const result = await db.query<LlmProviderRow>(sql)
    if (result.rows.length === 0) {
      // 回退：取第一个已启用的
      const fallback = await db.query<LlmProviderRow>(
        'SELECT * FROM llm_providers WHERE is_enabled = TRUE ORDER BY sort_order ASC, id ASC LIMIT 1'
      )
      if (fallback.rows.length === 0) return null
      return rowToConfig(fallback.rows[0])
    }
    return rowToConfig(result.rows[0])
  } catch (error) {
    logger.error('Failed to get default provider:', error)
    throw error
  }
}

/**
 * 获取所有已启用的供应商
 */
async function getEnabledProviders(): Promise<LlmProviderConfig[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql =
      'SELECT * FROM llm_providers WHERE is_enabled = TRUE ORDER BY sort_order ASC, id ASC'
    const result = await db.query<LlmProviderRow>(sql)
    return result.rows.map(rowToConfig)
  } catch (error) {
    logger.error('Failed to get enabled providers:', error)
    throw error
  }
}

/**
 * 创建供应商
 */
async function createProvider(input: LlmProviderInput): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    // 如果设为默认，先取消其他默认
    if (input.is_default) {
      await db.query('UPDATE llm_providers SET is_default = FALSE WHERE is_default = TRUE')
    }

    const encryptedKey = input.api_key ? encryptApiKey(input.api_key) : null
    const extraConfig = input.extra_config ? JSON.stringify(input.extra_config) : null

    const sql = `
      INSERT INTO llm_providers
        (name, provider, base_url, api_key_encrypted, model, temperature,
         max_tokens, extra_config, is_default, is_enabled, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `
    const result = await db.query<{ id: number }>(sql, [
      input.name,
      input.provider,
      input.base_url || null,
      encryptedKey,
      input.model,
      input.temperature ?? 0.7,
      input.max_tokens || null,
      extraConfig,
      input.is_default ?? false,
      input.is_enabled ?? true,
      input.sort_order ?? 0
    ])

    const newId = result.rows[0].id
    logger.info(`Created provider "${input.name}" with ID: ${newId}`)
    return newId
  } catch (error) {
    logger.error('Failed to create provider:', error)
    throw error
  }
}

/**
 * 更新供应商
 */
async function updateProvider(id: number, updates: Partial<LlmProviderInput>): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    const updateFields: string[] = []
    const updateValues: (string | number | boolean | null)[] = []
    let paramIndex = 1

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`)
      updateValues.push(updates.name)
    }
    if (updates.provider !== undefined) {
      updateFields.push(`provider = $${paramIndex++}`)
      updateValues.push(updates.provider)
    }
    if (updates.base_url !== undefined) {
      updateFields.push(`base_url = $${paramIndex++}`)
      updateValues.push(updates.base_url)
    }
    if (updates.api_key !== undefined) {
      // 空字符串视为删除key
      const encryptedKey = updates.api_key ? encryptApiKey(updates.api_key) : null
      updateFields.push(`api_key_encrypted = $${paramIndex++}`)
      updateValues.push(encryptedKey)
    }
    if (updates.model !== undefined) {
      updateFields.push(`model = $${paramIndex++}`)
      updateValues.push(updates.model)
    }
    if (updates.temperature !== undefined) {
      updateFields.push(`temperature = $${paramIndex++}`)
      updateValues.push(updates.temperature)
    }
    if (updates.max_tokens !== undefined) {
      updateFields.push(`max_tokens = $${paramIndex++}`)
      updateValues.push(updates.max_tokens)
    }
    if (updates.extra_config !== undefined) {
      const extraConfig = updates.extra_config ? JSON.stringify(updates.extra_config) : null
      updateFields.push(`extra_config = $${paramIndex++}`)
      updateValues.push(extraConfig)
    }
    if (updates.is_default !== undefined) {
      if (updates.is_default) {
        await db.query('UPDATE llm_providers SET is_default = FALSE WHERE is_default = TRUE')
      }
      updateFields.push(`is_default = $${paramIndex++}`)
      updateValues.push(updates.is_default)
    }
    if (updates.is_enabled !== undefined) {
      updateFields.push(`is_enabled = $${paramIndex++}`)
      updateValues.push(updates.is_enabled)
    }
    if (updates.sort_order !== undefined) {
      updateFields.push(`sort_order = $${paramIndex++}`)
      updateValues.push(updates.sort_order)
    }

    if (updateFields.length === 0) {
      logger.warn('No fields to update for provider:', id)
      return false
    }

    updateFields.push('updated_at = NOW()')
    const sql = `UPDATE llm_providers SET ${updateFields.join(', ')} WHERE id = $${paramIndex++}`
    updateValues.push(id)

    const result = await db.query(sql, updateValues)
    const changes = result.affectedRows ?? 0
    logger.info(`Updated provider ID=${id}, ${changes} row(s) affected.`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to update provider:', error)
    throw error
  }
}

/**
 * 删除供应商
 */
async function deleteProvider(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM llm_providers WHERE id = $1'
    const result = await db.query(sql, [id])
    const changes = result.affectedRows ?? 0
    logger.info(`Deleted provider ID=${id}, ${changes} row(s) affected.`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to delete provider:', error)
    throw error
  }
}

/**
 * 设置默认供应商
 */
async function setDefaultProvider(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.query('UPDATE llm_providers SET is_default = FALSE WHERE is_default = TRUE')
    const result = await db.query(
      'UPDATE llm_providers SET is_default = TRUE, updated_at = NOW() WHERE id = $1',
      [id]
    )
    const changes = result.affectedRows ?? 0
    logger.info(`Set provider ID=${id} as default, ${changes} row(s) affected.`)
    return changes > 0
  } catch (error) {
    logger.error('Failed to set default provider:', error)
    throw error
  }
}

export {
  getAllProviders,
  getProviderById,
  getDefaultProvider,
  getEnabledProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  setDefaultProvider
}
