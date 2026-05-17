import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'
import * as sqlite3 from 'sqlite3'

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
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const sql = `
      SELECT
        w.*,
        COUNT(DISTINCT dn.note_id) as note_count,
        (
          SELECT GROUP_CONCAT(DISTINCT n.tags)
          FROM notes n
          INNER JOIN directory_notes dn2 ON n.id = dn2.note_id
          INNER JOIN wiki_directories wd2 ON dn2.directory_id = wd2.id
          WHERE wd2.wiki_id = w.id AND n.tags IS NOT NULL AND n.tags != ''
        ) as tags
      FROM wiki w
      LEFT JOIN wiki_directories wd ON w.id = wd.wiki_id
      LEFT JOIN directory_notes dn ON wd.id = dn.directory_id
      WHERE w.id = ?
      GROUP BY w.id
    `
    return new Promise((resolve, reject) => {
      db!.get(sql, [id], (err, row: WikiRow) => {
        if (err) {
          logger.error('Error getting wiki by id:', err.message)
          reject(err)
        } else if (row) {
          resolve({
            ...row,
            note_count: row.note_count || 0,
            tags: row.tags || null
          })
        } else {
          resolve(null)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for wiki by id:', error)
    throw error
  }
}

async function getAllWikis(
  page: number = 1,
  pageSize: number = 10
): Promise<PaginatedResult<WikiRow>> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const offset = (page - 1) * pageSize

    const countSql = 'SELECT COUNT(*) as total FROM wiki'
    const dataSql = `
      SELECT
        w.*,
        COUNT(DISTINCT dn.note_id) as note_count,
        (
          SELECT GROUP_CONCAT(DISTINCT n.tags)
          FROM notes n
          INNER JOIN directory_notes dn2 ON n.id = dn2.note_id
          INNER JOIN wiki_directories wd2 ON dn2.directory_id = wd2.id
          WHERE wd2.wiki_id = w.id AND n.tags IS NOT NULL AND n.tags != ''
        ) as tags
      FROM wiki w
      LEFT JOIN wiki_directories wd ON w.id = wd.wiki_id
      LEFT JOIN directory_notes dn ON wd.id = dn.directory_id
      GROUP BY w.id
      ORDER BY w.updated_at DESC
      LIMIT ? OFFSET ?
    `

    return new Promise((resolve, reject) => {
      db!.get(countSql, [], (err, countRow: { total: number } | null) => {
        if (err) {
          logger.error('Error counting wikis:', err.message)
          reject(err)
          return
        }

        const total = countRow?.total || 0

        db!.all(dataSql, [pageSize, offset], (err, rows: WikiRow[]) => {
          if (err) {
            logger.error('Error getting all wikis:', err.message)
            reject(err)
          } else {
            const items = rows.map((row) => ({
              ...row,
              note_count: row.note_count || 0,
              tags: row.tags || null
            }))
            const hasMore = offset + items.length < total
            resolve({ items, hasMore, total })
          }
        })
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for all wikis:', error)
    throw error
  }
}

async function addWiki(
  wiki: Omit<WikiBaseRow, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const { title, summary, image } = wiki

    return new Promise((resolve, reject) => {
      db!.run(
        'INSERT INTO wiki (title, summary, image) VALUES (?, ?, ?)',
        [title, summary || null, image || null],
        function (err) {
          if (err) {
            logger.error('Error inserting wiki:', err.message)
            reject(err)
          } else {
            logger.info(`Inserted new wiki with ID: ${this.lastID}`)
            resolve(this.lastID)
          }
        }
      )
    })
  } catch (error) {
    logger.error('Failed to get database instance for inserting wiki:', error)
    throw error
  }
}

async function updateWiki(
  id: number,
  updates: Partial<Omit<WikiBaseRow, 'id' | 'created_at'>>
): Promise<boolean> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    const updateFields: string[] = []
    const updateValues: (string | number | null)[] = []

    if (updates.title !== undefined) {
      updateFields.push('title = ?')
      updateValues.push(updates.title)
    }
    if (updates.summary !== undefined) {
      updateFields.push('summary = ?')
      updateValues.push(updates.summary)
    }
    if (updates.image !== undefined) {
      updateFields.push('image = ?')
      updateValues.push(updates.image)
    }

    if (updateFields.length === 0) {
      logger.warn('No fields to update for wiki with id:', id)
      return false
    }

    updateFields.push('updated_at = datetime("now")')
    updateValues.push(id)

    const sql = `UPDATE wiki SET ${updateFields.join(', ')} WHERE id = ?`

    return new Promise((resolve) => {
      db!.run(sql, updateValues, function (err) {
        if (err) {
          logger.error('Error updating wiki:', err.message)
          resolve(false)
        } else {
          const hasChanges = this.changes > 0
          if (hasChanges) {
            logger.info(`Updated wiki with ID: ${id}`)
          }
          resolve(hasChanges)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for updating wiki:', error)
    throw error
  }
}

async function deleteWiki(id: number): Promise<boolean> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM wiki WHERE id = ?'
    return new Promise((resolve, reject) => {
      db!.run(sql, [id], function (err) {
        if (err) {
          logger.error('Error deleting wiki:', err.message)
          reject(err)
        } else {
          const changes = this.changes
          if (changes > 0) {
            logger.info(`Deleted wiki with ID: ${id}, ${changes} row(s) affected.`)
          }
          resolve(changes > 0)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for deleting wiki:', error)
    throw error
  }
}

async function getDirectoriesByWikiId(wikiId: number): Promise<WikiDirectoryRow[]> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM wiki_directories WHERE wiki_id = ? ORDER BY sort_order, id'
    return new Promise((resolve, reject) => {
      db!.all(sql, [wikiId], (err, rows: WikiDirectoryRow[]) => {
        if (err) {
          logger.error('Error getting directories by wiki id:', err.message)
          reject(err)
        } else {
          resolve(rows)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for directories by wiki id:', error)
    throw error
  }
}

async function addDirectory(
  directory: Omit<WikiDirectoryRow, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const { wiki_id, parent_id, name, sort_order, level } = directory

    return new Promise((resolve, reject) => {
      db!.run(
        'INSERT INTO wiki_directories (wiki_id, parent_id, name, sort_order, level) VALUES (?, ?, ?, ?, ?)',
        [wiki_id, parent_id || null, name, sort_order || 0, level || 0],
        function (err) {
          if (err) {
            logger.error('Error inserting directory:', err.message)
            reject(err)
          } else {
            logger.info(`Inserted new directory with ID: ${this.lastID}`)
            resolve(this.lastID)
          }
        }
      )
    })
  } catch (error) {
    logger.error('Failed to get database instance for inserting directory:', error)
    throw error
  }
}

async function updateDirectory(
  id: number,
  updates: Partial<Omit<WikiDirectoryRow, 'id' | 'created_at'>>
): Promise<boolean> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    const updateFields: string[] = []
    const updateValues: (string | number | null)[] = []

    if (updates.name !== undefined) {
      updateFields.push('name = ?')
      updateValues.push(updates.name)
    }
    if (updates.parent_id !== undefined) {
      updateFields.push('parent_id = ?')
      updateValues.push(updates.parent_id)
    }
    if (updates.sort_order !== undefined) {
      updateFields.push('sort_order = ?')
      updateValues.push(updates.sort_order)
    }
    if (updates.level !== undefined) {
      updateFields.push('level = ?')
      updateValues.push(updates.level)
    }

    if (updateFields.length === 0) {
      logger.warn('No fields to update for directory with id:', id)
      return false
    }

    updateFields.push('updated_at = datetime("now")')
    updateValues.push(id)

    const sql = `UPDATE wiki_directories SET ${updateFields.join(', ')} WHERE id = ?`

    return new Promise((resolve) => {
      db!.run(sql, updateValues, function (err) {
        if (err) {
          logger.error('Error updating directory:', err.message)
          resolve(false)
        } else {
          const hasChanges = this.changes > 0
          if (hasChanges) {
            logger.info(`Updated directory with ID: ${id}`)
          }
          resolve(hasChanges)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for updating directory:', error)
    throw error
  }
}

async function deleteDirectory(id: number): Promise<boolean> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM wiki_directories WHERE id = ?'
    return new Promise((resolve, reject) => {
      db!.run(sql, [id], function (err) {
        if (err) {
          logger.error('Error deleting directory:', err.message)
          reject(err)
        } else {
          const changes = this.changes
          if (changes > 0) {
            logger.info(`Deleted directory with ID: ${id}, ${changes} row(s) affected.`)
          }
          resolve(changes > 0)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for deleting directory:', error)
    throw error
  }
}

async function getNotesByDirectoryId(
  directoryId: number
): Promise<{ note_id: number; sort_order: number }[]> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const sql =
      'SELECT note_id, sort_order FROM directory_notes WHERE directory_id = ? ORDER BY sort_order, id'
    return new Promise((resolve, reject) => {
      db!.all(sql, [directoryId], (err, rows: { note_id: number; sort_order: number }[]) => {
        if (err) {
          logger.error('Error getting notes by directory id:', err.message)
          reject(err)
        } else {
          resolve(rows)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for notes by directory id:', error)
    throw error
  }
}

async function addNoteToDirectory(
  directoryId: number,
  noteId: number,
  sortOrder: number = 0
): Promise<number> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    return new Promise((resolve, reject) => {
      db!.run(
        'INSERT INTO directory_notes (directory_id, note_id, sort_order) VALUES (?, ?, ?)',
        [directoryId, noteId, sortOrder],
        function (err) {
          if (err) {
            logger.error('Error adding note to directory:', err.message)
            reject(err)
          } else {
            logger.info(`Added note ${noteId} to directory ${directoryId} with ID: ${this.lastID}`)
            resolve(this.lastID)
          }
        }
      )
    })
  } catch (error) {
    logger.error('Failed to get database instance for adding note to directory:', error)
    throw error
  }
}

async function removeNoteFromDirectory(directoryId: number, noteId: number): Promise<boolean> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const sql = 'DELETE FROM directory_notes WHERE directory_id = ? AND note_id = ?'
    return new Promise((resolve, reject) => {
      db!.run(sql, [directoryId, noteId], function (err) {
        if (err) {
          logger.error('Error removing note from directory:', err.message)
          reject(err)
        } else {
          const changes = this.changes
          if (changes > 0) {
            logger.info(`Removed note ${noteId} from directory ${directoryId}`)
          }
          resolve(changes > 0)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for removing note from directory:', error)
    throw error
  }
}

async function getDirectoriesByNoteId(noteId: number): Promise<WikiDirectoryRow[]> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()
    const sql = `
      SELECT wd.* FROM wiki_directories wd
      INNER JOIN directory_notes dn ON wd.id = dn.directory_id
      WHERE dn.note_id = ?
      ORDER BY wd.sort_order, wd.id
    `
    return new Promise((resolve, reject) => {
      db!.all(sql, [noteId], (err, rows: WikiDirectoryRow[]) => {
        if (err) {
          logger.error('Error getting directories by note id:', err.message)
          reject(err)
        } else {
          resolve(rows)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for directories by note id:', error)
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
