import { getDatabaseInstance, getFlexSearchIndexer } from '../../index'
import logger from 'electron-log'
import * as sqlite3 from 'sqlite3'

export interface NoteRow {
  id: number
  title: string
  summary: string | null
  tags: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface NoteContentRow {
  id: number
  note_id: number
  image: string | null
  content: string | null
  chunk_key: string | null
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
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const sql = `
      SELECT
        n.id, n.title, n.summary, n.tags, n.version, n.created_at, n.updated_at,
        nc.image, nc.content,
        LENGTH(nc.content) as word_count
      FROM notes n
      LEFT JOIN notes_content nc ON n.id = nc.note_id
      WHERE n.id = ?
    `
    return new Promise((resolve, reject) => {
      db!.get(sql, [id], (err, row: NoteWithContent | null) => {
        if (err) {
          logger.error('Error executing query by id:', err.message)
          reject(err)
        } else if (row) {
          resolve({
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
          })
        } else {
          resolve(null)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for id query:', error)
    throw error
  }
}

async function getAllNotes(
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResult<NoteListItem>> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const offset = (page - 1) * pageSize

    const countSql = 'SELECT COUNT(*) as total FROM notes'
    const dataSql = `
      SELECT
        n.id, n.title, n.summary, n.tags, n.version, n.created_at, n.updated_at,
        nc.image,
        LENGTH(nc.content) as word_count
      FROM notes n
      LEFT JOIN notes_content nc ON n.id = nc.note_id
      ORDER BY n.updated_at DESC
      LIMIT ? OFFSET ?
    `

    return new Promise((resolve, reject) => {
      db!.get(countSql, [], (err, countRow: { total: number } | null) => {
        if (err) {
          logger.error('Error counting notes:', err.message)
          reject(err)
          return
        }

        const total = countRow?.total || 0

        db!.all(dataSql, [pageSize, offset], (err, rows: NoteListItem[]) => {
          if (err) {
            logger.error('Error executing query for all notes:', err.message)
            reject(err)
          } else {
            const items = rows.map((row) => ({
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

            resolve({ items, hasMore, total })
          }
        })
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for all notes query:', error)
    throw error
  }
}

async function getNotePage(
  query: string,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResult<NoteListItem>> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const offset = (page - 1) * pageSize

    const indexer = await getFlexSearchIndexer()
    const searchResults = await indexer.search(query)

    if (searchResults.length === 0) {
      return { items: [], hasMore: false, total: 0 }
    }

    const placeholders = searchResults.map(() => '?').join(',')
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

    return new Promise((resolve, reject) => {
      db!.all(dataSql, searchResults, (err, rows: NoteListItem[]) => {
        if (err) {
          logger.error('Error executing search query:', err.message)
          reject(err)
        } else {
          const items = rows.map((row) => ({
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

          resolve({ items: paginatedItems, hasMore, total: items.length })
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for search query:', error)
    throw error
  }
}

async function addNote(
  note: Omit<NoteRow, 'id' | 'created_at' | 'updated_at' | 'version'> & {
    image?: string | null
    content?: string | null
  }
): Promise<number> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const { title, summary, tags, image, content } = note

    return new Promise((resolve, reject) => {
      db!.serialize(() => {
        db!.run(
          'INSERT INTO notes (title, summary, tags) VALUES (?, ?, ?)',
          [title, summary || null, tags || null],
          function (err) {
            if (err) {
              logger.error('Error inserting note:', err.message)
              reject(err)
              return
            }

            const noteId = this.lastID

            db!.run(
              'INSERT INTO notes_content (note_id, image, content) VALUES (?, ?, ?)',
              [noteId, image || null, content || null],
              async function (err) {
                if (err) {
                  logger.error('Error inserting note content:', err.message)
                  reject(err)
                } else {
                  logger.info(`Inserted new note with ID: ${noteId}`)

                  try {
                    const indexer = await getFlexSearchIndexer()
                    await indexer.addDocument({ id: noteId, title, summary })
                    await indexer.commit()
                  } catch (indexError) {
                    logger.error('Error adding note to search index:', indexError)
                  }

                  resolve(noteId)
                }
              }
            )
          }
        )
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for inserting note:', error)
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
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    const noteUpdates: string[] = []
    const noteValues: (string | number | null)[] = []
    const contentUpdates: string[] = []
    const contentValues: (string | number | null)[] = []

    if (updates.title !== undefined) {
      noteUpdates.push('title = ?')
      noteValues.push(updates.title)
    }
    if (updates.summary !== undefined) {
      noteUpdates.push('summary = ?')
      noteValues.push(updates.summary)
    }
    if (updates.tags !== undefined) {
      noteUpdates.push('tags = ?')
      noteValues.push(updates.tags)
    }
    if (updates.image !== undefined) {
      contentUpdates.push('image = ?')
      contentValues.push(updates.image)
    }
    if (updates.content !== undefined) {
      contentUpdates.push('content = ?')
      contentValues.push(updates.content)
    }

    if (noteUpdates.length === 0 && contentUpdates.length === 0) {
      logger.warn('No fields to update for note with id:', id)
      return false
    }

    noteUpdates.push('version = version + 1')
    noteUpdates.push('updated_at = datetime("now")')
    contentUpdates.push('updated_at = datetime("now")')

    return new Promise((resolve) => {
      db!.serialize(async () => {
        let hasChanges = false

        if (noteUpdates.length > 0) {
          const noteSql = `UPDATE notes SET ${noteUpdates.join(', ')} WHERE id = ?`
          noteValues.push(id)

          await new Promise<void>((res, rej) => {
            db!.run(noteSql, noteValues, function (err) {
              if (err) {
                logger.error('Error updating note:', err.message)
                rej(err)
              } else {
                hasChanges = hasChanges || this.changes > 0
                res()
              }
            })
          })
        }

        if (contentUpdates.length > 0) {
          const checkSql = 'SELECT id FROM notes_content WHERE note_id = ?'

          const existingContent = await new Promise<{ id: number } | null>((res, rej) => {
            db!.get(checkSql, [id], (err, row: { id: number }) => {
              if (err) {
                logger.error('Error checking note content:', err.message)
                rej(err)
              } else {
                // 确保返回正确的类型
                res(row ? { id: row.id } : null)
              }
            })
          })

          if (existingContent) {
            const contentSql = `UPDATE notes_content SET ${contentUpdates.join(', ')} WHERE note_id = ?`
            contentValues.push(id)

            await new Promise<void>((res, rej) => {
              db!.run(contentSql, contentValues, function (err) {
                if (err) {
                  logger.error('Error updating note content:', err.message)
                  rej(err)
                } else {
                  hasChanges = hasChanges || this.changes > 0
                  res()
                }
              })
            })
          } else {
            const insertSql = 'INSERT INTO notes_content (note_id, image, content) VALUES (?, ?, ?)'
            const image = updates.image || null
            const content = updates.content || null

            await new Promise<void>((res, rej) => {
              db!.run(insertSql, [id, image, content], function (err) {
                if (err) {
                  logger.error('Error inserting note content:', err.message)
                  rej(err)
                } else {
                  hasChanges = true
                  res()
                }
              })
            })
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

          resolve(true)
        } else {
          logger.warn(`No rows updated for note with ID: ${id}`)
          resolve(false)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for updating note:', error)
    throw error
  }
}

async function deleteNote(id: number): Promise<boolean> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM notes WHERE id = ?'
    return new Promise((resolve, reject) => {
      db!.run(sql, [id], async function (err) {
        if (err) {
          logger.error('Error deleting note:', err.message)
          reject(err)
        } else {
          const changes = this.changes
          if (changes > 0) {
            logger.info(`Deleted note with ID: ${id}, ${changes} row(s) affected.`)

            try {
              const indexer = await getFlexSearchIndexer()
              await indexer.removeDocument(id)
              await indexer.commit()
            } catch (indexError) {
              logger.error('Error deleting note from search index:', indexError)
            }

            resolve(true)
          } else {
            logger.warn(`No rows deleted for note with ID: ${id}`)
            resolve(false)
          }
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for deleting note:', error)
    throw error
  }
}

export { getNoteById, getAllNotes, getNotePage, addNote, updateNote, deleteNote }
