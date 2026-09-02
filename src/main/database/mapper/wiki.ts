import { getDatabaseInstance } from '../instance'
import logger from 'electron-log'
import { saveImage } from './image'

export interface WikiBaseRow {
  id: number
  title: string
  summary: string | null
  tags: string | null
  image: string | null
  created_at: string
  updated_at: string
}

export interface WikiRow extends WikiBaseRow {
  doc_count: number
}

export interface WikiDirectoryRow {
  id: number
  wiki_id: number
  parent_id: number | null
  name: string
  sort_order: number
  level: number
  created_at: string
  updated_at: string
}

export interface PaginatedResult<T> {
  items: T[]
  hasMore: boolean
  total: number
}

async function getWikiById(id: number): Promise<WikiRow | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = `
      SELECT
        w.id, w.title, w.summary, w.tags, img.data as image, w.created_at, w.updated_at,
        COUNT(DISTINCT dd.doc_id) as doc_count
      FROM wiki w
      LEFT JOIN images img ON w.image_id = img.id
      LEFT JOIN wiki_directories wd ON w.id = wd.wiki_id
      LEFT JOIN directory_documents dd ON wd.id = dd.directory_id
      WHERE w.id = $1
      GROUP BY w.id, img.data
    `
    const result = await db.query<WikiRow>(sql, [id])
    if (result.rows.length > 0) {
      return {
        ...result.rows[0],
        doc_count: result.rows[0].doc_count || 0
      }
    }
    return null
  } catch (error) {
    logger.error('Failed to get wiki by id:', error)
    throw error
  }
}

async function getAllWikis(
  workspaceId: number,
  page: number = 1,
  pageSize: number = 10
): Promise<PaginatedResult<WikiRow>> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const offset = (page - 1) * pageSize

    const countResult = await db.query<{ total: number }>(
      'SELECT COUNT(*) as total FROM wiki WHERE workspace_id = $1',
      [workspaceId]
    )
    const total = Number(countResult.rows[0]?.total) || 0

    const dataSql = `
      SELECT
        w.id, w.title, w.summary, w.tags, img.data as image, w.created_at, w.updated_at,
        COUNT(DISTINCT dd.doc_id) as doc_count
      FROM wiki w
      LEFT JOIN images img ON w.image_id = img.id
      LEFT JOIN wiki_directories wd ON w.id = wd.wiki_id
      LEFT JOIN directory_documents dd ON wd.id = dd.directory_id
      WHERE w.workspace_id = $1
      GROUP BY w.id, img.data
      ORDER BY w.updated_at DESC
      LIMIT $2 OFFSET $3
    `

    const result = await db.query<WikiRow>(dataSql, [workspaceId, pageSize, offset])

    const items = result.rows.map((row) => ({
      ...row,
      doc_count: row.doc_count || 0
    }))
    const hasMore = offset + items.length < total
    return { items, hasMore, total }
  } catch (error) {
    logger.error('Failed to get all wikis:', error)
    throw error
  }
}

async function addWiki(
  workspaceId: number,
  wiki: Omit<WikiBaseRow, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const { title, summary, tags, image } = wiki

    const imageId = await saveImage(image ?? null)

    const result = await db.query<{ id: number }>(
      'INSERT INTO wiki (workspace_id, title, summary, tags, image_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [workspaceId, title, summary || null, tags || null, imageId]
    )
    logger.info(`Inserted new wiki with ID: ${result.rows[0].id}`)
    return result.rows[0].id
  } catch (error) {
    logger.error('Failed to insert wiki:', error)
    throw error
  }
}

async function updateWiki(
  id: number,
  updates: Partial<Omit<WikiBaseRow, 'id' | 'created_at'>>
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
    if (updates.summary !== undefined) {
      updateFields.push(`summary = $${paramIndex++}`)
      updateValues.push(updates.summary)
    }
    if (updates.tags !== undefined) {
      updateFields.push(`tags = $${paramIndex++}`)
      updateValues.push(updates.tags)
    }
    if (updates.image !== undefined) {
      const imageId = await saveImage(updates.image ?? null)
      updateFields.push(`image_id = $${paramIndex++}`)
      updateValues.push(imageId)
    }

    if (updateFields.length === 0) {
      logger.warn('No fields to update for wiki with id:', id)
      return false
    }

    updateFields.push('updated_at = NOW()')

    const sql = `UPDATE wiki SET ${updateFields.join(', ')} WHERE id = $${paramIndex++}`
    updateValues.push(id)

    const result = await db.query(sql, updateValues)
    const hasChanges = (result.affectedRows ?? 0) > 0
    if (hasChanges) {
      logger.info(`Updated wiki with ID: ${id}`)
    }
    return hasChanges
  } catch (error) {
    logger.error('Failed to update wiki:', error)
    throw error
  }
}

async function deleteWiki(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    // 1. 查找知识库下所有文档 ID（通过目录关联）
    const docIdsResult = await db.query<{ doc_id: number }>(
      `SELECT DISTINCT dd.doc_id FROM directory_documents dd
       INNER JOIN wiki_directories wd ON wd.id = dd.directory_id
       WHERE wd.wiki_id = $1`,
      [id]
    )
    const docIds = docIdsResult.rows.map((r) => r.doc_id)

    // 2. 在事务中删除文档及知识库
    await db.transaction(async (tx) => {
      const wikiRow = await tx.query<{ image_id: string | null }>(
        'SELECT image_id FROM wiki WHERE id = $1',
        [id]
      )
      if (docIds.length > 0) {
        // 修复：文档是工作区级实体、可被多个知识库目录共享——只删除不再被任何
        // 知识库目录引用的文档（此前整行删除，连坐其他知识库静默丢文）
        await tx.query(
          `DELETE FROM documents WHERE id = ANY($1) AND NOT EXISTS (
             SELECT 1 FROM directory_documents dd2 WHERE dd2.doc_id = documents.id
           )`,
          [docIds]
        )
      }
      await tx.query('DELETE FROM wiki WHERE id = $1', [id])

      // 知识库封面不再被任何表引用时删除（修复：images 只增不删,换封面/删库后残留）
      const wikiImageId = wikiRow.rows[0]?.image_id ?? null
      if (wikiImageId) {
        const refs = await tx.query<{ c: number }>(
          `SELECT COUNT(*)::int AS c FROM (
             SELECT 1 FROM wiki WHERE image_id = $1
             UNION ALL SELECT 1 FROM documents_content WHERE image_id = $1
             UNION ALL SELECT 1 FROM music_folders WHERE image_id = $1
             UNION ALL SELECT 1 FROM music_tracks WHERE image_id = $1
           ) r`,
          [wikiImageId]
        )
        if (Number(refs.rows[0]?.c ?? 0) === 0) {
          await tx.query('DELETE FROM images WHERE id = $1', [wikiImageId])
        }
      }
    })

    logger.info(`Deleted wiki ${id}; ${docIds.length} associated doc(s) handled (shared kept).`)
    return true
  } catch (error) {
    logger.error('Failed to delete wiki:', error)
    throw error
  }
}

async function getDirectoriesByWikiId(wikiId: number): Promise<WikiDirectoryRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM wiki_directories WHERE wiki_id = $1 ORDER BY sort_order, id'
    const result = await db.query<WikiDirectoryRow>(sql, [wikiId])
    return result.rows
  } catch (error) {
    logger.error('Failed to get directories by wiki id:', error)
    throw error
  }
}

async function addDirectory(
  directory: Omit<WikiDirectoryRow, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const { wiki_id, parent_id, name, sort_order, level } = directory

    const result = await db.query<{ id: number }>(
      'INSERT INTO wiki_directories (wiki_id, parent_id, name, sort_order, level) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [wiki_id, parent_id || null, name, sort_order || 0, level || 0]
    )
    logger.info(`Inserted new directory with ID: ${result.rows[0].id}`)
    return result.rows[0].id
  } catch (error) {
    logger.error('Failed to insert directory:', error)
    throw error
  }
}

async function updateDirectory(
  id: number,
  updates: Partial<Omit<WikiDirectoryRow, 'id' | 'created_at'>>
): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    const updateFields: string[] = []
    const updateValues: (string | number | null)[] = []
    let paramIndex = 1

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`)
      updateValues.push(updates.name)
    }
    if (updates.parent_id !== undefined) {
      updateFields.push(`parent_id = $${paramIndex++}`)
      updateValues.push(updates.parent_id)
    }
    if (updates.sort_order !== undefined) {
      updateFields.push(`sort_order = $${paramIndex++}`)
      updateValues.push(updates.sort_order)
    }
    if (updates.level !== undefined) {
      updateFields.push(`level = $${paramIndex++}`)
      updateValues.push(updates.level)
    }

    if (updateFields.length === 0) {
      logger.warn('No fields to update for directory with id:', id)
      return false
    }

    updateFields.push('updated_at = NOW()')

    const sql = `UPDATE wiki_directories SET ${updateFields.join(', ')} WHERE id = $${paramIndex++}`
    updateValues.push(id)

    const result = await db.query(sql, updateValues)
    const hasChanges = (result.affectedRows ?? 0) > 0
    if (hasChanges) {
      logger.info(`Updated directory with ID: ${id}`)
    }
    return hasChanges
  } catch (error) {
    logger.error('Failed to update directory:', error)
    throw error
  }
}

async function deleteDirectory(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM wiki_directories WHERE id = $1'
    const result = await db.query(sql, [id])
    const changes = result.affectedRows ?? 0
    if (changes > 0) {
      logger.info(`Deleted directory with ID: ${id}, ${changes} row(s) affected.`)
    }
    return changes > 0
  } catch (error) {
    logger.error('Failed to delete directory:', error)
    throw error
  }
}

async function getDocsByDirectoryId(
  directoryId: number
): Promise<{ doc_id: number; sort_order: number }[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql =
      'SELECT doc_id, sort_order FROM directory_documents WHERE directory_id = $1 ORDER BY sort_order, id'
    const result = await db.query<{ doc_id: number; sort_order: number }>(sql, [directoryId])
    return result.rows
  } catch (error) {
    logger.error('Failed to get docs by directory id:', error)
    throw error
  }
}

async function addDocToDirectory(
  directoryId: number,
  docId: number,
  sortOrder: number = 0
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<{ id: number }>(
      'INSERT INTO directory_documents (directory_id, doc_id, sort_order) VALUES ($1, $2, $3) RETURNING id',
      [directoryId, docId, sortOrder]
    )
    logger.info(`Added doc ${docId} to directory ${directoryId} with ID: ${result.rows[0].id}`)
    return result.rows[0].id
  } catch (error) {
    logger.error('Failed to add doc to directory:', error)
    throw error
  }
}

async function removeDocFromDirectory(directoryId: number, docId: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM directory_documents WHERE directory_id = $1 AND doc_id = $2'
    const result = await db.query(sql, [directoryId, docId])
    const changes = result.affectedRows ?? 0
    if (changes > 0) {
      logger.info(`Removed doc ${docId} from directory ${directoryId}`)
    }
    return changes > 0
  } catch (error) {
    logger.error('Failed to remove doc from directory:', error)
    throw error
  }
}

async function getDirectoriesByDocId(docId: number): Promise<WikiDirectoryRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = `
      SELECT wd.* FROM wiki_directories wd
      INNER JOIN directory_documents dd ON wd.id = dd.directory_id
      WHERE dd.doc_id = $1
      ORDER BY wd.sort_order, wd.id
    `
    const result = await db.query<WikiDirectoryRow>(sql, [docId])
    return result.rows
  } catch (error) {
    logger.error('Failed to get directories by doc id:', error)
    throw error
  }
}

export {
  getWikiById,
  getAllWikis,
  addWiki,
  updateWiki,
  deleteWiki,
  getDirectoriesByWikiId,
  addDirectory,
  updateDirectory,
  deleteDirectory,
  getDocsByDirectoryId,
  addDocToDirectory,
  removeDocFromDirectory,
  getDirectoriesByDocId
}
