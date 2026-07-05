import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'
import { saveImage } from './image'

export interface WikiBaseRow {
  id: number
  title: string
  summary: string | null
  image: string | null
  created_at: string
  updated_at: string
}

export interface WikiRow extends WikiBaseRow {
  note_count: number
  tags: string | null
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
        w.id, w.title, w.summary, img.data as image, w.created_at, w.updated_at,
        COUNT(DISTINCT dn.note_id) as note_count,
        (
          SELECT STRING_AGG(DISTINCT n.tags, ',')
          FROM notes n
          INNER JOIN directory_notes dn2 ON n.id = dn2.note_id
          INNER JOIN wiki_directories wd2 ON dn2.directory_id = wd2.id
          WHERE wd2.wiki_id = w.id AND n.tags IS NOT NULL AND n.tags != ''
        ) as tags
      FROM wiki w
      LEFT JOIN images img ON w.image_id = img.id
      LEFT JOIN wiki_directories wd ON w.id = wd.wiki_id
      LEFT JOIN directory_notes dn ON wd.id = dn.directory_id
      WHERE w.id = $1
      GROUP BY w.id, img.data
    `
    const result = await db.query<WikiRow>(sql, [id])
    if (result.rows.length > 0) {
      return {
        ...result.rows[0],
        note_count: result.rows[0].note_count || 0,
        tags: result.rows[0].tags || null
      }
    }
    return null
  } catch (error) {
    logger.error('Failed to get wiki by id:', error)
    throw error
  }
}

async function getAllWikis(
  page: number = 1,
  pageSize: number = 10
): Promise<PaginatedResult<WikiRow>> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const offset = (page - 1) * pageSize

    const countResult = await db.query<{ total: number }>('SELECT COUNT(*) as total FROM wiki')
    const total = Number(countResult.rows[0]?.total) || 0

    const dataSql = `
      SELECT
        w.id, w.title, w.summary, img.data as image, w.created_at, w.updated_at,
        COUNT(DISTINCT dn.note_id) as note_count,
        (
          SELECT STRING_AGG(DISTINCT n.tags, ',')
          FROM notes n
          INNER JOIN directory_notes dn2 ON n.id = dn2.note_id
          INNER JOIN wiki_directories wd2 ON dn2.directory_id = wd2.id
          WHERE wd2.wiki_id = w.id AND n.tags IS NOT NULL AND n.tags != ''
        ) as tags
      FROM wiki w
      LEFT JOIN images img ON w.image_id = img.id
      LEFT JOIN wiki_directories wd ON w.id = wd.wiki_id
      LEFT JOIN directory_notes dn ON wd.id = dn.directory_id
      GROUP BY w.id, img.data
      ORDER BY w.updated_at DESC
      LIMIT $1 OFFSET $2
    `

    const result = await db.query<WikiRow>(dataSql, [pageSize, offset])

    const items = result.rows.map((row) => ({
      ...row,
      note_count: row.note_count || 0,
      tags: row.tags || null
    }))
    const hasMore = offset + items.length < total
    return { items, hasMore, total }
  } catch (error) {
    logger.error('Failed to get all wikis:', error)
    throw error
  }
}

async function addWiki(
  wiki: Omit<WikiBaseRow, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const { title, summary, image } = wiki

    const imageId = await saveImage(image ?? null)

    const result = await db.query<{ id: number }>(
      'INSERT INTO wiki (title, summary, image_id) VALUES ($1, $2, $3) RETURNING id',
      [title, summary || null, imageId]
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
    const sql = 'DELETE FROM wiki WHERE id = $1'
    const result = await db.query(sql, [id])
    const changes = result.affectedRows ?? 0
    if (changes > 0) {
      logger.info(`Deleted wiki with ID: ${id}, ${changes} row(s) affected.`)
    }
    return changes > 0
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

async function getNotesByDirectoryId(
  directoryId: number
): Promise<{ note_id: number; sort_order: number }[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql =
      'SELECT note_id, sort_order FROM directory_notes WHERE directory_id = $1 ORDER BY sort_order, id'
    const result = await db.query<{ note_id: number; sort_order: number }>(sql, [directoryId])
    return result.rows
  } catch (error) {
    logger.error('Failed to get notes by directory id:', error)
    throw error
  }
}

async function addNoteToDirectory(
  directoryId: number,
  noteId: number,
  sortOrder: number = 0
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<{ id: number }>(
      'INSERT INTO directory_notes (directory_id, note_id, sort_order) VALUES ($1, $2, $3) RETURNING id',
      [directoryId, noteId, sortOrder]
    )
    logger.info(`Added note ${noteId} to directory ${directoryId} with ID: ${result.rows[0].id}`)
    return result.rows[0].id
  } catch (error) {
    logger.error('Failed to add note to directory:', error)
    throw error
  }
}

async function removeNoteFromDirectory(directoryId: number, noteId: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM directory_notes WHERE directory_id = $1 AND note_id = $2'
    const result = await db.query(sql, [directoryId, noteId])
    const changes = result.affectedRows ?? 0
    if (changes > 0) {
      logger.info(`Removed note ${noteId} from directory ${directoryId}`)
    }
    return changes > 0
  } catch (error) {
    logger.error('Failed to remove note from directory:', error)
    throw error
  }
}

async function getDirectoriesByNoteId(noteId: number): Promise<WikiDirectoryRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = `
      SELECT wd.* FROM wiki_directories wd
      INNER JOIN directory_notes dn ON wd.id = dn.directory_id
      WHERE dn.note_id = $1
      ORDER BY wd.sort_order, wd.id
    `
    const result = await db.query<WikiDirectoryRow>(sql, [noteId])
    return result.rows
  } catch (error) {
    logger.error('Failed to get directories by note id:', error)
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
  getNotesByDirectoryId,
  addNoteToDirectory,
  removeNoteFromDirectory,
  getDirectoriesByNoteId
}
