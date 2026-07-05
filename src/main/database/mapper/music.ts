import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'
import crypto from 'crypto'

export interface MusicFolderRow {
  id: string
  path: string
  name: string
  description: string | null
  track_count: number
  image_id: string | null
  created_at: string
  updated_at: string
}

export interface MusicTrackRow {
  id: number
  file_path: string
  file_hash: string
  folder_id: string
  title: string
  artist: string | null
  album: string | null
  duration: number | null
  liked: boolean
  last_played_at: string | null
  image_id: string | null
  created_at: string
}

/** 计算 base64 数据的 MD5 */
function md5(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex')
}

/** 将 base64 封面图存入 images 表，返回 image_id（MD5） */
async function upsertImage(coverDataUrl: string | null): Promise<string | null> {
  if (!coverDataUrl) return null

  // 提取 base64 部分：data:image/xxx;base64,AAAA...
  const base64 = coverDataUrl.includes(',') ? coverDataUrl.split(',')[1] : coverDataUrl
  const id = md5(base64)

  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.query('INSERT INTO images (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [
      id,
      coverDataUrl
    ])
    return id
  } catch (error) {
    logger.error('Failed to upsert image:', error)
    return null
  }
}

const FOLDER_SELECT = `
  SELECT f.id, f.path, f.name, f.description, f.track_count,
         f.image_id, f.created_at, f.updated_at,
         i.data AS cover_data_url
  FROM music_folders f
  LEFT JOIN images i ON f.image_id = i.id
`

const TRACK_SELECT = `
  SELECT t.id, t.file_path, t.file_hash, t.folder_id, t.title, t.artist, t.album, t.duration,
         t.liked, t.last_played_at,
         t.image_id, t.created_at,
         i.data AS cover_data_url
  FROM music_tracks t
  LEFT JOIN images i ON t.image_id = i.id
`

export async function getAllFolders(): Promise<
  (MusicFolderRow & { cover_data_url: string | null })[]
> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<MusicFolderRow & { cover_data_url: string | null }>(
      `${FOLDER_SELECT} ORDER BY f.created_at`
    )
    return result.rows
  } catch (error) {
    logger.error('Failed to get all music folders:', error)
    throw error
  }
}

export async function getFolderById(
  id: string
): Promise<(MusicFolderRow & { cover_data_url: string | null }) | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<MusicFolderRow & { cover_data_url: string | null }>(
      `${FOLDER_SELECT} WHERE f.id = $1`,
      [id]
    )
    return result.rows.length > 0 ? result.rows[0] : null
  } catch (error) {
    logger.error('Failed to get music folder by id:', error)
    throw error
  }
}

export async function upsertFolder(
  id: string,
  path: string,
  name: string,
  trackCount: number,
  description?: string | null,
  imageId?: string | null
): Promise<void> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.query(
      `INSERT INTO music_folders (id, path, name, track_count, description, image_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET path = $2, name = $3, track_count = $4, description = $5, image_id = $6, updated_at = NOW()`,
      [id, path, name, trackCount, description ?? null, imageId ?? null]
    )
  } catch (error) {
    logger.error('Failed to upsert music folder:', error)
    throw error
  }
}

export async function deleteFolder(id: string): Promise<void> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.query('DELETE FROM music_folders WHERE id = $1', [id])
    // 清除未被任何 track 或 folder 引用的孤立封面图
    await db.query(
      `DELETE FROM images WHERE id NOT IN (
        SELECT DISTINCT image_id FROM music_tracks WHERE image_id IS NOT NULL
        UNION
        SELECT DISTINCT image_id FROM music_folders WHERE image_id IS NOT NULL
      )`
    )
  } catch (error) {
    logger.error('Failed to delete music folder:', error)
    throw error
  }
}

/** 更新歌单描述 */
export async function updateFolderDescription(
  folderId: string,
  description: string | null
): Promise<void> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.query('UPDATE music_folders SET description = $1, updated_at = NOW() WHERE id = $2', [
      description,
      folderId
    ])
  } catch (error) {
    logger.error('Failed to update folder description:', error)
    throw error
  }
}

/** 更新歌单封面 */
export async function updateFolderCover(
  folderId: string,
  coverDataUrl: string | null
): Promise<string | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const imageId = await upsertImage(coverDataUrl)
    await db.query('UPDATE music_folders SET image_id = $1, updated_at = NOW() WHERE id = $2', [
      imageId,
      folderId
    ])
    return coverDataUrl
  } catch (error) {
    logger.error('Failed to update folder cover:', error)
    throw error
  }
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
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sets: string[] = []
    const values: (string | null)[] = []

    if (fields.name !== undefined) {
      values.push(fields.name)
      sets.push(`name = $${values.length}`)
    }
    if (fields.description !== undefined) {
      values.push(fields.description)
      sets.push(`description = $${values.length}`)
    }
    if (sets.length === 0) return

    sets.push('updated_at = NOW()')
    values.push(folderId)
    await db.query(
      `UPDATE music_folders SET ${sets.join(', ')} WHERE id = $${values.length}`,
      values
    )
  } catch (error) {
    logger.error('Failed to update folder:', error)
    throw error
  }
}

export async function getTracksByFolder(folderId: string): Promise<
  (MusicTrackRow & {
    cover_data_url: string | null
  })[]
> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<MusicTrackRow & { cover_data_url: string | null }>(
      `${TRACK_SELECT} WHERE t.folder_id = $1 ORDER BY t.file_path`,
      [folderId]
    )
    return result.rows
  } catch (error) {
    logger.error('Failed to get tracks by folder:', error)
    throw error
  }
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
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.query('BEGIN')
    try {
      const existingHashes = tracks.map((t) => t.fileHash)
      if (existingHashes.length > 0) {
        await db.query(
          `DELETE FROM music_tracks
           WHERE folder_id = $1
             AND file_hash IS NOT NULL
             AND file_hash NOT IN (${existingHashes.map((_, i) => `$${i + 2}`).join(', ')})`,
          [folderId, ...existingHashes]
        )
      } else {
        await db.query('DELETE FROM music_tracks WHERE folder_id = $1', [folderId])
      }

      for (const track of tracks) {
        const imageId = await upsertImage(track.coverDataUrl)
        await db.query(
          `INSERT INTO music_tracks (file_path, file_hash, folder_id, title, artist, album, duration, image_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (folder_id, file_hash) DO UPDATE
           SET title = $4, artist = $5, album = $6, duration = $7, image_id = $8`,
          [
            track.filePath,
            track.fileHash,
            folderId,
            track.title,
            track.artist,
            track.album,
            track.duration,
            imageId
          ]
        )
      }
      await db.query('COMMIT')
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    }
  } catch (error) {
    logger.error('Failed to upsert tracks:', error)
    throw error
  }
}

/** 编辑单首歌曲的元数据 */
export async function updateTrack(
  trackId: number,
  fields: { title?: string; artist?: string; album?: string }
): Promise<void> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sets: string[] = []
    const values: (string | number)[] = []

    if (fields.title !== undefined) {
      values.push(fields.title)
      sets.push(`title = $${values.length}`)
    }
    if (fields.artist !== undefined) {
      values.push(fields.artist)
      sets.push(`artist = $${values.length}`)
    }
    if (fields.album !== undefined) {
      values.push(fields.album)
      sets.push(`album = $${values.length}`)
    }
    if (sets.length === 0) return

    values.push(trackId)
    await db.query(
      `UPDATE music_tracks SET ${sets.join(', ')} WHERE id = $${values.length}`,
      values
    )
  } catch (error) {
    logger.error('Failed to update track:', error)
    throw error
  }
}

/** 更新歌曲封面图片 */
export async function updateTrackCover(
  trackId: number,
  coverDataUrl: string | null
): Promise<string | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const imageId = await upsertImage(coverDataUrl)
    await db.query('UPDATE music_tracks SET image_id = $1 WHERE id = $2', [imageId, trackId])
    return coverDataUrl
  } catch (error) {
    logger.error('Failed to update track cover:', error)
    throw error
  }
}

/** 根据 ID 删除单首歌曲（仅数据库记录） */
export async function deleteTrackById(
  trackId: number
): Promise<{ filePath: string; folderId: string } | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const trackResult = await db.query<{ file_path: string; folder_id: string }>(
      'SELECT file_path, folder_id FROM music_tracks WHERE id = $1',
      [trackId]
    )
    if (trackResult.rows.length === 0) return null
    const { file_path: filePath, folder_id: folderId } = trackResult.rows[0]
    await db.query('DELETE FROM music_tracks WHERE id = $1', [trackId])
    return { filePath, folderId }
  } catch (error) {
    logger.error('Failed to delete track:', error)
    throw error
  }
}

export async function deleteTracksByFolder(folderId: string): Promise<void> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.query('DELETE FROM music_tracks WHERE folder_id = $1', [folderId])
  } catch (error) {
    logger.error('Failed to delete tracks by folder:', error)
    throw error
  }
}

export async function getAllTracks(): Promise<
  (MusicTrackRow & { cover_data_url: string | null })[]
> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<MusicTrackRow & { cover_data_url: string | null }>(
      `${TRACK_SELECT} ORDER BY t.file_path`
    )
    return result.rows
  } catch (error) {
    logger.error('Failed to get all tracks:', error)
    throw error
  }
}

/** 切换曲目的收藏状态（同一文件 hash 的所有曲目同步切换） */
export async function toggleLikeTrack(trackId: number): Promise<boolean> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    // 获取该曲目的 file_hash 和当前 liked 状态
    const trackResult = await db.query<{ file_hash: string; liked: boolean }>(
      'SELECT file_hash, liked FROM music_tracks WHERE id = $1',
      [trackId]
    )
    if (trackResult.rows.length === 0) return false
    const { file_hash, liked } = trackResult.rows[0]
    const newLiked = !liked

    // 同步切换所有相同 file_hash 的曲目
    await db.query('UPDATE music_tracks SET liked = $1 WHERE file_hash = $2', [newLiked, file_hash])
    return newLiked
  } catch (error) {
    logger.error('Failed to toggle like track:', error)
    throw error
  }
}

/** 更新曲目的最后播放时间 */
export async function updateLastPlayed(trackId: number): Promise<void> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    await db.query(`UPDATE music_tracks SET last_played_at = NOW() WHERE id = $1`, [trackId])
  } catch (error) {
    logger.error('Failed to update last played:', error)
    throw error
  }
}

/** 获取收藏的曲目（同文件去重，取最新） */
export async function getLikedTracks(): Promise<
  (MusicTrackRow & { cover_data_url: string | null })[]
> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<MusicTrackRow & { cover_data_url: string | null }>(
      `SELECT * FROM (
         SELECT DISTINCT ON (t.file_hash)
           t.id, t.file_path, t.file_hash, t.folder_id, t.title, t.artist, t.album, t.duration,
           t.liked, t.last_played_at, t.image_id, t.created_at,
           i.data AS cover_data_url
         FROM music_tracks t
         LEFT JOIN images i ON t.image_id = i.id
         WHERE t.liked = TRUE
         ORDER BY t.file_hash, t.created_at DESC
       ) sub
       ORDER BY created_at DESC`
    )
    return result.rows
  } catch (error) {
    logger.error('Failed to get liked tracks:', error)
    throw error
  }
}

/** 获取最近播放的曲目（同文件去重，取最近播放） */
export async function getRecentlyPlayed(
  limit: number = 100
): Promise<(MusicTrackRow & { cover_data_url: string | null })[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<MusicTrackRow & { cover_data_url: string | null }>(
      `SELECT * FROM (
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
       LIMIT $1`,
      [limit]
    )
    return result.rows
  } catch (error) {
    logger.error('Failed to get recently played tracks:', error)
    throw error
  }
}
