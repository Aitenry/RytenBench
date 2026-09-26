import { type ReactNode } from 'react'
import {
  RiCalendar2Line,
  RiChatAiLine,
  RiDashboardLine,
  RiDiscLine,
  RiPlugLine
} from '@remixicon/react'

/**
 * **声明项**的菜单图标解析（`PluginListEntry.menu.icon` 是 remixicon 名字符串）。
 *
 * 为什么需要这张表：真实注册由插件自己传组件（`icon: <RiDiscLine size={16} />`，
 * 见各插件 `renderer/plugin.tsx`），只有「宿主按清单元数据预注册」的声明项拿到的
 * 是**名字**，必须在这里显式映射成节点。名字对不上（清单里写了别的图标、或第三方
 * 插件的 plugin.json 没写 icon）一律回退到通用图标，绝不抛错——声明项只是首帧的
 * 占位，几百毫秒后会被插件的真实注册覆盖。
 *
 * 名单按四个内置插件清单里**实际用到的**名字维护（home/planner/music/harness）；
 * 新增内置插件时在这里补一行即可（P5 起磁盘包插件同样走这条路径）。
 */
const DECLARED_MENU_ICONS: Record<string, ReactNode> = {
  RiDashboardLine: <RiDashboardLine size={16} />,
  RiCalendar2Line: <RiCalendar2Line size={16} />,
  RiDiscLine: <RiDiscLine size={16} />,
  RiChatAiLine: <RiChatAiLine size={16} />
}

/** 通用回退图标（未知名字 / 清单没写 icon） */
const FALLBACK_MENU_ICON: ReactNode = <RiPlugLine size={16} />

/** 按名字解析声明项的菜单图标（未知名字回退通用图标） */
export function declaredMenuIcon(name: string | undefined): ReactNode {
  if (!name) return FALLBACK_MENU_ICON
  return DECLARED_MENU_ICONS[name] ?? FALLBACK_MENU_ICON
}
