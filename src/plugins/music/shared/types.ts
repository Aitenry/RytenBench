export interface Track {
  id: string
  filePath: string
  title: string
  artist: string
  album: string
  duration: number
  liked: boolean
  coverDataUrl: string | null
}

/** 循环策略：只保留取下一曲的行为，展示名走词条（PlayerControls 的 MODE_LABEL_KEY） */
export const REPEAT_STRATEGIES = {
  all: {
    getNext(currentIndex: number, playlistLength: number): number {
      const next = currentIndex + 1
      return next >= playlistLength ? 0 : next
    }
  },
  one: {
    getNext(currentIndex: number, _playlistLength: number): number {
      void _playlistLength
      return currentIndex
    }
  },
  shuffle: {
    getNext(_currentIndex: number, playlistLength: number): number {
      return Math.floor(Math.random() * playlistLength)
    }
  }
} as const

export type RepeatMode = keyof typeof REPEAT_STRATEGIES

export interface MusicFolder {
  id: string
  path: string
  name: string
  description: string
  track_count: number
  coverDataUrl: string | null
  created_at: string
  updated_at: string
}

/* ── 跨进程 DTO（形状照抄原 preload 的 api.music 声明，语义不变） ── */

/** 新增曲目：落库后才有 id / liked，主进程返回的就是这个形状 */
export type AddedTrack = Omit<Track, 'id' | 'liked'>

/** `plugin:music:add-tracks` 的返回值（用户取消选择时为 null） */
export interface AddTracksResult {
  added: AddedTrack[]
  skipped: string[]
}

/** `plugin:music:play-track` 事件载荷（AI 工具点播 → 播放器） */
export interface MusicPlayRequest {
  track: Track
  folderTracks: Track[]
  folderId: string
  targetIndex: number
}
