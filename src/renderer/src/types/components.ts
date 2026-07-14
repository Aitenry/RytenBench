import type React from 'react'
import type { MenuProps } from 'antd'
import type { MessageInstance } from 'antd/es/message/interface'
import type { Track, MusicFolder, RepeatMode } from './music'
import type { DocItem, WikiRow, TodoItem, DocOption } from './models'
import type {
  DirectoryWithChildren,
  GraphEntity,
  GraphRelation,
  GraphChartData,
  WikiEditData
} from './knowledge'

/* ── Markdown ── */

export interface MarkdownEditorProps {
  initialValue?: string
  onSave?: (content: string) => void
}

export interface MarkdownViewProps {
  content: string
  isDarkMode?: boolean
}

export interface HeadingItem {
  id: string
  level: number
  text: string
  children: HeadingItem[]
}

export interface TocItemProps {
  item: HeadingItem
  isDarkMode?: boolean
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onNavigate: (id: string) => void
}

export interface TableOfContentsProps {
  headings: HeadingItem[]
  isDarkMode?: boolean
  onNavigate: (id: string) => void
}

/* ── Doc ── */

export interface DocCardProps {
  item: DocItem
  onClick?: () => void
  actions?: React.ReactNode[]
  showContentPreview?: boolean
}

export interface DocPreviewModalProps {
  open: boolean
  onCancel: () => void
  currentDoc: DocItem | null
}

/* ── Wiki ── */

export interface WikiEditModalProps {
  open: boolean
  isNew: boolean
  initialTitle?: string
  initialSummary?: string
  initialImage?: string | null
  onSave: (data: WikiEditData) => Promise<void>
  onCancel: () => void
}

export interface WikiPreviewModalProps {
  wiki: WikiRow | null
  open: boolean
  onClose: () => void
}

export interface WikiArchiveModalProps {
  open: boolean
  wikiId: number | undefined
  onArchive: (docIds: number[]) => Promise<void>
  onCancel: () => void
}

export interface WikiCardProps {
  item: WikiRow
  onSelect: () => void
  onEdit?: () => void
  onDelete?: () => void
}

/* ── Lock Screen ── */

export interface LockScreenProps {
  onUnlock: (password: string) => void
}

/* ── Sidebar ── */

export interface SidebarProps {
  currentKey: string
  setCurrentKey: (key: string) => void
  onUserMenuClick?: MenuProps['onClick']
}

/* ── Route ── */

export interface MainRoutesProps {
  defaultRoute?: string
}

/* ── Provider / Context ── */

export interface MessageContextType {
  messageApi?: MessageInstance
  viewMessage: (
    key: string,
    type: 'loading' | 'success' | 'info' | 'warning' | 'error',
    content: string,
    duration?: number
  ) => void
}

export interface MessageProviderProps {
  children: React.ReactNode
}

export interface BuildProgressProviderProps {
  children: React.ReactNode
}

/* ── Build Progress ── */

export interface BuildProgressProps {
  open: boolean
  wikiId: number
  wikiTitle: string
  phaseLabel: string
  phaseProgress: number
  overallProgress: number
  processedDocs: number
  totalDocs: number
  processedChunks: number
  totalChunks: number
  entityCount: number
  relationCount: number
  message: string
  onMinimize: () => void
}

/* ── Knowledge Graph ── */

export interface GraphCanvasProps {
  data: GraphChartData
  onEntityClick: (entity: GraphEntity) => void
  onEntityDblClick?: (entity: GraphEntity) => void
  searchQuery?: string
}

export interface GraphToolbarProps {
  wikiTitle: string
  isLoading: boolean
  searchQuery: string
  typeFilter: string | undefined
  entityCount: number
  relationCount: number
  docs: DocOption[]
  addedDocIds: Set<number>
  isAppending: boolean
  docFilter: number[]
  onSearchChange: (value: string) => void
  onTypeFilterChange: (value: string | undefined) => void
  onAppendDocs: (docIds: number[]) => void
  onDocFilterChange: (docIds: number[]) => void
  onBuildGraph: () => void
  onBackToWikiList: () => void
}

export interface EntityDetailProps {
  entity: GraphEntity | null
  entities: GraphEntity[]
  relations: GraphRelation[]
  onRelationClick?: (entityId: number) => void
  onDocClick?: (docId: number) => void
  onClose?: () => void
}

/* ── Directory Tree ── */

export interface DirectoryTreeProps {
  directoryTree: DirectoryWithChildren[]
  expandedKeys: React.Key[]
  onExpand: (keys: React.Key[]) => void
  onSelect: (keys: React.Key[]) => void
  selectedKeys: React.Key[]
  onCreateDirectory: (parentId: number) => void
  onEditDirectory: (dir: DirectoryWithChildren) => void
  onDeleteDirectory: (dir: DirectoryWithChildren) => void
}

/* ── Home / Dashboard ── */

export interface WeatherData {
  city: string
  date: string
  temperature: string
  condition: string
  highLow: string
  feelsLike: string
  icon?: string
}

export interface WorkTimeData {
  today: string
  avgLastWeek: string
  thisWeek: string
  todayWorked: string
}

export interface CardItemProps {
  weatherData: WeatherData
  workTimeData: WorkTimeData
}

export interface TodoListProps {
  initialTodos?: TodoItem[]
}

export interface StatusOption {
  value: number
  label: string
}

/* ── Home ThemePalette ── */

export interface StickyPalette {
  bg: string
  shadow: string
  tape: string
}

export interface ThemePalette {
  wikiStackOuter: string
  wikiStackInner: string
  wikiStackShadow: string
  wikiCardBg: string
  wikiCardShadow: string
  wikiIconColor: string
  stickyColors: StickyPalette[]
  docCardBg: string
  docCardBorder: string
  docCardShadow: string
  docIconColor: string
  todoDescColor: string
  textColor: string
  textSecondary: string
}

/* ── Music ── */

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

export interface PlaylistTableProps {
  tracks: Track[]
  currentIndex: number
  isPlaying: boolean
  onPlay: (index: number) => void
  onRemove: (index: number) => void | Promise<void>
  onUpdate: () => void
  onToggleLike?: (trackId: string) => void
}

/* ── Settings ── */

export interface ProviderOption {
  id: number
  name: string
  model: string
  tags: string[] | null
}
