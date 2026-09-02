import { getDatabaseInstance } from '../instance'
import logger from 'electron-log'

export interface GraphEntity {
  id: number
  wiki_id: number
  name: string
  type: string
  description: string | null
  aliases: string | null
  properties: string | null
  confidence: number
  source_note_ids: string | null
  created_at: string
  updated_at: string
}

export interface GraphRelation {
  id: number
  wiki_id: number
  source_id: number
  target_id: number
  relation_type: string
  description: string | null
  properties: string | null
  confidence: number
  source_note_ids: string | null
  created_at: string
}

export interface GraphBuildJob {
  id: number
  wiki_id: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  total_notes: number
  processed_notes: number
  entity_count: number
  relation_count: number
  error_message: string | null
  config: string | null
  processed_note_ids: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface GraphData {
  entities: GraphEntity[]
  relations: GraphRelation[]
}

// ==================== Entity CRUD ====================

async function getEntitiesByWikiId(
  wikiId: number,
  typeFilter?: string,
  noteIds?: number[]
): Promise<GraphEntity[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    // Always filter to only show entities whose source docs are still in this wiki
    let query = `SELECT ge.* FROM graph_entities ge
                 WHERE ge.wiki_id = $1
                 AND EXISTS (
                   SELECT 1 FROM jsonb_array_elements(ge.source_note_ids::jsonb) src
                   WHERE (src)::int IN (
                     SELECT dd.doc_id FROM directory_documents dd
                     JOIN wiki_directories wd ON wd.id = dd.directory_id
                     WHERE wd.wiki_id = $1
                   )
                 )`
    const params: unknown[] = [wikiId]
    let idx = 2

    if (typeFilter) {
      query += ` AND ge.type = $${idx++}`
      params.push(typeFilter)
    }

    if (noteIds && noteIds.length > 0) {
      query += ` AND EXISTS (SELECT 1 FROM jsonb_array_elements(ge.source_note_ids::jsonb) a CROSS JOIN jsonb_array_elements($${idx++}::jsonb) b WHERE a = b)`
      params.push(JSON.stringify(noteIds))
    }

    query += ' ORDER BY ge.name'
    const result = await db.query<GraphEntity>(query, params)
    return result.rows
  } catch (error) {
    logger.error('Failed to get entities by wiki id:', error)
    throw error
  }
}

async function getEntityById(id: number): Promise<GraphEntity | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<GraphEntity>('SELECT * FROM graph_entities WHERE id = $1', [id])
    return result.rows.length > 0 ? result.rows[0] : null
  } catch (error) {
    logger.error('Failed to get entity by id:', error)
    throw error
  }
}

async function searchEntities(wikiId: number, query: string): Promise<GraphEntity[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    // LIKE 通配符转义（修复：搜索词含 %/_/\ 时结果异常放大,普通字符搜索应视为字面量）
    const escaped = query.replace(/[\\%_]/g, (m) => `\\${m}`)
    const result = await db.query<GraphEntity>(
      `SELECT * FROM graph_entities
       WHERE wiki_id = $1
         AND (LOWER(name) LIKE LOWER($2) OR LOWER(aliases) LIKE LOWER($2))
       ORDER BY name`,
      [wikiId, `%${escaped}%`]
    )
    return result.rows
  } catch (error) {
    logger.error('Failed to search entities:', error)
    throw error
  }
}

async function upsertEntity(
  entity: Omit<GraphEntity, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    // Try to find existing entity by name within same wiki
    const existing = await db.query<{ id: number }>(
      'SELECT id FROM graph_entities WHERE wiki_id = $1 AND name = $2',
      [entity.wiki_id, entity.name]
    )

    if (existing.rows.length > 0) {
      const id = existing.rows[0].id
      await db.query(
        `UPDATE graph_entities
         SET type = $1, description = $2, aliases = $3, properties = $4,
             confidence = $5, source_note_ids = $6, updated_at = NOW()
         WHERE id = $7`,
        [
          entity.type,
          entity.description,
          entity.aliases,
          entity.properties,
          entity.confidence,
          entity.source_note_ids,
          id
        ]
      )
      return id
    }

    const result = await db.query<{ id: number }>(
      `INSERT INTO graph_entities (wiki_id, name, type, description, aliases, properties, confidence, source_note_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        entity.wiki_id,
        entity.name,
        entity.type,
        entity.description,
        entity.aliases,
        entity.properties,
        entity.confidence,
        entity.source_note_ids
      ]
    )
    return result.rows[0].id
  } catch (error) {
    logger.error('Failed to upsert entity:', error)
    throw error
  }
}

async function updateEntity(
  id: number,
  updates: Partial<Omit<GraphEntity, 'id' | 'created_at' | 'updated_at'>>
): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const fields: string[] = []
    const values: (string | number | null)[] = []
    let idx = 1

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`)
      values.push(updates.name)
    }
    if (updates.type !== undefined) {
      fields.push(`type = $${idx++}`)
      values.push(updates.type)
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${idx++}`)
      values.push(updates.description)
    }
    if (updates.aliases !== undefined) {
      fields.push(`aliases = $${idx++}`)
      values.push(updates.aliases)
    }
    if (updates.properties !== undefined) {
      fields.push(`properties = $${idx++}`)
      values.push(updates.properties)
    }
    if (updates.confidence !== undefined) {
      fields.push(`confidence = $${idx++}`)
      values.push(updates.confidence)
    }
    if (updates.source_note_ids !== undefined) {
      fields.push(`source_note_ids = $${idx++}`)
      values.push(updates.source_note_ids)
    }

    if (fields.length === 0) return false

    fields.push('updated_at = NOW()')
    values.push(id)

    const result = await db.query(
      `UPDATE graph_entities SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    )
    return (result.affectedRows ?? 0) > 0
  } catch (error) {
    logger.error('Failed to update entity:', error)
    throw error
  }
}

async function deleteEntity(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query('DELETE FROM graph_entities WHERE id = $1', [id])
    return (result.affectedRows ?? 0) > 0
  } catch (error) {
    logger.error('Failed to delete entity:', error)
    throw error
  }
}

async function deleteEntitiesByWikiId(wikiId: number): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query('DELETE FROM graph_entities WHERE wiki_id = $1', [wikiId])
    return result.affectedRows ?? 0
  } catch (error) {
    logger.error('Failed to delete entities by wiki id:', error)
    throw error
  }
}

// ==================== Relation CRUD ====================

async function getRelationsByWikiId(wikiId: number, noteIds?: number[]): Promise<GraphRelation[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    // Always filter to only show relations whose source docs are still in this wiki
    let query = `SELECT gr.* FROM graph_relations gr
                 WHERE gr.wiki_id = $1
                 AND EXISTS (
                   SELECT 1 FROM jsonb_array_elements(gr.source_note_ids::jsonb) src
                   WHERE (src)::int IN (
                     SELECT dd.doc_id FROM directory_documents dd
                     JOIN wiki_directories wd ON wd.id = dd.directory_id
                     WHERE wd.wiki_id = $1
                   )
                 )`
    const params: unknown[] = [wikiId]

    if (noteIds && noteIds.length > 0) {
      query +=
        ' AND EXISTS (SELECT 1 FROM jsonb_array_elements(gr.source_note_ids::jsonb) a CROSS JOIN jsonb_array_elements($2::jsonb) b WHERE a = b)'
      params.push(JSON.stringify(noteIds))
    }

    const result = await db.query<GraphRelation>(query, params)
    return result.rows
  } catch (error) {
    logger.error('Failed to get relations by wiki id:', error)
    throw error
  }
}

async function upsertRelation(relation: Omit<GraphRelation, 'id' | 'created_at'>): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    const existing = await db.query<{ id: number }>(
      `SELECT id FROM graph_relations
       WHERE wiki_id = $1 AND source_id = $2 AND target_id = $3 AND relation_type = $4`,
      [relation.wiki_id, relation.source_id, relation.target_id, relation.relation_type]
    )

    if (existing.rows.length > 0) {
      const id = existing.rows[0].id
      await db.query(
        `UPDATE graph_relations
         SET description = $1, properties = $2, confidence = $3, source_note_ids = $4
         WHERE id = $5`,
        [
          relation.description,
          relation.properties,
          relation.confidence,
          relation.source_note_ids,
          id
        ]
      )
      return id
    }

    const result = await db.query<{ id: number }>(
      `INSERT INTO graph_relations (wiki_id, source_id, target_id, relation_type, description, properties, confidence, source_note_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        relation.wiki_id,
        relation.source_id,
        relation.target_id,
        relation.relation_type,
        relation.description,
        relation.properties,
        relation.confidence,
        relation.source_note_ids
      ]
    )
    return result.rows[0].id
  } catch (error) {
    logger.error('Failed to upsert relation:', error)
    throw error
  }
}

async function deleteRelation(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query('DELETE FROM graph_relations WHERE id = $1', [id])
    return (result.affectedRows ?? 0) > 0
  } catch (error) {
    logger.error('Failed to delete relation:', error)
    throw error
  }
}

async function deleteRelationsByWikiId(wikiId: number): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query('DELETE FROM graph_relations WHERE wiki_id = $1', [wikiId])
    return result.affectedRows ?? 0
  } catch (error) {
    logger.error('Failed to delete relations by wiki id:', error)
    throw error
  }
}

// ==================== Build Job CRUD ====================

/**
 * Upsert 构建任务（每个 wiki 仅一条记录）
 * 如果该 wiki 已有任务则重置为 pending 状态，否则新建
 */
async function upsertBuildJob(wikiId: number, config?: Record<string, unknown>): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<{ id: number }>(
      `INSERT INTO graph_build_jobs (wiki_id, status, config)
       VALUES ($1, 'pending', $2)
       ON CONFLICT (wiki_id) DO UPDATE SET
         status = 'pending',
         config = $2,
         total_notes = 0,
         processed_notes = 0,
         entity_count = 0,
         relation_count = 0,
         error_message = NULL,
         started_at = NULL,
         completed_at = NULL,
         created_at = NOW()
       RETURNING id`,
      [wikiId, config ? JSON.stringify(config) : null]
    )
    return result.rows[0].id
  } catch (error) {
    logger.error('Failed to upsert build job:', error)
    throw error
  }
}

async function updateBuildJob(
  id: number,
  updates: Partial<
    Pick<
      GraphBuildJob,
      | 'status'
      | 'total_notes'
      | 'processed_notes'
      | 'entity_count'
      | 'relation_count'
      | 'error_message'
      | 'processed_note_ids'
      | 'started_at'
      | 'completed_at'
    >
  >
): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const fields: string[] = []
    const values: (string | number | null)[] = []
    let idx = 1

    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`)
      values.push(updates.status)
    }
    if (updates.total_notes !== undefined) {
      fields.push(`total_notes = $${idx++}`)
      values.push(updates.total_notes)
    }
    if (updates.processed_notes !== undefined) {
      fields.push(`processed_notes = $${idx++}`)
      values.push(updates.processed_notes)
    }
    if (updates.entity_count !== undefined) {
      fields.push(`entity_count = $${idx++}`)
      values.push(updates.entity_count)
    }
    if (updates.relation_count !== undefined) {
      fields.push(`relation_count = $${idx++}`)
      values.push(updates.relation_count)
    }
    if (updates.error_message !== undefined) {
      fields.push(`error_message = $${idx++}`)
      values.push(updates.error_message)
    }
    if (updates.processed_note_ids !== undefined) {
      fields.push(`processed_note_ids = $${idx++}`)
      values.push(updates.processed_note_ids)
    }

    if (updates.status === 'running' && !updates.started_at) {
      fields.push('started_at = NOW()')
    }
    if (updates.status === 'completed' || updates.status === 'failed') {
      fields.push('completed_at = NOW()')
    }

    if (fields.length === 0) return false

    values.push(id)
    const result = await db.query(
      `UPDATE graph_build_jobs SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    )
    return (result.affectedRows ?? 0) > 0
  } catch (error) {
    logger.error('Failed to update build job:', error)
    throw error
  }
}

async function getBuildJobByWikiId(wikiId: number): Promise<GraphBuildJob | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<GraphBuildJob>(
      'SELECT * FROM graph_build_jobs WHERE wiki_id = $1',
      [wikiId]
    )
    return result.rows.length > 0 ? result.rows[0] : null
  } catch (error) {
    logger.error('Failed to get build job by wiki id:', error)
    throw error
  }
}

async function getLatestBuildJob(wikiId: number): Promise<GraphBuildJob | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<GraphBuildJob>(
      'SELECT * FROM graph_build_jobs WHERE wiki_id = $1 ORDER BY created_at DESC LIMIT 1',
      [wikiId]
    )
    return result.rows.length > 0 ? result.rows[0] : null
  } catch (error) {
    logger.error('Failed to get latest build job:', error)
    throw error
  }
}

// ==================== Batch Operations ====================

/**
 * 批量 upsert 实体（在单个事务中完成，大幅提升性能）
 * 返回 entity name → entity id 的映射
 */
async function batchUpsertEntities(
  entities: Omit<GraphEntity, 'id' | 'created_at' | 'updated_at'>[]
): Promise<Map<string, number>> {
  const nameToId = new Map<string, number>()
  if (entities.length === 0) return nameToId

  try {
    const db = (await getDatabaseInstance()).getDatabase()

    await db.transaction(async (tx) => {
      const wikiIds = [...new Set(entities.map((e) => e.wiki_id))]
      const names = entities.map((e) => e.name)

      const existingResult = await tx.query<{ id: number; name: string; wiki_id: number }>(
        `SELECT id, name, wiki_id FROM graph_entities WHERE wiki_id = ANY($1) AND name = ANY($2)`,
        [wikiIds, names]
      )

      const existingMap = new Map<string, number>()
      for (const row of existingResult.rows) {
        existingMap.set(`${row.wiki_id}:${row.name}`, row.id)
      }

      for (const entity of entities) {
        const key = `${entity.wiki_id}:${entity.name}`
        const existingId = existingMap.get(key)
        if (existingId !== undefined) {
          nameToId.set(entity.name, existingId)
          // source_note_ids 取并集（修复：此前整列覆盖,跨文档来源只留最后一篇,
          // 删文档按「摘除 doc_id、摘空才删」工作时会误删仍受其它文档支撑的实体）
          await tx.query(
            `UPDATE graph_entities
             SET type = $1, description = $2, aliases = $3, properties = $4,
                 confidence = $5,
                 source_note_ids = COALESCE((
                   SELECT jsonb_agg(DISTINCT elem)::text
                   FROM jsonb_array_elements(COALESCE(source_note_ids::jsonb, '[]'::jsonb) || $6::jsonb) AS elem
                 ), '[]'),
                 updated_at = NOW()
             WHERE id = $7`,
            [
              entity.type,
              entity.description,
              entity.aliases,
              entity.properties,
              entity.confidence,
              entity.source_note_ids,
              existingId
            ]
          )
        } else {
          const result = await tx.query<{ id: number }>(
            `INSERT INTO graph_entities (wiki_id, name, type, description, aliases, properties, confidence, source_note_ids)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
              entity.wiki_id,
              entity.name,
              entity.type,
              entity.description,
              entity.aliases,
              entity.properties,
              entity.confidence,
              entity.source_note_ids
            ]
          )
          const id = result.rows[0].id
          nameToId.set(entity.name, id)
          // 修复：批内同名实体（不同 chunk 抽到同一实体是常态）第二个不再走 INSERT,
          // 否则画布出现重复节点
          existingMap.set(key, id)
        }
      }
    })
  } catch (error) {
    logger.error('Failed to batch upsert entities:', error)
    throw error
  }

  return nameToId
}

/**
 * 批量 upsert 关系（在单个事务中完成）
 * 返回实际保存的关系数量
 */
async function batchUpsertRelations(
  relations: Omit<GraphRelation, 'id' | 'created_at'>[]
): Promise<number> {
  if (relations.length === 0) return 0

  let savedCount = 0
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    await db.transaction(async (tx) => {
      for (const relation of relations) {
        const existing = await tx.query<{ id: number }>(
          `SELECT id FROM graph_relations
           WHERE wiki_id = $1 AND source_id = $2 AND target_id = $3 AND relation_type = $4`,
          [relation.wiki_id, relation.source_id, relation.target_id, relation.relation_type]
        )

        if (existing.rows.length > 0) {
          await tx.query(
            `UPDATE graph_relations
             SET description = $1, properties = $2, confidence = $3, source_note_ids = $4
             WHERE id = $5`,
            [
              relation.description,
              relation.properties,
              relation.confidence,
              relation.source_note_ids,
              existing.rows[0].id
            ]
          )
        } else {
          await tx.query(
            `INSERT INTO graph_relations (wiki_id, source_id, target_id, relation_type, description, properties, confidence, source_note_ids)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              relation.wiki_id,
              relation.source_id,
              relation.target_id,
              relation.relation_type,
              relation.description,
              relation.properties,
              relation.confidence,
              relation.source_note_ids
            ]
          )
        }
        savedCount++
      }
    })
  } catch (error) {
    logger.error('Failed to batch upsert relations:', error)
    throw error
  }

  return savedCount
}

// ==================== Aggregate ====================

async function getFullGraphData(
  wikiId: number,
  typeFilter?: string,
  noteIds?: number[]
): Promise<GraphData> {
  const [entities, relations] = await Promise.all([
    getEntitiesByWikiId(wikiId, typeFilter, noteIds),
    getRelationsByWikiId(wikiId, noteIds)
  ])
  return { entities, relations }
}

async function batchUpdateEntityConfidence(
  updates: Array<{ id: number; confidence: number }>
): Promise<void> {
  if (updates.length === 0) return

  try {
    const db = (await getDatabaseInstance()).getDatabase()

    await db.transaction(async (tx) => {
      for (const { id, confidence } of updates) {
        await tx.query(
          'UPDATE graph_entities SET confidence = $1, updated_at = NOW() WHERE id = $2',
          [confidence, id]
        )
      }
    })
  } catch (error) {
    logger.error('Failed to batch update entity confidence:', error)
    throw error
  }
}

/**
 * 持久化实体合并结果（build-graph 消歧合并阶段专用）：
 * - 规范名行存在则更新（source_note_ids 取自身与全部被合并行的并集），不存在则插入；
 * - 被合并掉的旧名行删除前，把引用它的关系 source_id/target_id 重指向规范行
 *   （graph_relations 对实体是 ON DELETE CASCADE，不重指向会连关系一起删掉）；
 * - renameMap 未覆盖的旧名保守保留，不删除。
 * 返回合并后「实体名 → id」映射（含新建规范名），供置信度更新与关系保存使用。
 */
async function persistEntityMerges(
  wikiId: number,
  merged: Array<{
    name: string
    type: string
    description: string
    aliases: string[]
    confidence: number
    source_doc_ids: number[]
  }>,
  renameMap: Map<string, string>
): Promise<Map<string, number>> {
  const nameToId = new Map<string, number>()
  if (merged.length === 0) return nameToId

  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.transaction(async (tx) => {
      const rowsResult = await tx.query<{
        id: number
        name: string
        source_note_ids: string | null
      }>('SELECT id, name, source_note_ids FROM graph_entities WHERE wiki_id = $1', [wikiId])

      const rowsByName = new Map<string, { id: number; sourceIds: number[] }>()
      for (const row of rowsResult.rows) {
        let sourceIds: number[] = []
        if (row.source_note_ids) {
          try {
            const parsed = JSON.parse(row.source_note_ids)
            if (Array.isArray(parsed)) sourceIds = parsed as number[]
          } catch {
            sourceIds = []
          }
        }
        rowsByName.set(row.name, { id: row.id, sourceIds })
      }

      // 规范名 → 被合并掉的旧名列表
      const removedByCanonical = new Map<string, string[]>()
      for (const [oldName, canonical] of renameMap) {
        if (oldName === canonical) continue
        const list = removedByCanonical.get(canonical)
        if (list) list.push(oldName)
        else removedByCanonical.set(canonical, [oldName])
      }

      for (const entity of merged) {
        const canonical = entity.name
        const existing = rowsByName.get(canonical)
        const removed = removedByCanonical.get(canonical) ?? []

        // 来源并集：自身 + 既有行 + 被合并行的 source_note_ids
        const unionSourceIds = new Set<number>(entity.source_doc_ids)
        if (existing) {
          for (const id of existing.sourceIds) unionSourceIds.add(id)
        }
        for (const oldName of removed) {
          const oldRow = rowsByName.get(oldName)
          if (oldRow) {
            for (const id of oldRow.sourceIds) unionSourceIds.add(id)
          }
        }
        const sourceIds = [...unionSourceIds]

        let canonicalId: number
        if (existing) {
          canonicalId = existing.id
          await tx.query(
            `UPDATE graph_entities
             SET type = $1, description = $2, aliases = $3, properties = $4,
                 confidence = $5, source_note_ids = $6, updated_at = NOW()
             WHERE id = $7`,
            [
              entity.type,
              entity.description,
              JSON.stringify(entity.aliases),
              null,
              entity.confidence,
              JSON.stringify(sourceIds),
              canonicalId
            ]
          )
        } else {
          const insert = await tx.query<{ id: number }>(
            `INSERT INTO graph_entities (wiki_id, name, type, description, aliases, properties, confidence, source_note_ids)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [
              wikiId,
              canonical,
              entity.type,
              entity.description,
              JSON.stringify(entity.aliases),
              null,
              entity.confidence,
              JSON.stringify(sourceIds)
            ]
          )
          canonicalId = insert.rows[0].id
          rowsByName.set(canonical, { id: canonicalId, sourceIds })
        }
        nameToId.set(canonical, canonicalId)

        // 旧名行：先重指向引用它的关系，再删除行本身（外键为 CASCADE，不重指向会连带删关系）
        for (const oldName of removed) {
          const oldRow = rowsByName.get(oldName)
          if (!oldRow || oldRow.id === canonicalId) continue
          await tx.query(
            'UPDATE graph_relations SET source_id = $1 WHERE wiki_id = $2 AND source_id = $3',
            [canonicalId, wikiId, oldRow.id]
          )
          await tx.query(
            'UPDATE graph_relations SET target_id = $1 WHERE wiki_id = $2 AND target_id = $3',
            [canonicalId, wikiId, oldRow.id]
          )
          await tx.query('DELETE FROM graph_entities WHERE id = $1', [oldRow.id])
          rowsByName.delete(oldName)
        }
      }

      // 重指向可能产生自环关系（A→B 且 B 合并进 A），抽取阶段本就过滤自环，这里兜底清理
      await tx.query('DELETE FROM graph_relations WHERE wiki_id = $1 AND source_id = target_id', [
        wikiId
      ])
    })
  } catch (error) {
    logger.error('Failed to persist entity merges:', error)
    throw error
  }
  return nameToId
}

export {
  getEntitiesByWikiId,
  getEntityById,
  searchEntities,
  upsertEntity,
  updateEntity,
  deleteEntity,
  deleteEntitiesByWikiId,
  getRelationsByWikiId,
  upsertRelation,
  deleteRelation,
  deleteRelationsByWikiId,
  getFullGraphData,
  upsertBuildJob,
  updateBuildJob,
  getBuildJobByWikiId,
  getLatestBuildJob,
  batchUpsertEntities,
  persistEntityMerges,
  batchUpsertRelations,
  batchUpdateEntityConfidence
}
