import type { ComponentType, CSSProperties } from 'react'
import {
  RiEye2Line,
  RiFileEditLine,
  RiFolderOpenLine,
  RiListCheck,
  RiPencilLine,
  RiSearchLine,
  RiTerminalBoxLine
} from '@remixicon/react'

/**
 * 工具图标映射（单独放 .ts：这些是常量，放在组件文件里会触发
 * react-refresh/only-export-components）。
 *
 * 语义图标在「进行中」（参数构建中/执行中）与「完成态」卡片上保持一致，
 * 让同一个工具在两种状态下看着是同一个东西。
 */
export const TOOL_IN_PROGRESS_ICONS: Record<
  string,
  ComponentType<{
    size?: number | string
    color?: string
    className?: string
    style?: CSSProperties
  }>
> = {
  read_file: RiEye2Line,
  write_file: RiFileEditLine,
  edit_file: RiPencilLine,
  ls: RiFolderOpenLine,
  glob: RiSearchLine,
  grep: RiSearchLine,
  execute: RiTerminalBoxLine,
  write_todos: RiListCheck,
  read_todos: RiListCheck
}

/** 完成态卡片图标（按语义分类） */
export const TOOL_CARD_ICONS: Record<
  'file' | 'dir' | 'search' | 'command',
  ComponentType<{ size?: number | string; style?: CSSProperties }>
> = {
  file: RiEye2Line,
  dir: RiFolderOpenLine,
  search: RiSearchLine,
  command: RiTerminalBoxLine
}

/** 人类可读字节数（卡片右侧元信息） */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
