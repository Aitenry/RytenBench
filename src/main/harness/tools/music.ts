import { BrowserWindow } from 'electron'
import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'
import { safeSend } from '../../safe-send'
import { mainFormat, mainPlural } from '../../i18n'
import { getPlannerToolTexts } from '../../i18n/tool-results-planner'

// ============================================================================
// Music Handlers — 渐进式：playlists → tracks
// ============================================================================

async function listPlaylistsHandler(): Promise<string> {
  const tr = getPlannerToolTexts()
  const { getAllFolders } = await import('../../database/mapper/music')
  const folders = await getAllFolders()
  if (!folders.length) return tr.music.playlistsEmpty
  const lines = [tr.music.playlistsHeader]
  for (const f of folders) {
    lines.push(
      mainFormat(tr.music.playlistLine, {
        id: f.id.slice(0, 8),
        name: f.name,
        trackCount: f.track_count
      })
    )
    if (f.description)
      lines.push(mainFormat(tr.music.playlistDescription, { description: f.description }))
    lines.push('')
  }
  return lines.join('\n')
}

async function listTracksHandler(params: {
  playlistName?: string
  limit?: number
}): Promise<string> {
  const tr = getPlannerToolTexts()
  const { getAllFolders, getTracksByFolder } = await import('../../database/mapper/music')
  const limit = params.limit ?? 20
  const folders = await getAllFolders()
  if (!folders.length) return tr.music.playlistsEmpty
  let targetFolder = folders[0]
  const playlistName = params.playlistName
  if (playlistName) {
    const found = folders.find((f) => f.name.includes(playlistName))
    if (!found)
      return mainFormat(tr.music.playlistNotFound, {
        name: playlistName,
        available: folders.map((f) => f.name).join(tr.music.availablePlaylistsSeparator)
      })
    targetFolder = found
  }
  const tracks = await getTracksByFolder(targetFolder.id)
  if (!tracks.length) return mainFormat(tr.music.playlistTracksEmpty, { name: targetFolder.name })
  const shown = tracks.slice(0, limit)
  const lines = [
    mainFormat(
      mainPlural(tr.music.trackListHeader_one, tr.music.trackListHeader_other, tracks.length),
      { name: targetFolder.name, shown: shown.length }
    )
  ]
  for (const t of shown) {
    const artist = t.artist || tr.music.unknownArtist
    const duration = t.duration
      ? `${Math.floor(t.duration / 60)}:${String(Math.floor(t.duration % 60)).padStart(2, '0')}`
      : '?'
    const liked = t.liked ? tr.music.liked : ''
    lines.push(
      mainFormat(tr.music.trackLine, {
        id: t.id,
        title: t.title,
        artist,
        duration,
        liked
      })
    )
  }
  return lines.join('\n')
}

async function playTrackHandler(params: { trackId: number }): Promise<string> {
  const tr = getPlannerToolTexts()
  const { getTrackById, getTracksByFolder } = await import('../../database/mapper/music')
  const track = await getTrackById(params.trackId)
  if (!track) return mainFormat(tr.music.trackNotFound, { id: params.trackId })

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
    return mainFormat(tr.music.nowPlaying, {
      title: track.title,
      artist: track.artist ?? tr.music.unknownArtist
    })
  }
  return tr.music.noPlayerWindow
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
          return mainFormat(getPlannerToolTexts().common.unknownCommand, {
            command,
            supported: 'playlists, tracks, play'
          })
      }
    },
    {
      name: 'manage_music',
      description:
        'Manage music playback.\n' +
        '  Commands:\n' +
        '    playlists - List all playlists\n' +
        '    tracks - List the tracks of a playlist; optional playlistName (fuzzy match on the playlist name, defaults to the first playlist), limit (default 20)\n' +
        '    play - Play the track with the given ID; requires trackId',
      schema: z.object({
        command: z.enum(['playlists', 'tracks', 'play']).describe('Operation type'),
        playlistName: z
          .string()
          .optional()
          .describe('[tracks] Playlist name (fuzzy match); defaults to the first playlist'),
        limit: z
          .number()
          .int()
          .min(1)
          .optional()
          .default(20)
          .describe('[tracks] Max number of tracks to return, default 20'),
        trackId: z.number().optional().describe('[play] Track ID')
      })
    }
  )
}
