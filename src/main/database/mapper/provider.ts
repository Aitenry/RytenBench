import { and, asc, eq, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import logger from 'electron-log'
import { encryptApiKey, decryptApiKey } from '../../crypto/provider-key'
import { withOrm } from '../orm'
import { llm_providers } from '../schema'

// --- 类型定义 ---

/** 数据库原始行（字段由 schema 推导） */
export type LlmProviderRow = typeof llm_providers.$inferSelect

/** 供应商配置（api_key 仅运行时路径解密；列表视图恒为 null，密钥不发送到渲染进程） */
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
  metadata: Record<string, unknown> | null
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
  metadata?: Record<string, unknown> | null
  is_default?: boolean
  is_enabled?: boolean
  sort_order?: number
}

// --- 内部工具 ---

/**
 * 按行组装配置。includeKey=false 时 api_key 恒为 null（列表/前端只读场景，
 * 解密后的密钥绝不离开主进程）；运行时取数路径（getProviderById、
 * getEnabledProviders、getDefaultProvider）必须传 true 供拉取调用使用。
 *
 * 库列可空，缺值时按建表默认值补齐（temperature 0.7 / is_default false / is_enabled true / sort_order 0）。
 */
function rowToConfig(row: LlmProviderRow, includeKey = true): LlmProviderConfig {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    base_url: row.base_url,
    api_key: includeKey && row.api_key_encrypted ? decryptApiKey(row.api_key_encrypted) : null,
    model: row.model,
    temperature: row.temperature ?? 0.7,
    max_tokens: row.max_tokens,
    extra_config: row.extra_config ? JSON.parse(row.extra_config) : null,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    is_default: row.is_default ?? false,
    is_enabled: row.is_enabled ?? true,
    sort_order: row.sort_order ?? 0
  }
}

// --- CRUD ---

/**
 * 获取所有供应商的「列表视图」（设置页树等只读场景）。
 * 不解密 api_key —— 密钥永不发送到渲染进程；
 * 需要完整配置（含密钥）的路径请使用 getProviderById / getEnabledProviders / getDefaultProvider。
 */
async function getAllProviderList(): Promise<LlmProviderConfig[]> {
  return withOrm('getAllProviderList', async (db) => {
    const rows = await db
      .select()
      .from(llm_providers)
      .orderBy(asc(llm_providers.sort_order), asc(llm_providers.id))
    logger.info(`Query for all providers returned ${rows.length} rows.`)
    return rows.map((row) => rowToConfig(row, false))
  })
}

/**
 * 根据 ID 获取供应商
 */
async function getProviderById(id: number): Promise<LlmProviderConfig | null> {
  return withOrm('getProviderById', async (db) => {
    const rows = await db.select().from(llm_providers).where(eq(llm_providers.id, id)).limit(1)
    if (rows.length === 0) return null
    return rowToConfig(rows[0])
  })
}

/**
 * 获取默认供应商（已启用的）
 */
async function getDefaultProvider(): Promise<LlmProviderConfig | null> {
  return withOrm('getDefaultProvider', async (db) => {
    const rows = await db
      .select()
      .from(llm_providers)
      .where(and(eq(llm_providers.is_default, true), eq(llm_providers.is_enabled, true)))
      .limit(1)
    if (rows.length === 0) {
      // 回退：取第一个已启用的
      const fallback = await db
        .select()
        .from(llm_providers)
        .where(eq(llm_providers.is_enabled, true))
        .orderBy(asc(llm_providers.sort_order), asc(llm_providers.id))
        .limit(1)
      if (fallback.length === 0) return null
      return rowToConfig(fallback[0])
    }
    return rowToConfig(rows[0])
  })
}

/**
 * 获取所有已启用的供应商
 */
async function getEnabledProviders(): Promise<LlmProviderConfig[]> {
  return withOrm('getEnabledProviders', async (db) => {
    const rows = await db
      .select()
      .from(llm_providers)
      .where(eq(llm_providers.is_enabled, true))
      .orderBy(asc(llm_providers.sort_order), asc(llm_providers.id))
    return rows.map((row) => rowToConfig(row))
  })
}

/** 把输入整理成可直接写库的列值（api_key 加密、JSON 列序列化） */
function toProviderColumns(input: LlmProviderInput): typeof llm_providers.$inferInsert {
  return {
    name: input.name,
    provider: input.provider,
    base_url: input.base_url || null,
    api_key_encrypted: input.api_key ? encryptApiKey(input.api_key) : null,
    model: input.model,
    temperature: input.temperature ?? 0.7,
    max_tokens: input.max_tokens || null,
    extra_config: input.extra_config ? JSON.stringify(input.extra_config) : null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    is_default: input.is_default ?? false,
    is_enabled: input.is_enabled ?? true,
    sort_order: input.sort_order ?? 0
  }
}

/**
 * 创建供应商
 */
async function createProvider(input: LlmProviderInput): Promise<number> {
  return withOrm('createProvider', async (db) => {
    // 如果设为默认，先取消其他默认
    if (input.is_default) {
      await db
        .update(llm_providers)
        .set({ is_default: false })
        .where(eq(llm_providers.is_default, true))
    }

    const rows = await db
      .insert(llm_providers)
      .values(toProviderColumns(input))
      .returning({ id: llm_providers.id })

    const newId = rows[0].id
    logger.info(`Created provider "${input.name}" with ID: ${newId}`)
    return newId
  })
}

/**
 * 批量创建供应商（“一键添加”拉取到的模型列表）。
 * 相比逐个调用 createProvider：
 * - 全部插入在同一个事务中完成（PGlite 单次事务开销）；
 * - 自动跳过非法输入与已存在的 (provider, model) 组合，防止重复添加；
 * - 调用方只需清一次缓存、广播一次变更，避免渲染进程风暴性全量刷新。
 */
async function createProviders(
  inputs: LlmProviderInput[]
): Promise<{ created: number; skipped: number }> {
  return withOrm('createProviders', async (db) => {
    const list = Array.isArray(inputs) ? inputs : []
    const valid = list.filter(
      (i) =>
        i &&
        typeof i.name === 'string' &&
        i.name.trim() !== '' &&
        typeof i.model === 'string' &&
        i.model.trim() !== '' &&
        typeof i.provider === 'string' &&
        i.provider.trim() !== ''
    )
    const skippedByValidation = list.length - valid.length

    let created = 0
    await db.transaction(async (tx) => {
      // 批量添加默认不设默认模型；若个别输入要求默认，先统一取消现有默认
      if (valid.some((i) => i.is_default)) {
        await tx
          .update(llm_providers)
          .set({ is_default: false })
          .where(eq(llm_providers.is_default, true))
      }

      for (const input of valid) {
        // 跳过与现有供应商重复的 (provider, model)
        const dup = await tx
          .select({ id: llm_providers.id })
          .from(llm_providers)
          .where(
            and(eq(llm_providers.provider, input.provider), eq(llm_providers.model, input.model))
          )
          .limit(1)
        if (dup.length > 0) continue

        await tx.insert(llm_providers).values(toProviderColumns(input))
        created++
      }
    })

    const skipped = skippedByValidation + (valid.length - created)
    logger.info(
      `Batch created ${created} provider(s), skipped ${skipped} (${list.length} input(s)).`
    )
    return { created, skipped }
  })
}

/**
 * 更新供应商
 */
async function updateProvider(id: number, updates: Partial<LlmProviderInput>): Promise<boolean> {
  return withOrm('updateProvider', async (db) => {
    const patch: PgUpdateSetSource<typeof llm_providers> = {}

    if (updates.name !== undefined) patch.name = updates.name
    if (updates.provider !== undefined) patch.provider = updates.provider
    if (updates.base_url !== undefined) patch.base_url = updates.base_url
    // 空字符串视为删除key
    if (updates.api_key !== undefined) {
      patch.api_key_encrypted = updates.api_key ? encryptApiKey(updates.api_key) : null
    }
    if (updates.model !== undefined) patch.model = updates.model
    if (updates.temperature !== undefined) patch.temperature = updates.temperature
    if (updates.max_tokens !== undefined) patch.max_tokens = updates.max_tokens
    if (updates.extra_config !== undefined) {
      patch.extra_config = updates.extra_config ? JSON.stringify(updates.extra_config) : null
    }
    if (updates.metadata !== undefined) {
      // null 或空对象都清空元数据
      patch.metadata =
        updates.metadata && Object.keys(updates.metadata).length > 0
          ? JSON.stringify(updates.metadata)
          : null
    }
    if (updates.is_default !== undefined) {
      if (updates.is_default) {
        await db
          .update(llm_providers)
          .set({ is_default: false })
          .where(eq(llm_providers.is_default, true))
      }
      patch.is_default = updates.is_default
    }
    if (updates.is_enabled !== undefined) patch.is_enabled = updates.is_enabled
    if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order

    if (Object.keys(patch).length === 0) {
      logger.warn('No fields to update for provider:', id)
      return false
    }

    patch.updated_at = sql`now()`
    const updated = await db
      .update(llm_providers)
      .set(patch)
      .where(eq(llm_providers.id, id))
      .returning({ id: llm_providers.id })

    logger.info(`Updated provider ID=${id}, ${updated.length} row(s) affected.`)
    return updated.length > 0
  })
}

/**
 * 删除供应商
 */
async function deleteProvider(id: number): Promise<boolean> {
  return withOrm('deleteProvider', async (db) => {
    const deleted = await db
      .delete(llm_providers)
      .where(eq(llm_providers.id, id))
      .returning({ id: llm_providers.id })
    logger.info(`Deleted provider ID=${id}, ${deleted.length} row(s) affected.`)
    return deleted.length > 0
  })
}

/**
 * 批量删除供应商（按 ID 集合）。
 * 与批量创建对称：全部删除在同一个事务中完成，调用方只需清一次缓存、广播一次变更，
 * 避免逐个 deleteProvider 触发渲染进程反复全量刷新而卡死。
 */
async function deleteProviders(ids: number[]): Promise<number> {
  return withOrm('deleteProviders', async (db) => {
    const unique = [
      ...new Set((Array.isArray(ids) ? ids : []).filter((id) => Number.isInteger(id) && id > 0))
    ]
    if (unique.length === 0) return 0

    await db.transaction(async (tx) => {
      for (const id of unique) {
        await tx.delete(llm_providers).where(eq(llm_providers.id, id))
      }
    })
    logger.info(`Batch deleted ${unique.length} provider(s).`)
    return unique.length
  })
}

/**
 * 设置默认供应商
 */
async function setDefaultProvider(id: number): Promise<boolean> {
  return withOrm('setDefaultProvider', async (db) => {
    await db
      .update(llm_providers)
      .set({ is_default: false })
      .where(eq(llm_providers.is_default, true))
    const updated = await db
      .update(llm_providers)
      .set({ is_default: true, updated_at: sql`now()` })
      .where(eq(llm_providers.id, id))
      .returning({ id: llm_providers.id })
    logger.info(`Set provider ID=${id} as default, ${updated.length} row(s) affected.`)
    return updated.length > 0
  })
}

export {
  getAllProviderList,
  getProviderById,
  getDefaultProvider,
  getEnabledProviders,
  createProvider,
  createProviders,
  updateProvider,
  deleteProvider,
  deleteProviders,
  setDefaultProvider
}
