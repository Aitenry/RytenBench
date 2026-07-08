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

export const REPEAT_STRATEGIES = {
  all: {
    label: '列表循环',
    getNext(currentIndex: number, playlistLength: number): number {
      const next = currentIndex + 1
      return next >= playlistLength ? 0 : next
    }
  },
  one: {
    label: '单曲循环',
    getNext(currentIndex: number, _playlistLength: number): number {
      void _playlistLength
      return currentIndex
    }
  },
  shuffle: {
    label: '随机播放',
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
