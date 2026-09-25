import { dialog } from 'electron'
import * as fs from 'fs'
import crypto from 'crypto'
import { resolve, sep } from 'path'
import { mainMessages } from '../../../main/i18n'
import { settingsStore } from '../../../main/context'
import type { MainIpcHandlers } from '../../../main/plugins/context'
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
} from './db/mapper'

/**
 * 音乐播放器 IPC 处理器表（歌单/曲目管理、封面、元数据解析）。
 *
 * 通道名一律 `plugin:music:<channel>`（命名空间 = manifest.id）；由 `main/index.ts`
 * 交给 `ctx.registerIpc`，插件停用时随 ctx.dispose() 一次性摘除。
 */
export const musicIpcHandlers: MainIpcHandlers = {
  'plugin:music:select-directory': async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: mainMessages().dialog.selectMusicRoot
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  },

  'plugin:music:get-folders': async () => {
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
  },

  'plugin:music:get-tracks': async (_folderId: string) => {
    const rows = await getTracksByFolder(_folderId)
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
  },

  'plugin:music:delete-folder': async (folderId: string) => {
    const folder = await getFolderById(folderId)
    if (folder) {
      // 删除物理文件
      if (fs.existsSync(folder.path)) {
        fs.rmSync(folder.path, { recursive: true, force: true })
      }
    }
    await deleteFolder(folderId)
  },

  'plugin:music:create-folder': async (name: string, description?: string) => {
    const musicDir = settingsStore.get('musicDirectory') as string | undefined
    if (!musicDir) throw new Error(mainMessages().error.musicDirNotSet)

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
  },

  'plugin:music:update-folder': async (
    folderId: string,
    fields: { name?: string; description?: string | null }
  ) => {
    await updateFolder(folderId, fields)
  },

  'plugin:music:update-folder-description': async (
    folderId: string,
    description: string | null
  ) => {
    await updateFolderDescription(folderId, description)
  },

  'plugin:music:select-image': async () => {
    const m = mainMessages().dialog
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: m.selectCoverImage,
      filters: [{ name: m.filterImageFiles, extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const imgPath = result.filePaths[0]
    const ext = imgPath.split('.').pop()?.toLowerCase() || 'jpeg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const base64 = fs.readFileSync(imgPath).toString('base64')
    return `data:${mime};base64,${base64}`
  },

  'plugin:music:save-folder-cover': async (folderId: string, coverDataUrl: string | null) => {
    await saveFolderCover(folderId, coverDataUrl)
  },

  'plugin:music:update-folder-cover': async (folderId: string) => {
    const m = mainMessages().dialog
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: m.selectPlaylistCover,
      filters: [{ name: m.filterImageFiles, extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const imgPath = result.filePaths[0]
    const ext = imgPath.split('.').pop()?.toLowerCase() || 'jpeg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const base64 = fs.readFileSync(imgPath).toString('base64')
    const coverDataUrl = `data:${mime};base64,${base64}`

    return await updateFolderCover(folderId, coverDataUrl)
  },

  'plugin:music:add-tracks': async (folderId: string) => {
    try {
      const folder = await getFolderById(folderId)
      if (!folder) throw new Error(mainMessages().error.playlistNotFound)

      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: mainMessages().dialog.selectMusicFiles,
        filters: [
          {
            name: mainMessages().dialog.filterAudioFiles,
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
        let destPath: string | null = null

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
          destPath = `${folder.path}\\${fileName}`.replace(/\//g, '\\')
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
          // 复制成功但解析失败的文件清理掉（修复：此前留下 UUID 孤儿文件且不入
          // existingHashes，下次再选又复制出新的孤儿）
          if (destPath && fs.existsSync(destPath)) {
            try {
              fs.unlinkSync(destPath)
            } catch {
              // 清理失败不影响流程
            }
          }
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
      console.error('Error in plugin:music:add-tracks:', error)
      throw error
    }
  },

  'plugin:music:delete-track': async (trackId: number) => {
    try {
      const result = await deleteTrackById(trackId)
      if (!result) throw new Error(mainMessages().error.trackNotFound)

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
      console.error('Error in plugin:music:delete-track:', error)
      throw error
    }
  },

  'plugin:music:update-track': async (
    trackId: number,
    fields: {
      title?: string
      artist?: string
      album?: string
    }
  ) => {
    await updateTrack(trackId, fields)
  },

  'plugin:music:update-track-cover': async (trackId: number) => {
    const m = mainMessages().dialog
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: m.selectCoverImage,
      filters: [{ name: m.filterImageFiles, extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const imgPath = result.filePaths[0]
    const ext = imgPath.split('.').pop()?.toLowerCase() || 'jpeg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const base64 = fs.readFileSync(imgPath).toString('base64')
    const coverDataUrl = `data:${mime};base64,${base64}`

    return await updateTrackCover(trackId, coverDataUrl)
  },

  'plugin:music:read-file': async (filePath: string) => {
    // 路径校验：渲染端传入的路径必须位于音乐目录内（防任意文件读取）
    const musicDir = settingsStore.get('musicDirectory') as string | undefined
    if (!musicDir || typeof filePath !== 'string') {
      throw new Error('未设置音乐目录')
    }
    const root = resolve(musicDir)
    const target = resolve(filePath)
    if (target !== root && !target.startsWith(root + sep)) {
      throw new Error(mainMessages().error.fileOutsideMusicDir)
    }
    const buffer = await fs.promises.readFile(target)
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  },

  'plugin:music:toggle-like': async (trackId: number) => {
    return await toggleLikeTrack(trackId)
  },

  'plugin:music:update-last-played': async (trackId: number) => {
    await updateLastPlayed(trackId)
  },

  'plugin:music:get-liked-tracks': async () => {
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
  },

  'plugin:music:get-recently-played': async () => {
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
  }
}

/** 主进程 → 渲染层的音乐事件通道（AI 点播；`main/harness/tools/music.ts` 发送） */
export const MUSIC_PLAY_TRACK_CHANNEL = 'plugin:music:play-track'
