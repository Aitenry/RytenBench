import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  getTableColumns,
  inArray,
  notExists,
  sql
} from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import logger from 'electron-log'
import { withOrm } from '../orm'
import {
  directory_documents,
  documents,
  images,
  music_folders,
  music_tracks,
  wiki,
  wiki_directories,
  documents_content
} from '../schema'
import { saveImage } from './image'

type WikiTableRow = typeof wiki.$inferSelect

/** 知识库行（含封面图 data，来自 images 关联；doc_count 为派生字段） */
export type WikiBaseRow = Pick<
  WikiTableRow,
  'id' | 'title' | 'summary' | 'tags' | 'created_at' | 'updated_at'
> & {
  image: string | null
}

export type WikiRow = WikiBaseRow & {
  doc_count: number
}

/** 知识库目录行（字段由 schema 推导） */
export type WikiDirectoryRow = typeof wiki_directories.$inferSelect

export interface PaginatedResult<T> {
  items: T[]
  hasMore: boolean
  total: number
}

/** 知识库列表/详情共用的投影：封面 + 目录下去重文档数 */
const wikiListColumns = {
  id: wiki.id,
  title: wiki.title,
  summary: wiki.summary,
  tags: wiki.tags,
  image: images.data,
  created_at: wiki.created_at,
  updated_at: wiki.updated_at,
  doc_count: countDistinct(directory_documents.doc_id)
}

async function getWikiById(id: number): Promise<WikiRow | null> {
  return withOrm('getWikiById', async (db) => {
    const rows = await db
      .select(wikiListColumns)
      .from(wiki)
      .leftJoin(images, eq(wiki.image_id, images.id))
      .leftJoin(wiki_directories, eq(wiki.id, wiki_directories.wiki_id))
      .leftJoin(directory_documents, eq(wiki_directories.id, directory_documents.directory_id))
      .where(eq(wiki.id, id))
      .groupBy(wiki.id, images.data)

    const row = rows[0]
    if (!row) return null
    return { ...row, doc_count: row.doc_count || 0 }
  })
}

async function getAllWikis(
  page: number = 1,
  pageSize: number = 10
): Promise<PaginatedResult<WikiRow>> {
  return withOrm('getAllWikis', async (db) => {
    const offset = (page - 1) * pageSize

    const countRows = await db.select({ total: count() }).from(wiki)
    const total = Number(countRows[0]?.total) || 0

    const rows = await db
      .select(wikiListColumns)
      .from(wiki)
      .leftJoin(images, eq(wiki.image_id, images.id))
      .leftJoin(wiki_directories, eq(wiki.id, wiki_directories.wiki_id))
      .leftJoin(directory_documents, eq(wiki_directories.id, directory_documents.directory_id))
      .groupBy(wiki.id, images.data)
      .orderBy(desc(wiki.updated_at))
      .limit(pageSize)
      .offset(offset)

    const items = rows.map((row) => ({ ...row, doc_count: row.doc_count || 0 }))
    const hasMore = offset + items.length < total
    return { items, hasMore, total }
  })
}

async function addWiki(
  wikiInput: Omit<WikiBaseRow, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  return withOrm('addWiki', async (db) => {
    const { title, summary, tags, image } = wikiInput

    const imageId = await saveImage(image ?? null)

    const rows = await db
      .insert(wiki)
      .values({ title, summary: summary || null, tags: tags || null, image_id: imageId })
      .returning({ id: wiki.id })
    logger.info(`Inserted new wiki with ID: ${rows[0].id}`)
    return rows[0].id
  })
}

async function updateWiki(
  id: number,
  updates: Partial<Omit<WikiBaseRow, 'id' | 'created_at'>>
): Promise<boolean> {
  return withOrm('updateWiki', async (db) => {
    const patch: PgUpdateSetSource<typeof wiki> = {}

    if (updates.title !== undefined) patch.title = updates.title
    if (updates.summary !== undefined) patch.summary = updates.summary
    if (updates.tags !== undefined) patch.tags = updates.tags
    if (updates.image !== undefined) patch.image_id = await saveImage(updates.image ?? null)

    if (Object.keys(patch).length === 0) {
      logger.warn('No fields to update for wiki with id:', id)
      return false
    }

    patch.updated_at = sql`now()`
    const updated = await db
      .update(wiki)
      .set(patch)
      .where(eq(wiki.id, id))
      .returning({ id: wiki.id })

    const hasChanges = updated.length > 0
    if (hasChanges) {
      logger.info(`Updated wiki with ID: ${id}`)
    }
    return hasChanges
  })
}

async function deleteWiki(id: number): Promise<boolean> {
  return withOrm('deleteWiki', async (db) => {
    // 1. 查找知识库下所有文档 ID（通过目录关联）
    const docIdRows = await db
      .selectDistinct({ doc_id: directory_documents.doc_id })
      .from(directory_documents)
      .innerJoin(wiki_directories, eq(wiki_directories.id, directory_documents.directory_id))
      .where(eq(wiki_directories.wiki_id, id))
    const docIds = docIdRows.map((r) => r.doc_id)

    // 2. 在事务中删除文档及知识库
    await db.transaction(async (tx) => {
      const wikiRows = await tx
        .select({ image_id: wiki.image_id })
        .from(wiki)
        .where(eq(wiki.id, id))

      if (docIds.length > 0) {
        // 修复：文档是工作区级实体、可被多个知识库目录共享——只删除不再被任何
        // 知识库目录引用的文档（此前整行删除，连坐其他知识库静默丢文）
        await tx.delete(documents).where(
          and(
            inArray(documents.id, docIds),
            notExists(
              tx
                .select({ one: sql`1` })
                .from(directory_documents)
                .where(eq(directory_documents.doc_id, documents.id))
            )
          )
        )
      }
      await tx.delete(wiki).where(eq(wiki.id, id))

      // 知识库封面不再被任何表引用时删除（修复：images 只增不删,换封面/删库后残留）
      const wikiImageId = wikiRows[0]?.image_id ?? null
      if (wikiImageId) {
        const [inWiki, inDocContent, inMusicFolders, inMusicTracks] = [
          await tx.select({ c: count() }).from(wiki).where(eq(wiki.image_id, wikiImageId)),
          await tx
            .select({ c: count() })
            .from(documents_content)
            .where(eq(documents_content.image_id, wikiImageId)),
          await tx
            .select({ c: count() })
            .from(music_folders)
            .where(eq(music_folders.image_id, wikiImageId)),
          await tx
            .select({ c: count() })
            .from(music_tracks)
            .where(eq(music_tracks.image_id, wikiImageId))
        ]
        const refs =
          Number(inWiki[0]?.c ?? 0) +
          Number(inDocContent[0]?.c ?? 0) +
          Number(inMusicFolders[0]?.c ?? 0) +
          Number(inMusicTracks[0]?.c ?? 0)
        if (refs === 0) {
          await tx.delete(images).where(eq(images.id, wikiImageId))
        }
      }
    })

    logger.info(`Deleted wiki ${id}; ${docIds.length} associated doc(s) handled (shared kept).`)
    return true
  })
}

async function getDirectoriesByWikiId(wikiId: number): Promise<WikiDirectoryRow[]> {
  return withOrm('getDirectoriesByWikiId', async (db) => {
    return db
      .select()
      .from(wiki_directories)
      .where(eq(wiki_directories.wiki_id, wikiId))
      .orderBy(asc(wiki_directories.sort_order), asc(wiki_directories.id))
  })
}

async function addDirectory(
  directory: Omit<WikiDirectoryRow, 'id' | 'created_at' | 'updated_at'>
): Promise<number> {
  return withOrm('addDirectory', async (db) => {
    const { wiki_id, parent_id, name, sort_order, level } = directory

    const rows = await db
      .insert(wiki_directories)
      .values({
        wiki_id,
        parent_id: parent_id || null,
        name,
        sort_order: sort_order || 0,
        level: level || 0
      })
      .returning({ id: wiki_directories.id })
    logger.info(`Inserted new directory with ID: ${rows[0].id}`)
    return rows[0].id
  })
}

async function updateDirectory(
  id: number,
  updates: Partial<Omit<WikiDirectoryRow, 'id' | 'created_at'>>
): Promise<boolean> {
  return withOrm('updateDirectory', async (db) => {
    const patch: PgUpdateSetSource<typeof wiki_directories> = {}

    if (updates.name !== undefined) patch.name = updates.name
    if (updates.parent_id !== undefined) patch.parent_id = updates.parent_id
    if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order
    if (updates.level !== undefined) patch.level = updates.level

    if (Object.keys(patch).length === 0) {
      logger.warn('No fields to update for directory with id:', id)
      return false
    }

    patch.updated_at = sql`now()`
    const updated = await db
      .update(wiki_directories)
      .set(patch)
      .where(eq(wiki_directories.id, id))
      .returning({ id: wiki_directories.id })

    const hasChanges = updated.length > 0
    if (hasChanges) {
      logger.info(`Updated directory with ID: ${id}`)
    }
    return hasChanges
  })
}

async function deleteDirectory(id: number): Promise<boolean> {
  return withOrm('deleteDirectory', async (db) => {
    const deleted = await db
      .delete(wiki_directories)
      .where(eq(wiki_directories.id, id))
      .returning({ id: wiki_directories.id })
    if (deleted.length > 0) {
      logger.info(`Deleted directory with ID: ${id}, ${deleted.length} row(s) affected.`)
    }
    return deleted.length > 0
  })
}

async function getDocsByDirectoryId(
  directoryId: number
): Promise<{ doc_id: number; sort_order: number | null }[]> {
  return withOrm('getDocsByDirectoryId', async (db) => {
    return db
      .select({ doc_id: directory_documents.doc_id, sort_order: directory_documents.sort_order })
      .from(directory_documents)
      .where(eq(directory_documents.directory_id, directoryId))
      .orderBy(asc(directory_documents.sort_order), asc(directory_documents.id))
  })
}

async function addDocToDirectory(
  directoryId: number,
  docId: number,
  sortOrder: number = 0
): Promise<number> {
  return withOrm('addDocToDirectory', async (db) => {
    const rows = await db
      .insert(directory_documents)
      .values({ directory_id: directoryId, doc_id: docId, sort_order: sortOrder })
      .returning({ id: directory_documents.id })
    logger.info(`Added doc ${docId} to directory ${directoryId} with ID: ${rows[0].id}`)
    return rows[0].id
  })
}

async function removeDocFromDirectory(directoryId: number, docId: number): Promise<boolean> {
  return withOrm('removeDocFromDirectory', async (db) => {
    const deleted = await db
      .delete(directory_documents)
      .where(
        and(
          eq(directory_documents.directory_id, directoryId),
          eq(directory_documents.doc_id, docId)
        )
      )
      .returning({ id: directory_documents.id })
    if (deleted.length > 0) {
      logger.info(`Removed doc ${docId} from directory ${directoryId}`)
    }
    return deleted.length > 0
  })
}

async function getDirectoriesByDocId(docId: number): Promise<WikiDirectoryRow[]> {
  return withOrm('getDirectoriesByDocId', async (db) => {
    return db
      .select({ ...getTableColumns(wiki_directories) })
      .from(wiki_directories)
      .innerJoin(directory_documents, eq(wiki_directories.id, directory_documents.directory_id))
      .where(eq(directory_documents.doc_id, docId))
      .orderBy(asc(wiki_directories.sort_order), asc(wiki_directories.id))
  })
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
