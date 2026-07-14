import type { Track, RepeatMode } from './music'

/** 音频播放状态 */
export interface AudioState {
  currentTrack: Track | null
  currentIndex: number
  playlist: Track[]
  isPlaying: boolean
  isBuffering: boolean
  duration: number
  volume: number
  repeatMode: RepeatMode
  selectedFolderId: string | null
}

/** 音频播放操作 */
export interface AudioActions {
  play: (index: number) => void
  pause: () => void
  resume: () => void
  next: () => void
  prev: () => void
  seek: (time: number) => void
  setVolume: (v: number) => void
  toggleRepeat: () => void
  setSelectedFolderId: (id: string | null) => void
  setPlaylist: (tracks: Track[], startIndex?: number) => void
  updatePlaylist: (tracks: Track[], folderId?: string) => void
  addToPlaylist: (tracks: Track[]) => void
  removeFromPlaylist: (index: number) => void
  clearPlaylist: () => void
  playTrack: (track: Track) => void
}

/** 音频播放进度 */
export interface AudioProgress {
  progress: number
  duration: number
  isBuffering: boolean
}
