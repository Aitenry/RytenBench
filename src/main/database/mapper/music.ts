import crypto from 'crypto'
import { and, asc, count, eq, isNotNull, notInArray, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import logger from 'electron-log'
import { withOrm, type Orm } from '../orm'
import { images, music_folders, music_tracks } from '../schema'

/** 歌单行（字段由 schema 推导） */
export type MusicFolderRow = typeof music_folders.$inferSelect
/** 曲目行（字段由 schema 推导） */
export type MusicTrackRow = typeof music_tracks.$inferSelect

/** 歌单/曲目查询结果附带封面 data URL */
type WithCover<T> = T & { cover_data_url: string | null }

/** 计算 base64 数据的 MD5 */
function md5(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex')
}

/** 将 base64 封面图存入 images 表，返回 image_id（MD5） */
async function upsertImage(coverDataUrl: string | null, db: Orm): Promise<string | null> {
  if (!coverDataUrl) return null

  // 提取 base64 部分：data:image/xxx;base64,AAAA...
  const base64 = coverDataUrl.includes(',') ? coverDataUrl.split(',')[1] : coverDataUrl
  const id = md5(base64)

  try {
    await db.insert(images).values({ id, data: coverDataUrl }).onConflictDoNothing()
    return id
  } catch (error) {
    logger.error('Failed to upsert image:', error)
    return null
  }
}

/** 歌单/曲目投影：整行 + 封面 data（LEFT JOIN images） */
const folderColumns = {
  id: music_folders.id,
  path: music_folders.path,
  name: music_folders.name,
  description: music_folders.description,
  track_count: music_folders.track_count,
  image_id: music_folders.image_id,
  created_at: music_folders.created_at,
  updated_at: music_folders.updated_at,
  cover_data_url: images.data
}

const trackColumns = {
  id: music_tracks.id,
  file_path: music_tracks.file_path,
  file_hash: music_tracks.file_hash,
  folder_id: music_tracks.folder_id,
  title: music_tracks.title,
  artist: music_tracks.artist,
  album: music_tracks.album,
  duration: music_tracks.duration,
  liked: music_tracks.liked,
  last_played_at: music_tracks.last_played_at,
  image_id: music_tracks.image_id,
  created_at: music_tracks.created_at,
  cover_data_url: images.data
}

export async function getAllFolders(): Promise<WithCover<MusicFolderRow>[]> {
  return withOrm('getAllFolders', async (db) => {
    return db
      .select(folderColumns)
      .from(music_folders)
      .leftJoin(images, eq(music_folders.image_id, images.id))
      .orderBy(asc(music_folders.created_at))
  })
}

export async function getFolderById(id: string): Promise<WithCover<MusicFolderRow> | null> {
  return withOrm('getFolderById', async (db) => {
    const rows = await db
      .select(folderColumns)
      .from(music_folders)
      .leftJoin(images, eq(music_folders.image_id, images.id))
      .where(eq(music_folders.id, id))
      .limit(1)
    return rows[0] ?? null
  })
}

export async function upsertFolder(
  id: string,
  path: string,
  name: string,
  trackCount: number,
  description?: string | null,
  imageId?: string | null
): Promise<void> {
  await withOrm('upsertFolder', async (db) => {
    const values = {
      path,
      name,
      track_count: trackCount,
      description: description ?? null,
      image_id: imageId ?? null
    }
    await db
      .insert(music_folders)
      .values({ id, ...values })
      .onConflictDoUpdate({
        target: music_folders.id,
        set: { ...values, updated_at: sql`now()` }
      })
  })
}

export async function deleteFolder(id: string): Promise<void> {
  await withOrm('deleteFolder', async (db) => {
    await db.transaction(async (tx) => {
      const folderRows = await tx
        .select({ image_id: music_folders.image_id })
        .from(music_folders)
        .where(eq(music_folders.id, id))
      const folderImageId = folderRows[0]?.image_id ?? null

      await tx.delete(music_folders).where(eq(music_folders.id, id))

      if (folderImageId) {
        // 只清理本歌单的封面（修复：此前做「全局孤儿图片清理」，把文档/知识库封面也
        // 纳入待删集——music 侧 md5 只 hash base64 段、image.ts hash 整个 dataUrl，
        // 同一图两边 id 必不同 → 外键冲突抛错，而歌单行已删；现在仅当封面不再被任何
        // 曲目/歌单引用时才删除，且整体在事务内）
        const inTracks = await tx
          .select({ c: count() })
          .from(music_tracks)
          .where(eq(music_tracks.image_id, folderImageId))
        const inFolders = await tx
          .select({ c: count() })
          .from(music_folders)
          .where(eq(music_folders.image_id, folderImageId))
        const refs = Number(inTracks[0]?.c ?? 0) + Number(inFolders[0]?.c ?? 0)
        if (refs === 0) {
          await tx.delete(images).where(eq(images.id, folderImageId))
        }
      }
    })
  })
}

/** 更新歌单描述 */
export async function updateFolderDescription(
  folderId: string,
  description: string | null
): Promise<void> {
  await withOrm('updateFolderDescription', async (db) => {
    await db
      .update(music_folders)
      .set({ description, updated_at: sql`now()` })
      .where(eq(music_folders.id, folderId))
  })
}

/** 更新歌单封面 */
export async function updateFolderCover(
  folderId: string,
  coverDataUrl: string | null
): Promise<string | null> {
  return withOrm('updateFolderCover', async (db) => {
    const imageId = await upsertImage(coverDataUrl, db)
    await db
      .update(music_folders)
      .set({ image_id: imageId, updated_at: sql`now()` })
      .where(eq(music_folders.id, folderId))
    return coverDataUrl
  })
}

/** 保存歌单封面（直接传入 base64，不弹窗） */
export async function saveFolderCover(
  folderId: string,
  coverDataUrl: string | null
): Promise<void> {
  await updateFolderCover(folderId, coverDataUrl)
}

/** 更新歌单名称和描述 */
export async function updateFolder(
  folderId: string,
  fields: { name?: string; description?: string | null }
): Promise<void> {
  await withOrm('updateFolder', async (db) => {
    const patch: PgUpdateSetSource<typeof music_folders> = {}
    if (fields.name !== undefined) patch.name = fields.name
    if (fields.description !== undefined) patch.description = fields.description
    if (Object.keys(patch).length === 0) return

    patch.updated_at = sql`now()`
    await db.update(music_folders).set(patch).where(eq(music_folders.id, folderId))
  })
}

export async function getTrackById(trackId: number): Promise<WithCover<MusicTrackRow> | null> {
  return withOrm('getTrackById', async (db) => {
    const rows = await db
      .select(trackColumns)
      .from(music_tracks)
      .leftJoin(images, eq(music_tracks.image_id, images.id))
      .where(eq(music_tracks.id, trackId))
      .limit(1)
    return rows[0] ?? null
  })
}

export async function getTracksByFolder(folderId: string): Promise<WithCover<MusicTrackRow>[]> {
  return withOrm('getTracksByFolder', async (db) => {
    return db
      .select(trackColumns)
      .from(music_tracks)
      .leftJoin(images, eq(music_tracks.image_id, images.id))
      .where(eq(music_tracks.folder_id, folderId))
      .orderBy(asc(music_tracks.file_path))
  })
}

export async function upsertTracks(
  folderId: string,
  tracks: {
    filePath: string
    fileHash: string
    title: string
    artist: string
    album: string
    duration: number
    coverDataUrl: string | null
  }[]
): Promise<void> {
  await withOrm('upsertTracks', async (db) => {
    // 原实现用显式 BEGIN/COMMIT/ROLLBACK，这里换成 drizzle 事务（失败自动回滚）
    await db.transaction(async (tx) => {
      const existingHashes = tracks.map((t) => t.fileHash)
      if (existingHashes.length > 0) {
        await tx
          .delete(music_tracks)
          .where(
            and(
              eq(music_tracks.folder_id, folderId),
              isNotNull(music_tracks.file_hash),
              notInArray(music_tracks.file_hash, existingHashes)
            )
          )
      } else {
        await tx.delete(music_tracks).where(eq(music_tracks.folder_id, folderId))
      }

      for (const track of tracks) {
        const imageId = await upsertImage(track.coverDataUrl, tx)
        const values = {
          file_path: track.filePath,
          file_hash: track.fileHash,
          folder_id: folderId,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
          image_id: imageId
        }
        await tx
          .insert(music_tracks)
          .values(values)
          .onConflictDoUpdate({
            target: [music_tracks.folder_id, music_tracks.file_hash],
            set: {
              title: values.title,
              artist: values.artist,
              album: values.album,
              duration: values.duration,
              image_id: values.image_id
            }
          })
      }
    })
  })
}

/** 编辑单首歌曲的元数据 */
export async function updateTrack(
  trackId: number,
  fields: { title?: string; artist?: string; album?: string }
): Promise<void> {
  await withOrm('updateTrack', async (db) => {
    const patch: PgUpdateSetSource<typeof music_tracks> = {}
    if (fields.title !== undefined) patch.title = fields.title
    if (fields.artist !== undefined) patch.artist = fields.artist
    if (fields.album !== undefined) patch.album = fields.album
    if (Object.keys(patch).length === 0) return

    await db.update(music_tracks).set(patch).where(eq(music_tracks.id, trackId))
  })
}

/** 更新歌曲封面图片 */
export async function updateTrackCover(
  trackId: number,
  coverDataUrl: string | null
): Promise<string | null> {
  return withOrm('updateTrackCover', async (db) => {
    const imageId = await upsertImage(coverDataUrl, db)
    await db.update(music_tracks).set({ image_id: imageId }).where(eq(music_tracks.id, trackId))
    return coverDataUrl
  })
}

/** 根据 ID 删除单首歌曲（仅数据库记录） */
export async function deleteTrackById(
  trackId: number
): Promise<{ filePath: string; folderId: string } | null> {
  return withOrm('deleteTrackById', async (db) => {
    const rows = await db
      .select({ file_path: music_tracks.file_path, folder_id: music_tracks.folder_id })
      .from(music_tracks)
      .where(eq(music_tracks.id, trackId))
    if (rows.length === 0) return null
    const { file_path: filePath, folder_id: folderId } = rows[0]
    await db.delete(music_tracks).where(eq(music_tracks.id, trackId))
    return { filePath, folderId }
  })
}

export async function deleteTracksByFolder(folderId: string): Promise<void> {
  await withOrm('deleteTracksByFolder', async (db) => {
    await db.delete(music_tracks).where(eq(music_tracks.folder_id, folderId))
  })
}

export async function getAllTracks(): Promise<WithCover<MusicTrackRow>[]> {
  return withOrm('getAllTracks', async (db) => {
    return db
      .select(trackColumns)
      .from(music_tracks)
      .leftJoin(images, eq(music_tracks.image_id, images.id))
      .orderBy(asc(music_tracks.file_path))
  })
}

/** 切换曲目的收藏状态（同一文件 hash 的所有曲目同步切换） */
export async function toggleLikeTrack(trackId: number): Promise<boolean> {
  return withOrm('toggleLikeTrack', async (db) => {
    // 获取该曲目的 file_hash 和当前 liked 状态
    const rows = await db
      .select({ file_hash: music_tracks.file_hash, liked: music_tracks.liked })
      .from(music_tracks)
      .where(eq(music_tracks.id, trackId))
    if (rows.length === 0) return false
    const { file_hash, liked } = rows[0]
    const newLiked = !liked

    // 同步切换所有相同 file_hash 的曲目
    await db
      .update(music_tracks)
      .set({ liked: newLiked })
      .where(eq(music_tracks.file_hash, file_hash))
    return newLiked
  })
}

/** 更新曲目的最后播放时间 */
export async function updateLastPlayed(trackId: number): Promise<void> {
  await withOrm('updateLastPlayed', async (db) => {
    await db
      .update(music_tracks)
      .set({ last_played_at: sql`now()` })
      .where(eq(music_tracks.id, trackId))
  })
}

/** 获取收藏的曲目（同文件去重，取最新） */
export async function getLikedTracks(): Promise<WithCover<MusicTrackRow>[]> {
  return withOrm('getLikedTracks', async (db) => {
    // DISTINCT ON 无法用查询构造器表达，保留原 SQL（仅做列名补全，语义不变）
    const result = await db.execute<WithCover<MusicTrackRow>>(sql`
      SELECT * FROM (
        SELECT DISTINCT ON (t.file_hash)
          t.id, t.file_path, t.file_hash, t.folder_id, t.title, t.artist, t.album, t.duration,
          t.liked, t.last_played_at, t.image_id, t.created_at,
          i.data AS cover_data_url
        FROM music_tracks t
        LEFT JOIN images i ON t.image_id = i.id
        WHERE t.liked = TRUE
        ORDER BY t.file_hash, t.created_at DESC
      ) sub
      ORDER BY created_at DESC
    `)
    return result.rows
  })
}

/** 获取最近播放的曲目（同文件去重，取最近播放） */
export async function getRecentlyPlayed(limit: number = 100): Promise<WithCover<MusicTrackRow>[]> {
  return withOrm('getRecentlyPlayed', async (db) => {
    // DISTINCT ON 无法用查询构造器表达，保留原 SQL（仅做列名补全，语义不变）
    const result = await db.execute<WithCover<MusicTrackRow>>(sql`
      SELECT * FROM (
        SELECT DISTINCT ON (t.file_hash)
          t.id, t.file_path, t.file_hash, t.folder_id, t.title, t.artist, t.album, t.duration,
          t.liked, t.last_played_at, t.image_id, t.created_at,
          i.data AS cover_data_url
        FROM music_tracks t
        LEFT JOIN images i ON t.image_id = i.id
        WHERE t.last_played_at IS NOT NULL
        ORDER BY t.file_hash, t.last_played_at DESC
      ) sub
      ORDER BY last_played_at DESC
      LIMIT ${limit}
    `)
    return result.rows
  })
}
