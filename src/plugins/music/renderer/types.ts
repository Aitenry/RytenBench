import type { Track, MusicFolder, RepeatMode } from '../shared/types'

/* music 插件自己的组件 props（原先混在 core 的 @renderer/types/components.ts 里）。
   插件专属类型不再放 core：core 反向 import 插件类型会破坏「插件可停用」的边界。 */

export interface CreatePlaylistModalProps {
  open: boolean
  onClose: () => void
  onCreated: (data: {
    name: string
    description: string
    coverDataUrl: string | null
  }) => Promise<void>
}

export interface EditPlaylistModalProps {
  open: boolean
  folder: MusicFolder | null
  onClose: () => void
  onSaved: () => void
}

export interface MusicSidebarProps {
  folders: MusicFolder[]
  specialFolders: MusicFolder[]
  selectedFolderId: string | null
  onSelectFolder: (folder: MusicFolder) => void
  onAddTracks: (folderId: string) => void
  onEditFolder: (folder: MusicFolder) => void
  onDeleteFolder: (folderId: string) => void
  onCreateClick: () => void
  colorBgContainer: string
  borderRadiusLG: number
}

export interface NowPlayingProps {
  folder: MusicFolder | null
}

export interface PlaylistTableProps {
  tracks: Track[]
  currentIndex: number
  isPlaying: boolean
  onPlay: (index: number) => void
  onRemove: (index: number) => void | Promise<void>
  onUpdate: () => void
  onToggleLike?: (trackId: string) => void
}

export interface PlayerControlsProps {
  currentTrack: Track | null
  duration: number
  volume: number
  isPlaying: boolean
  repeatMode: RepeatMode
  liked: boolean
  onSeek: (v: number) => void
  onVolumeChange: (v: number) => void
  onToggleRepeat: () => void
  onPrev: () => void
  onNext: () => void
  onPlayPause: () => void
  onToggleLike: () => void
  onTogglePlaylist: () => void
}
