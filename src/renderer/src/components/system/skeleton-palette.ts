import { theme } from 'antd'
import type { CSSProperties } from 'react'
import { useTheme } from '../../contexts/useTheme'

/**
 * 骨架屏的节奏与取色（不含任何 JSX 物料，见同目录 Skeleton.tsx）。
 *
 * 拆成独立模块的原因有两个：一是 eslint 的 react-refresh 规则要求组件文件只导出组件；
 * 二是「脉动 CSS + 主题取色」是路由级骨架（route/RouteSkeleton.tsx）与组件级骨架共用的底层，
 * 单独放一处才不会再次出现两套颜色。
 */

/**
 * 脉动动画：透明度呼吸，深浅色通用。
 *
 * 兜底色刻意用「中灰 + 低透明度」而不是浅色主题的 rgba(0,0,0,.06)：裸用
 * `<SkeletonBlock />`（没有预设根节点、拿不到 --rb-skel-block）时，浅底与深底上都要看得见——
 * 只写浅色值会在深色主题下糊成一片。预设内部的精确取色仍走 CSS 变量。
 */
export const SKELETON_CSS = `
.rb-skel-block {
  background: var(--rb-skel-block, rgba(127, 127, 127, 0.16));
  animation: rb-skel-pulse 1.8s ease-in-out infinite;
}
.rb-skel-track {
  background: var(--rb-skel-track, rgba(127, 127, 127, 0.12));
}
@keyframes rb-skel-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .rb-skel-block { animation: none; opacity: 0.8; }
}
`

export interface SkeletonPalette {
  isDark: boolean
  /** 主色块 */
  block: string
  /** 更弱的底（轨道 / 辐条） */
  track: string
  /** 强调色点缀（甘特条、中心节点） */
  accent: string
  /** 发丝线 */
  hairline: string
}

/**
 * 骨架取色：默认跟随应用主题（useTheme），`dark` 可显式覆盖——
 * ToolDetailView 这类自带暗色皮肤的面板不跟 antd token 走。
 */
export function useSkeletonPalette(dark?: boolean): SkeletonPalette {
  const { effectiveTheme } = useTheme()
  const { token } = theme.useToken()
  const isDark = dark ?? effectiveTheme === 'dark'
  return {
    isDark,
    block: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)',
    track: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    accent: `color-mix(in srgb, ${token.colorPrimary} 30%, transparent)`,
    hairline: token.colorBorderSecondary
  }
}

/** 把取色挂成 CSS 变量，铺在骨架预设的根节点上 */
export function skeletonVars(palette: SkeletonPalette): CSSProperties {
  return {
    '--rb-skel-block': palette.block,
    '--rb-skel-track': palette.track
  } as CSSProperties
}
