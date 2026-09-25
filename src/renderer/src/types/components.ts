import type React from 'react'
import type { MenuProps } from 'antd'
import type { MessageInstance } from 'antd/es/message/interface'

/**
 * core 共享的组件 props / 上下文类型。
 *
 * 归属划分（home 插件迁移时清理）：**插件自己的 props 不放这里**——core 反向 import
 * 插件类型会让「插件可停用」的边界失真。home 的 props（`GraphViewProps` /
 * `GraphCanvasProps` / `GraphToolbarProps` / `EntityDetailProps` / `BuildProgressProps` /
 * `WikiEditModalProps` / `WikiCardProps` / `DocPreviewModalProps` / `TodoListProps`）
 * 已搬进 `src/plugins/home/renderer/types.ts`。
 *
 * 留在这里的是外壳与共享 UI：markdown 渲染、锁屏/侧栏/路由、消息与构建进度 Provider、
 * 底栏天气卡、模型 Provider 选项（图谱设置页与 harness 智能体设置页共用）。
 */

/* ── Markdown ── */

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

/* ── Home / Dashboard（外壳底栏的天气卡，与 home 插件无关） ── */

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

export interface StatusOption {
  value: number
  label: string
}

/* ── Settings（模型 Provider 选项：图谱设置页与 harness 智能体设置页共用） ── */

export interface ProviderOption {
  id: number
  name: string
  model: string
  provider: string
  metadata: Record<string, unknown> | null
}
