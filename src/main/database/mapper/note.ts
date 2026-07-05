import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'
import { saveImage } from './image'

export interface NoteRow {
  id: number
  title: string
  summary: string | null
  tags: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface NoteListItem {
  id: number
  title: string
  image: string | null
  summary: string | null
  tags: string | null
  version: number
  created_at: string
  updated_at: string
  word_count: number
}

export interface NoteWithContent extends NoteListItem {
  content: string | null
}

export interface PaginatedResult<T> {
  items: T[]
  hasMore: boolean
  total: number
}

async function getNoteById(id: number): Promise<NoteWithContent | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = `
      SELECT
        n.id, n.title, n.summary, n.tags, n.version, n.created_at, n.updated_at,
        img.data as image, nc.content,
        LENGTH(nc.content) as word_count
      FROM notes n
      LEFT JOIN notes_content nc ON n.id = nc.note_id
      LEFT JOIN images img ON nc.image_id = img.id
      WHERE n.id = $1
    `
    const result = await db.query<NoteWithContent>(sql, [id])
    if (result.rows.length > 0) {
      const row = result.rows[0]
      return {
        id: row.id,
        title: row.title,
        image: row.image,
        summary: row.summary,
        tags: row.tags,
        version: row.version,
        created_at: row.created_at,
        updated_at: row.updated_at,
        word_count: row.word_count || 0,
        content: row.content
      }
    }
    return null
  } catch (error) {
    logger.error('Failed to get note by id:', error)
    throw error
  }
}

async function getAllNotes(
  page: number = 1,
  pageSize: number = 10,
  excludeWikiId?: number,
  search?: string
): Promise<PaginatedResult<NoteListItem>> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const offset = (page - 1) * pageSize

    const excludeWhere = excludeWikiId ? 'AND dn.note_id IS NULL' : ''
    const searchWhereCount = search
      ? 'AND (n.title ILIKE $' +
        (excludeWikiId ? 2 : 1) +
        ' OR n.summary ILIKE $' +
        (excludeWikiId ? 2 : 1) +
        ' OR n.tags ILIKE $' +
        (excludeWikiId ? 2 : 1) +
        ')'
      : ''
    const searchWhereData = search
      ? 'AND (n.title ILIKE $' +
        (excludeWikiId ? 4 : 3) +
        ' OR n.summary ILIKE $' +
        (excludeWikiId ? 4 : 3) +
        ' OR n.tags ILIKE $' +
        (excludeWikiId ? 4 : 3) +
        ')'
      : ''

    const countJoin = excludeWikiId
      ? 'LEFT JOIN directory_notes dn ON n.id = dn.note_id LEFT JOIN wiki_directories wd ON dn.directory_id = wd.id AND wd.wiki_id = $1'
      : ''
    const countSql = `
      SELECT COUNT(*) as total FROM notes n
      ${countJoin}
      WHERE 1=1 ${excludeWhere} ${searchWhereCount}
    `
    const countParams: (string | number)[] = excludeWikiId ? [excludeWikiId] : []
    if (search) countParams.push(`%${search}%`)
    const countResult = await db.query<{ total: number }>(countSql, countParams)
    const total = Number(countResult.rows[0]?.total) || 0

    const dataJoin = excludeWikiId
      ? 'LEFT JOIN directory_notes dn ON n.id = dn.note_id LEFT JOIN wiki_directories wd ON dn.directory_id = wd.id AND wd.wiki_id = $3'
      : ''
    const dataSql = `
      SELECT
        n.id, n.title, n.summary, n.tags, n.version, n.created_at, n.updated_at,
        img.data as image,
        LENGTH(nc.content) as word_count
      FROM notes n
      LEFT JOIN notes_content nc ON n.id = nc.note_id
      LEFT JOIN images img ON nc.image_id = img.id
      ${dataJoin}
      WHERE 1=1 ${excludeWhere} ${searchWhereData}
      ORDER BY n.updated_at DESC
      LIMIT $1 OFFSET $2
    `

    const dataParams: (string | number)[] = [pageSize, offset]
    if (excludeWikiId) dataParams.push(excludeWikiId)
    if (search) dataParams.push(`%${search}%`)
    const result = await db.query<NoteListItem>(dataSql, dataParams)

    const items = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      image: row.image,
      summary: row.summary,
      tags: row.tags,
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
      word_count: row.word_count || 0
    }))

    const hasMore = offset + items.length < total
    return { items, hasMore, total }
  } catch (error) {
    logger.error('Failed to get all notes:', error)
    throw error
  }
}

async function getNotePage(
  query: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResult<NoteListItem>> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const offset = (page - 1) * pageSize

    // Use ILIKE-based search across title, summary, tags, and note content.
    // PGLite (PostgreSQL WASM) does not include tsvector/tsquery in its minimal build,
    // so we use the universally supported ILIKE operator for substring matching.
    const searchPattern = `%${query}%`

    const countSql = `
      SELECT COUNT(*) as total
      FROM notes n
      LEFT JOIN notes_content nc ON n.id = nc.note_id
      WHERE n.title ILIKE $1
         OR n.summary ILIKE $1
         OR n.tags ILIKE $1
         OR nc.content ILIKE $1
    `
    const countResult = await db.query<{ total: number }>(countSql, [searchPattern])
    const total = Number(countResult.rows[0]?.total) || 0

    if (total === 0) {
      return { items: [], hasMore: false, total: 0 }
    }

    const dataSql = `
      SELECT
        n.id, n.title, n.summary, n.tags, n.version, n.created_at, n.updated_at,
        img.data as image,
        LENGTH(nc.content) as word_count
      FROM notes n
      LEFT JOIN notes_content nc ON n.id = nc.note_id
      LEFT JOIN images img ON nc.image_id = img.id
      WHERE n.title ILIKE $1
         OR n.summary ILIKE $1
         OR n.tags ILIKE $1
         OR nc.content ILIKE $1
      ORDER BY n.updated_at DESC
      LIMIT $2 OFFSET $3
    `

    const result = await db.query<NoteListItem>(dataSql, [searchPattern, pageSize, offset])

    const items = result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      image: row.image,
      summary: row.summary,
      tags: row.tags,
      version: row.version,
      created_at: row.created_at,
      updated_at: row.updated_at,
      word_count: row.word_count || 0
    }))

    const hasMore = offset + items.length < total
    return { items, hasMore, total }
  } catch (error) {
    logger.error('Failed to search notes:', error)
    throw error
  }
}

async function addNote(
  note: Omit<NoteRow, 'id' | 'created_at' | 'updated_at' | 'version'> & {
    image?: string | null
    content?: string | null
  }
): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const { title, summary, tags, image, content } = note

    const imageId = await saveImage(image ?? null)

    const insertResult = await db.query<{ id: number }>(
      'INSERT INTO notes (title, summary, tags) VALUES ($1, $2, $3) RETURNING id',
      [title, summary || null, tags || null]
    )

    const noteId = insertResult.rows[0].id

    await db.query('INSERT INTO notes_content (note_id, image_id, content) VALUES ($1, $2, $3)', [
      noteId,
      imageId,
      content || null
    ])

    logger.info(`Inserted new note with ID: ${noteId}`)
    return noteId
  } catch (error) {
    logger.error('Failed to insert note:', error)
    throw error
  }
}

async function updateNote(
  id: number,
  updates: Partial<
    Omit<NoteRow, 'id' | 'created_at' | 'version'> & {
      image?: string | null
      content?: string | null
    }
  >
): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    const noteUpdates: string[] = []
    const noteValues: (string | number | null)[] = []
    let noteParamIndex = 1

    if (updates.title !== undefined) {
      noteUpdates.push(`title = $${noteParamIndex++}`)
      noteValues.push(updates.title)
    }
    if (updates.summary !== undefined) {
      noteUpdates.push(`summary = $${noteParamIndex++}`)
      noteValues.push(updates.summary)
    }
    if (updates.tags !== undefined) {
      noteUpdates.push(`tags = $${noteParamIndex++}`)
      noteValues.push(updates.tags)
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

    if (noteUpdates.length === 0 && contentUpdates.length === 0) {
      logger.warn('No fields to update for note with id:', id)
      return false
    }

    noteUpdates.push('version = version + 1')
    noteUpdates.push('updated_at = NOW()')

    let hasChanges = false

    if (noteUpdates.length > 0) {
      const noteSql = `UPDATE notes SET ${noteUpdates.join(', ')} WHERE id = $${noteParamIndex++}`
      noteValues.push(id)

      const noteResult = await db.query(noteSql, noteValues)
      hasChanges = hasChanges || (noteResult.affectedRows ?? 0) > 0
    }

    if (contentUpdates.length > 0) {
      // Check if content row exists
      const checkResult = await db.query<{ id: number }>(
        'SELECT id FROM notes_content WHERE note_id = $1',
        [id]
      )

      if (checkResult.rows.length > 0) {
        contentUpdates.push('updated_at = NOW()')
        const contentSql = `UPDATE notes_content SET ${contentUpdates.join(', ')} WHERE note_id = $${contentParamIndex++}`
        contentValues.push(id)

        const contentResult = await db.query(contentSql, contentValues)
        hasChanges = hasChanges || (contentResult.affectedRows ?? 0) > 0
      } else {
        const imageId = await saveImage(updates.image ?? null)
        const content = updates.content || null

        await db.query(
          'INSERT INTO notes_content (note_id, image_id, content) VALUES ($1, $2, $3)',
          [id, imageId, content]
        )
        hasChanges = true
      }
    }

    if (hasChanges) {
      logger.info(`Updated note with ID: ${id}`)
      return true
    }

    logger.warn(`No rows updated for note with ID: ${id}`)
    return false
  } catch (error) {
    logger.error('Failed to update note:', error)
    throw error
  }
}

async function deleteNote(id: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    await db.query('DELETE FROM notes_content WHERE note_id = $1', [id])

    const result = await db.query('DELETE FROM notes WHERE id = $1', [id])
    const changes = result.affectedRows ?? 0

    if (changes > 0) {
      logger.info(`Deleted note with ID: ${id}, ${changes} row(s) affected.`)
      return true
    }

    logger.warn(`No rows deleted for note with ID: ${id}`)
    return false
  } catch (error) {
    logger.error('Failed to delete note:', error)
    throw error
  }
}

async function batchAddNotes(
  notes: Array<
    Omit<NoteRow, 'id' | 'created_at' | 'updated_at' | 'version'> & {
      image?: string | null
      content?: string | null
    }
  >
): Promise<number[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    if (notes.length === 0) return []

    await db.query('BEGIN')

    // Batch insert notes
    const notePlaceholders: string[] = []
    const noteParams: (string | null)[] = []
    let noteIdx = 1

    for (const note of notes) {
      notePlaceholders.push(`($${noteIdx}, $${noteIdx + 1}, $${noteIdx + 2})`)
      noteParams.push(note.title, note.summary || null, note.tags || null)
      noteIdx += 3
    }

    const noteSql = `INSERT INTO notes (title, summary, tags) VALUES ${notePlaceholders.join(', ')} RETURNING id`
    const noteResult = await db.query<{ id: number }>(noteSql, noteParams)
    const ids = noteResult.rows.map((row) => row.id)

    // Batch insert notes_content
    const contentPlaceholders: string[] = []
    const contentParams: (number | string | null)[] = []
    let contentIdx = 1

    for (let i = 0; i < notes.length; i++) {
      const note = notes[i]
      const imageId = await saveImage(note.image ?? null)
      contentPlaceholders.push(`($${contentIdx}, $${contentIdx + 1}, $${contentIdx + 2})`)
      contentParams.push(ids[i], imageId, note.content || null)
      contentIdx += 3
    }

    const contentSql = `INSERT INTO notes_content (note_id, image_id, content) VALUES ${contentPlaceholders.join(', ')}`
    await db.query(contentSql, contentParams)

    await db.query('COMMIT')
    logger.info(`Batch inserted ${notes.length} notes`)
    return ids
  } catch (error) {
    try {
      await (await getDatabaseInstance()).getDatabase().query('ROLLBACK')
    } catch {
      // ignore rollback errors
    }
    logger.error('Failed to batch insert notes:', error)
    throw error
  }
}

async function deleteNotesByTimeRange(startTime: string, endTime: string): Promise<number> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()

    await db.query(
      'DELETE FROM notes_content WHERE note_id IN (SELECT id FROM notes WHERE created_at >= $1 AND created_at <= $2)',
      [startTime, endTime]
    )

    const result = await db.query('DELETE FROM notes WHERE created_at >= $1 AND created_at <= $2', [
      startTime,
      endTime
    ])
    const deleted = result.affectedRows ?? 0
    logger.info(`Deleted ${deleted} notes in time range [${startTime}, ${endTime}]`)
    return deleted
  } catch (error) {
    logger.error('Failed to delete notes by time range:', error)
    throw error
  }
}

export {
  getNoteById,
  getAllNotes,
  getNotePage,
  addNote,
  updateNote,
  deleteNote,
  batchAddNotes,
  deleteNotesByTimeRange
}
