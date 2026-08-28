import { BrowserWindow } from 'electron'
import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'
import { safeSend } from '../../safe-send'

// ============================================================================
// Music Handlers — 渐进式：playlists → tracks
// ============================================================================

async function listPlaylistsHandler(): Promise<string> {
  const { getAllFolders } = await import('../../database/mapper/music')
  const folders = await getAllFolders()
  if (!folders.length) return '还没有任何歌单。'
  const lines = ['🎵 **歌单列表**\n']
  for (const f of folders) {
    lines.push(`  [${f.id.slice(0, 8)}] **${f.name}**（${f.track_count} 首）`)
    if (f.description) lines.push(`    描述：${f.description}`)
    lines.push('')
  }
  return lines.join('\n')
}

async function listTracksHandler(params: {
  playlistName?: string
  limit?: number
}): Promise<string> {
  const { getAllFolders, getTracksByFolder } = await import('../../database/mapper/music')
  const limit = params.limit ?? 20
  const folders = await getAllFolders()
  if (!folders.length) return '还没有任何歌单。'
  let targetFolder = folders[0]
  const playlistName = params.playlistName
  if (playlistName) {
    const found = folders.find((f) => f.name.includes(playlistName))
    if (!found)
      return `未找到名为 "${playlistName}" 的歌单。可用歌单：${folders.map((f) => f.name).join('、')}`
    targetFolder = found
  }
  const tracks = await getTracksByFolder(targetFolder.id)
  if (!tracks.length) return `歌单 "${targetFolder.name}" 中还没有曲目。`
  const shown = tracks.slice(0, limit)
  const lines = [
    `🎵 **${targetFolder.name}**（共 ${tracks.length} 首，显示前 ${shown.length} 首）\n`
  ]
  for (const t of shown) {
    const artist = t.artist || '未知艺术家'
    const duration = t.duration
      ? `${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration % 60)).padStart(2, '0')}`
      : '?'
    const liked = t.liked ? '收藏' : ''
    lines.push(`  [${t.id}] ${t.title} - ${artist} (${duration})${liked}`)
  }
  return lines.join('\n')
}

async function playTrackHandler(params: { trackId: number }): Promise<string> {
  const { getTrackById, getTracksByFolder } = await import('../../database/mapper/music')
  const track = await getTrackById(params.trackId)
  if (!track) return `未找到 ID 为 ${params.trackId} 的曲目。`

  const folderTracks = await getTracksByFolder(track.folder_id)
  const targetIndex = folderTracks.findIndex((t) => t.id === track.id)

  const trackDTOs = folderTracks.map((t) => ({
    id: String(t.id),
    filePath: t.file_path,
    title: t.title,
    artist: t.artist ?? '',
    album: t.album ?? '',
    duration: t.duration ?? 0,
    liked: t.liked,
    coverDataUrl: t.cover_data_url
  }))

  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    safeSend(win.webContents, 'music-play-track', {
      track: {
        id: String(track.id),
        filePath: track.file_path,
        title: track.title,
        artist: track.artist ?? '',
        album: track.album ?? '',
        duration: track.duration ?? 0,
        liked: track.liked,
        coverDataUrl: track.cover_data_url
      },
      folderTracks: trackDTOs,
      folderId: track.folder_id,
      targetIndex: targetIndex >= 0 ? targetIndex : 0
    })
    return `正在播放：${track.title} - ${track.artist ?? '未知艺术家'}`
  }
  return '无法通知播放器窗口。'
}

// ============================================================================
// Tool Builder
// ============================================================================

export function buildManageMusicTool(): StructuredToolInterface {
  return tool(
    async ({ command, ...params }) => {
      switch (command) {
        case 'playlists':
          return listPlaylistsHandler()
        case 'tracks':
          return listTracksHandler(params as Parameters<typeof listTracksHandler>[0])
        case 'play':
          return playTrackHandler(params as Parameters<typeof playTrackHandler>[0])
        default:
          return `未知命令：${command}。支持：playlists, tracks, play`
      }
    },
    {
      name: 'manage_music',
      description:
        '管理音乐播放。\n' +
        '  命令：\n' +
        '    playlists - 列出所有歌单\n' +
        '    tracks - 列出指定歌单中的曲目，可选 playlistName（歌单名模糊匹配，不填返回第一个歌单）, limit（默认20）\n' +
        '    play - 播放指定 ID 的曲目，需要 trackId',
      schema: z.object({
        command: z.enum(['playlists', 'tracks', 'play']).describe('操作类型'),
        playlistName: z
          .string()
          .optional()
          .describe('[tracks] 歌单名称（模糊匹配），不填则返回第一个歌单'),
        limit: z.number().optional().default(20).describe('[tracks] 返回曲目数量上限'),
        trackId: z.number().optional().describe('[play] 曲目 ID')
      })
    }
  )
}
