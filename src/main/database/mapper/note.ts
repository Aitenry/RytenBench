import { getDatabaseInstance, getFlexSearchIndexer } from '../../index'
import logger from 'electron-log'

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
        nc.image, nc.content,
        LENGTH(nc.content) as word_count
      FROM notes n
      LEFT JOIN notes_content nc ON n.id = nc.note_id
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
  pageSize: number = 10
): Promise<PaginatedResult<NoteListItem>> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const offset = (page - 1) * pageSize

    const countResult = await db.query<{ total: number }>('SELECT COUNT(*) as total FROM notes')
    const total = Number(countResult.rows[0]?.total) || 0

    const dataSql = `
      SELECT
        n.id, n.title, n.summary, n.tags, n.version, n.created_at, n.updated_at,
        nc.image,
        LENGTH(nc.content) as word_count
      FROM notes n
      LEFT JOIN notes_content nc ON n.id = nc.note_id
      ORDER BY n.updated_at DESC
      LIMIT $1 OFFSET $2
    `

    const result = await db.query<NoteListItem>(dataSql, [pageSize, offset])

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

    const indexer = await getFlexSearchIndexer()
    const searchResults = await indexer.search(query)

    if (searchResults.length === 0) {
      return { items: [], hasMore: false, total: 0 }
    }

    // Build parameterized IN clause
    const placeholders = searchResults.map((_, i) => `$${i + 1}`).join(',')
    const dataSql = `
      SELECT
        n.id, n.title, n.summary, n.tags, n.version, n.created_at, n.updated_at,
        nc.image,
        LENGTH(nc.content) as word_count
      FROM notes n
      LEFT JOIN notes_content nc ON n.id = nc.note_id
      WHERE n.id IN (${placeholders})
      ORDER BY n.updated_at DESC
    `

    const result = await db.query<NoteListItem>(dataSql, searchResults)

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

    const paginatedItems = items.slice(offset, offset + pageSize)
    const hasMore = offset + paginatedItems.length < items.length

    return { items: paginatedItems, hasMore, total: items.length }
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

    const insertResult = await db.query<{ id: number }>(
      'INSERT INTO notes (title, summary, tags) VALUES ($1, $2, $3) RETURNING id',
      [title, summary || null, tags || null]
    )

    const noteId = insertResult.rows[0].id

    await db.query('INSERT INTO notes_content (note_id, image, content) VALUES ($1, $2, $3)', [
      noteId,
      image || null,
      content || null
    ])

    logger.info(`Inserted new note with ID: ${noteId}`)

    try {
      const indexer = await getFlexSearchIndexer()
      await indexer.addDocument({ id: noteId, title, summary })
      await indexer.commit()
    } catch (indexError) {
      logger.error('Error adding note to search index:', indexError)
    }

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
      contentUpdates.push(`image = $${contentParamIndex++}`)
      contentValues.push(updates.image)
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
        const image = updates.image || null
        const content = updates.content || null

        await db.query('INSERT INTO notes_content (note_id, image, content) VALUES ($1, $2, $3)', [
          id,
          image,
          content
        ])
        hasChanges = true
      }
    }

    if (hasChanges) {
      logger.info(`Updated note with ID: ${id}`)

      try {
        const indexer = await getFlexSearchIndexer()
        const note = await getNoteById(id)
        if (note) {
          await indexer.updateDocument({
            id: note.id,
            title: note.title,
            summary: note.summary
          })
          await indexer.commit()
        }
      } catch (indexError) {
        logger.error('Error updating note in search index:', indexError)
      }

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
    const sql = 'DELETE FROM notes WHERE id = $1'
    const result = await db.query(sql, [id])
    const changes = result.affectedRows ?? 0

    if (changes > 0) {
      logger.info(`Deleted note with ID: ${id}, ${changes} row(s) affected.`)

      try {
        const indexer = await getFlexSearchIndexer()
        await indexer.removeDocument(id)
        await indexer.commit()
      } catch (indexError) {
        logger.error('Error deleting note from search index:', indexError)
      }

      return true
    }

    logger.warn(`No rows deleted for note with ID: ${id}`)
    return false
  } catch (error) {
    logger.error('Failed to delete note:', error)
    throw error
  }
}

export { getNoteById, getAllNotes, getNotePage, addNote, updateNote, deleteNote }
