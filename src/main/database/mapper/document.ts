import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'
import { saveImage } from './image'

export interface DocRow {
  id: number
  title: string
  summary: string | null
  tags: string | null
  created_at: string
  updated_at: string
}

export interface DocListItem {
  id: number
  title: string
  image: string | null
  summary: string | null
  tags: string | null
  created_at: string
  updated_at: string
  word_count: number
}

export interface DocWithContent extends DocListItem {
  content: string | null
}

export interface PaginatedResult<T> {
  items: T[]
  hasMore: boolean
  total: number
}

async function getDocById(id: number): Promise<DocWithContent | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = `
      SELECT
        d.id, d.title, d.summary, d.tags, d.created_at, d.updated_at,
        img.data as image, dc.content,
        LENGTH(dc.content) as word_count
      FROM documents d
      LEFT JOIN documents_content dc ON d.id = dc.doc_id
      LEFT JOIN images img ON dc.image_id = img.id
      WHERE d.id = $1
    `
    const result = await db.query<DocWithContent>(sql, [id])
    if (result.rows.length > 0) {
      const row = result.rows[0]
      return {
        id: row.id,
        title: row.title,
        image: row.image,
        summary: row.summary,
        tags: row.tags,
        created_at: row.created_at,
        updated_at: row.updated_at,
        word_count: row.word_count || 0,
        content: row.content
      }
    }
    return null
  } catch (error) {
    logger.error('Failed to get doc by id:', error)
    throw error
  }
}

async function getAllDocs(
  workspaceId: number,
  page: number = 1,
  pageSize: number = 10,
  excludeWikiId?: number,
  search?: string
): Promise<PaginatedResult<DocListItem>> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const offset = (page - 1) * pageSize

    // excludeWikiId = -1 means exclude docs linked to ANY wiki
    const excludeAllWiki = excludeWikiId === -1
    const excludeSpecificWiki = excludeWikiId != null && excludeWikiId > 0

    const hasExclude = excludeAllWiki || excludeSpecificWiki
    const excludeWhere = hasExclude ? 'AND dd.doc_id IS NULL' : ''

    const countJoin = hasExclude
      ? excludeSpecificWiki
        ? 'LEFT JOIN directory_documents dd ON d.id = dd.doc_id LEFT JOIN wiki_directories wd ON dd.directory_id = wd.id AND wd.wiki_id = $2'
        : 'LEFT JOIN directory_documents dd ON d.id = dd.doc_id LEFT JOIN wiki_directories wd ON dd.directory_id = wd.id'
      : ''

    const countParams: (string | number)[] = [workspaceId]
    if (excludeSpecificWiki) countParams.push(excludeWikiId)
    const countSearchIdx = countParams.length + 1
    const searchWhereCount = search
      ? `AND (d.title ILIKE $${countSearchIdx} OR d.summary ILIKE $${countSearchIdx} OR d.tags ILIKE $${countSearchIdx})`
      : ''
    if (search) countParams.push(`%${search}%`)

    const countSql = `
      SELECT COUNT(*) as total FROM documents d
      ${countJoin}
      WHERE d.workspace_id = $1 ${excludeWhere} ${searchWhereCount}
    `
    const countResult = await db.query<{ total: number }>(countSql, countParams)
    const total = Number(countResult.rows[0]?.total) || 0

    const dataJoin = hasExclude
      ? excludeSpecificWiki
        ? 'LEFT JOIN directory_documents dd ON d.id = dd.doc_id LEFT JOIN wiki_directories wd ON dd.directory_id = wd.id AND wd.wiki_id = $4'
        : 'LEFT JOIN directory_documents dd ON d.id = dd.doc_id LEFT JOIN wiki_directories wd ON dd.directory_id = wd.id'
      : ''
    const dataParams: (string | number)[] = [workspaceId, pageSize, offset]
    if (excludeSpecificWiki) dataParams.push(excludeWikiId)
    const dataSearchIdx = dataParams.length + 1
    const searchWhereData = search
      ? `AND (d.title ILIKE $${dataSearchIdx} OR d.summary ILIKE $${dataSearchIdx} OR d.tags ILIKE $${dataSearchIdx})`
      : ''
    if (search) dataParams.push(`%${search}%`)

    const dataSql = `
      SELECT
        d.id, d.title, d.summary, d.tags, d.created_at, d.updated_at,
        img.data as image,
        LENGTH(dc.content) as word_count
      FROM documents d
      LEFT JOIN documents_content dc ON d.id = dc.doc_id
      LEFT JOIN images img ON dc.image_id = img.id
      ${dataJoin}
      WHERE d.workspace_id = $1 ${excludeWhere} ${searchWhereData}
      ORDER BY d.updated_at DESC
      LIMIT $2 OFFSET $3
    `

    const result = await db.query<DocListItem>(dataSql, dataParams)

    const items = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      image: row.image,
      summary: row.summary,
      tags: row.tags,
      created_at: row.created_at,
      updated_at: row.updated_at,
      word_count: row.word_count || 0
    }))

    const hasMore = offset + items.length < total
    return { items, hasMore, total }
  } catch (error) {
    logger.error('Failed to get all docs:', error)
    throw error
  }
}

async function getDocPage(
  workspaceId: number,
  query: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResult<DocListItem>> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const offset = (page - 1) * pageSize

    // Use ILIKE-based search across title, summary, tags, and doc content.
    const searchPattern = `%${query}%`

    const countSql = `
      SELECT COUNT(*) as total
      FROM documents d
      LEFT JOIN documents_content dc ON d.id = dc.doc_id
      WHERE d.workspace_id = $1
        AND (d.title ILIKE $2
         OR d.summary ILIKE $2
         OR d.tags ILIKE $2
         OR dc.content ILIKE $2)
    `
    const countResult = await db.query<{ total: number }>(countSql, [workspaceId, searchPattern])
    const total = Number(countResult.rows[0]?.total) || 0

    if (total === 0) {
      return { items: [], hasMore: false, total: 0 }
    }

    const dataSql = `
      SELECT
        d.id, d.title, d.summary, d.tags, d.created_at, d.updated_at,
        img.data as image,
        LENGTH(dc.content) as word_count
      FROM documents d
      LEFT JOIN documents_content dc ON d.id = dc.doc_id
      LEFT JOIN images img ON dc.image_id = img.id
      WHERE d.workspace_id = $1
        AND (d.title ILIKE $2
         OR d.summary ILIKE $2
         OR d.tags ILIKE $2
         OR dc.content ILIKE $2)
      ORDER BY d.updated_at DESC
      LIMIT $3 OFFSET $4
    `

    const result = await db.query<DocListItem>(dataSql, [
      workspaceId,
      searchPattern,
      pageSize,
      offset
    ])

    const items = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      image: row.image,
      summary: row.summary,
      tags: row.tags,
      created_at: row.created_at,
      updated_at: row.updated_at,
      word_count: row.word_count || 0
    }))

    const hasMore = offset + items.length < total
    return { items, hasMore, total }
  } catch (error) {
    logger.error('Failed to search docs:', error)
    throw error
  }
}

async function addDoc(
  workspaceId: number,
  doc: Omit<DocRow, 'id' | 'created_at' | 'updated_at'> & {
    image?: string | null
    content?: string | null
  }
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const { title, summary, tags, image, content } = doc

    const imageId = await saveImage(image ?? null)

    const insertResult = await db.query<{ id: number }>(
      'INSERT INTO documents (workspace_id, title, summary, tags) VALUES ($1, $2, $3, $4) RETURNING id',
      [workspaceId, title, summary || null, tags || null]
    )

    const docId = insertResult.rows[0].id

    await db.query(
      'INSERT INTO documents_content (doc_id, image_id, content) VALUES ($1, $2, $3)',
      [docId, imageId, content || null]
    )

    logger.info(`Inserted new doc with ID: ${docId}`)
    return docId
  } catch (error) {
    logger.error('Failed to insert doc:', error)
    throw error
  }
}

async function updateDoc(
  id: number,
  updates: Partial<
    Omit<DocRow, 'id' | 'created_at'> & {
      image?: string | null
      content?: string | null
    }
  >
): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    const docUpdates: string[] = []
    const docValues: (string | number | null)[] = []
    let docParamIndex = 1

    if (updates.title !== undefined) {
      docUpdates.push(`title = $${docParamIndex++}`)
      docValues.push(updates.title)
    }
    if (updates.summary !== undefined) {
      docUpdates.push(`summary = $${docParamIndex++}`)
      docValues.push(updates.summary)
    }
    if (updates.tags !== undefined) {
      docUpdates.push(`tags = $${docParamIndex++}`)
      docValues.push(updates.tags)
    }

    const contentUpdates: string[] = []
    const contentValues: (string | number | null)[] = []
    let contentParamIndex = 1

    if (updates.image !== undefined) {
      const imageId = await saveImage(updates.image ?? null)
      contentUpdates.push(`image_id = $${contentParamIndex++}`)
      contentValues.push(imageId)
    }
    if (updates.content !== undefined) {
      contentUpdates.push(`content = $${contentParamIndex++}`)
      contentValues.push(updates.content)
    }

    if (docUpdates.length === 0 && contentUpdates.length === 0) {
      logger.warn('No fields to update for doc with id:', id)
      return false
    }

    docUpdates.push('updated_at = NOW()')

    let hasChanges = false

    if (docUpdates.length > 0) {
      const docSql = `UPDATE documents SET ${docUpdates.join(', ')} WHERE id = $${docParamIndex++}`
      docValues.push(id)

      const docResult = await db.query(docSql, docValues)
      hasChanges = hasChanges || (docResult.affectedRows ?? 0) > 0
    }

    if (contentUpdates.length > 0) {
      // Check if content row exists
      const checkResult = await db.query<{ id: number }>(
        'SELECT id FROM documents_content WHERE doc_id = $1',
        [id]
      )

      if (checkResult.rows.length > 0) {
        contentUpdates.push('updated_at = NOW()')
        const contentSql = `UPDATE documents_content SET ${contentUpdates.join(', ')} WHERE doc_id = $${contentParamIndex++}`
        contentValues.push(id)

        const contentResult = await db.query(contentSql, contentValues)
        hasChanges = hasChanges || (contentResult.affectedRows ?? 0) > 0
      } else {
        const imageId = await saveImage(updates.image ?? null)
        const content = updates.content || null

        await db.query(
          'INSERT INTO documents_content (doc_id, image_id, content) VALUES ($1, $2, $3)',
          [id, imageId, content]
        )
        hasChanges = true
      }
    }

    if (hasChanges) {
      logger.info(`Updated doc with ID: ${id}`)
      return true
    }

    logger.warn(`No rows updated for doc with ID: ${id}`)
    return false
  } catch (error) {
    logger.error('Failed to update doc:', error)
    throw error
  }
}

async function deleteDoc(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    await db.transaction(async (tx) => {
      // 1. 删除文档内容
      await tx.query('DELETE FROM documents_content WHERE doc_id = $1', [id])

      // 2. 删除文档本身
      const result = await tx.query('DELETE FROM documents WHERE id = $1', [id])
      const changes = result.affectedRows ?? 0

      // 3. 清理图谱实体：移除该文档 ID，若 source_note_ids 变空则删除实体
      await tx.query(
        `UPDATE graph_entities
         SET source_note_ids = COALESCE((
           SELECT jsonb_agg(elem)::text
           FROM jsonb_array_elements(source_note_ids::jsonb) AS elem
           WHERE (elem)::int != CAST($1 AS int)
         ), '[]')
         WHERE EXISTS (
           SELECT 1 FROM jsonb_array_elements(source_note_ids::jsonb) a
           WHERE (a)::int = CAST($1 AS int)
         )`,
        [id]
      )
      await tx.query(
        `DELETE FROM graph_entities
         WHERE source_note_ids = '[]' OR source_note_ids IS NULL OR source_note_ids = ''`
      )

      // 4. 清理图谱关系：移除该文档 ID，若 source_note_ids 变空则删除关系
      await tx.query(
        `UPDATE graph_relations
         SET source_note_ids = COALESCE((
           SELECT jsonb_agg(elem)::text
           FROM jsonb_array_elements(source_note_ids::jsonb) AS elem
           WHERE (elem)::int != CAST($1 AS int)
         ), '[]')
         WHERE EXISTS (
           SELECT 1 FROM jsonb_array_elements(source_note_ids::jsonb) a
           WHERE (a)::int = CAST($1 AS int)
         )`,
        [id]
      )
      await tx.query(
        `DELETE FROM graph_relations
         WHERE source_note_ids = '[]' OR source_note_ids IS NULL OR source_note_ids = ''`
      )

      if (changes > 0) {
        logger.info(`Deleted doc with ID: ${id}, ${changes} row(s) affected.`)
      } else {
        logger.warn(`No rows deleted for doc with ID: ${id}`)
      }
    })

    return true
  } catch (error) {
    logger.error('Failed to delete doc:', error)
    throw error
  }
}

async function deleteDocsByTimeRange(
  workspaceId: number,
  startTime: string,
  endTime: string
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    await db.query(
      'DELETE FROM documents_content WHERE doc_id IN (SELECT id FROM documents WHERE workspace_id = $1 AND created_at >= $2 AND created_at <= $3)',
      [workspaceId, startTime, endTime]
    )

    const result = await db.query(
      'DELETE FROM documents WHERE workspace_id = $1 AND created_at >= $2 AND created_at <= $3',
      [workspaceId, startTime, endTime]
    )
    const deleted = result.affectedRows ?? 0
    logger.info(`Deleted ${deleted} docs in time range [${startTime}, ${endTime}]`)
    return deleted
  } catch (error) {
    logger.error('Failed to delete docs by time range:', error)
    throw error
  }
}

export { getDocById, getAllDocs, getDocPage, addDoc, updateDoc, deleteDoc, deleteDocsByTimeRange }
