import { dialog, ipcMain } from 'electron'
import * as fs from 'fs'
import crypto from 'crypto'
import { settingsStore } from '../context'
import {
  getAllFolders,
  getFolderById,
  upsertFolder,
  deleteFolder,
  getTracksByFolder,
  upsertTracks,
  updateTrack,
  updateTrackCover,
  updateFolderDescription,
  updateFolderCover,
  saveFolderCover,
  updateFolder,
  toggleLikeTrack,
  updateLastPlayed,
  getLikedTracks,
  getRecentlyPlayed,
  deleteTrackById
} from '../database/mapper/music'

/** 音乐播放器 IPC（歌单/曲目管理、封面、元数据解析） */
export function registerMusicIpc(): void {
  ipcMain.handle('music-select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择音乐根目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('music-get-folders', async () => {
    const rows = await getAllFolders()
    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      name: row.name,
      description: row.description || '',
      track_count: row.track_count,
      coverDataUrl: row.cover_data_url,
      created_at: row.created_at,
      updated_at: row.updated_at
    }))
  })

  ipcMain.handle('music-get-tracks', async (_event, folderId: string) => {
    const rows = await getTracksByFolder(folderId)
    return rows.map((row) => ({
      id: String(row.id),
      filePath: row.file_path,
      title: row.title,
      artist: row.artist || 'Unknown Artist',
      album: row.album || 'Unknown Album',
      duration: row.duration || 0,
      liked: row.liked,
      coverDataUrl: row.cover_data_url
    }))
  })

  ipcMain.handle('music-delete-folder', async (_event, folderId: string) => {
    const folder = await getFolderById(folderId)
    if (folder) {
      // 删除物理文件
      if (fs.existsSync(folder.path)) {
        fs.rmSync(folder.path, { recursive: true, force: true })
      }
    }
    await deleteFolder(folderId)
  })

  ipcMain.handle('music-create-folder', async (_event, name: string, description?: string) => {
    const musicDir = settingsStore.get('musicDirectory') as string | undefined
    if (!musicDir) throw new Error('未设置音乐目录')

    const folderId = crypto.randomUUID()
    const folderPath = `${musicDir}\\${folderId}`.replace(/\//g, '\\')
    fs.mkdirSync(folderPath, { recursive: true })
    await upsertFolder(folderId, folderPath, name, 0, description || '')
    const desc = description || ''
    return {
      id: folderId,
      path: folderPath,
      name,
      description: desc,
      track_count: 0,
      coverDataUrl: null,
      created_at: '',
      updated_at: ''
    }
  })

  ipcMain.handle(
    'music-update-folder',
    async (_event, folderId: string, fields: { name?: string; description?: string | null }) => {
      await updateFolder(folderId, fields)
    }
  )

  ipcMain.handle(
    'music-update-folder-description',
    async (_event, folderId: string, description: string | null) => {
      await updateFolderDescription(folderId, description)
    }
  )

  ipcMain.handle('music-select-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '选择封面图片',
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const imgPath = result.filePaths[0]
    const ext = imgPath.split('.').pop()?.toLowerCase() || 'jpeg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const base64 = fs.readFileSync(imgPath).toString('base64')
    return `data:${mime};base64,${base64}`
  })

  ipcMain.handle(
    'music-save-folder-cover',
    async (_event, folderId: string, coverDataUrl: string | null) => {
      await saveFolderCover(folderId, coverDataUrl)
    }
  )

  ipcMain.handle('music-update-folder-cover', async (_event, folderId: string) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '选择歌单封面',
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const imgPath = result.filePaths[0]
    const ext = imgPath.split('.').pop()?.toLowerCase() || 'jpeg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const base64 = fs.readFileSync(imgPath).toString('base64')
    const coverDataUrl = `data:${mime};base64,${base64}`

    return await updateFolderCover(folderId, coverDataUrl)
  })

  ipcMain.handle('music-add-tracks', async (_event, folderId: string) => {
    try {
      const folder = await getFolderById(folderId)
      if (!folder) throw new Error('歌单不存在')

      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: '选择音乐文件',
        filters: [
          {
            name: '音频文件',
            extensions: ['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a', 'wma', 'ape', 'wv']
          }
        ]
      })
      if (result.canceled || result.filePaths.length === 0) return null

      const { parseFile } = await import('music-metadata')

      // 先读取歌单中已有曲目的 file_hash，用于去重
      const existingRows = await getTracksByFolder(folderId)
      const existingHashes = new Set(
        existingRows.filter((row) => row.file_hash != null).map((row) => row.file_hash)
      )

      const tracks: {
        filePath: string
        fileHash: string
        title: string
        artist: string
        album: string
        duration: number
        coverDataUrl: string | null
      }[] = []
      const skippedNames: string[] = []

      for (const srcPath of result.filePaths) {
        const origName = srcPath.split(/[/\\]/).pop() || 'unknown'

        try {
          // 计算源文件 MD5 用于去重
          const fileBuffer = fs.readFileSync(srcPath)
          const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex')

          // 同歌单内已存在相同文件，跳过
          if (existingHashes.has(fileHash)) {
            skippedNames.push(origName)
            continue
          }

          existingHashes.add(fileHash)

          const ext = srcPath.split('.').pop() || ''
          const uuid = crypto.randomUUID()
          const fileName = `${uuid}.${ext}`
          const destPath = `${folder.path}\\${fileName}`.replace(/\//g, '\\')
          fs.copyFileSync(srcPath, destPath)
          const meta = await parseFile(destPath)
          const { title, artist, album } = meta.common
          const duration = meta.format.duration || 0
          let coverDataUrl: string | null = null
          if (meta.common.picture && meta.common.picture.length > 0) {
            const pic = meta.common.picture[0]
            const mime = pic.format || 'image/jpeg'
            const base64 = Buffer.from(pic.data).toString('base64')
            coverDataUrl = `data:${mime};base64,${base64}`
          }
          tracks.push({
            filePath: destPath,
            fileHash,
            title: title || origName.replace(/\.[^.]+$/, ''),
            artist: artist || 'Unknown Artist',
            album: album || 'Unknown Album',
            duration,
            coverDataUrl
          })
        } catch {
          // skip files that can't be copied or parsed
        }
      }

      if (tracks.length > 0) {
        // 合并已有曲目（含 file_hash），避免 upsertTracks 的 DELETE 逻辑误删原有数据
        const existingTracks = existingRows
          .filter((row) => row.file_hash != null)
          .map((row) => ({
            filePath: row.file_path,
            fileHash: row.file_hash,
            title: row.title,
            artist: row.artist || 'Unknown Artist',
            album: row.album || 'Unknown Album',
            duration: row.duration || 0,
            coverDataUrl: row.cover_data_url
          }))
        const allTracks = [...existingTracks, ...tracks]
        await upsertTracks(folderId, allTracks)
        await upsertFolder(
          folderId,
          folder.path,
          folder.name,
          allTracks.length,
          folder.description,
          folder.image_id
        )
      }

      return { added: tracks, skipped: skippedNames }
    } catch (error) {
      console.error('Error in music-add-tracks:', error)
      throw error
    }
  })

  ipcMain.handle('music-delete-track', async (_event, trackId: number) => {
    try {
      const result = await deleteTrackById(trackId)
      if (!result) throw new Error('歌曲不存在')

      // 删除物理文件
      if (fs.existsSync(result.filePath)) {
        fs.unlinkSync(result.filePath)
      }

      // 更新歌单的 track_count（保留原有的描述和封面）
      const folder = await getFolderById(result.folderId)
      if (folder) {
        const tracks = await getTracksByFolder(result.folderId)
        await upsertFolder(
          result.folderId,
          folder.path,
          folder.name,
          tracks.length,
          folder.description,
          folder.image_id
        )
      }
    } catch (error) {
      console.error('Error in music-delete-track:', error)
      throw error
    }
  })

  ipcMain.handle(
    'music-update-track',
    async (
      _event,
      trackId: number,
      fields: {
        title?: string
        artist?: string
        album?: string
      }
    ) => {
      await updateTrack(trackId, fields)
    }
  )

  ipcMain.handle('music-update-track-cover', async (_event, trackId: number) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '选择封面图片',
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const imgPath = result.filePaths[0]
    const ext = imgPath.split('.').pop()?.toLowerCase() || 'jpeg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const base64 = fs.readFileSync(imgPath).toString('base64')
    const coverDataUrl = `data:${mime};base64,${base64}`

    return await updateTrackCover(trackId, coverDataUrl)
  })

  ipcMain.handle('music-read-file', async (_event, filePath: string) => {
    const buffer = await fs.promises.readFile(filePath)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  })

  ipcMain.handle('music-toggle-like', async (_event, trackId: number) => {
    return await toggleLikeTrack(trackId)
  })

  ipcMain.handle('music-update-last-played', async (_event, trackId: number) => {
    await updateLastPlayed(trackId)
  })

  ipcMain.handle('music-get-liked-tracks', async () => {
    const rows = await getLikedTracks()
    return rows.map((row) => ({
      id: String(row.id),
      filePath: row.file_path,
      title: row.title,
      artist: row.artist || 'Unknown Artist',
      album: row.album || 'Unknown Album',
      duration: row.duration || 0,
      liked: row.liked,
      coverDataUrl: row.cover_data_url
    }))
  })

  ipcMain.handle('music-get-recently-played', async () => {
    const rows = await getRecentlyPlayed(100)
    return rows.map((row) => ({
      id: String(row.id),
      filePath: row.file_path,
      title: row.title,
      artist: row.artist || 'Unknown Artist',
      album: row.album || 'Unknown Album',
      duration: row.duration || 0,
      liked: row.liked,
      coverDataUrl: row.cover_data_url
    }))
  })
}
