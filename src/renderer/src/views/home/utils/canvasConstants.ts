import type { StickyPalette } from '@renderer/types/components'

/* ──────────── Sticky note palettes ──────────── */

export const STICKY_LIGHT: StickyPalette[] = [
  { bg: '#fff9c4', shadow: '#e6d88a80', tape: '#f5e79a' },
  { bg: '#fce4ec', shadow: '#d4b8c080', tape: '#f8c8d4' },
  { bg: '#e8f5e9', shadow: '#b8c8ba80', tape: '#c8e6c9' },
  { bg: '#e3f2fd', shadow: '#b4c4d080', tape: '#bbdefb' },
  { bg: '#f3e5f5', shadow: '#c4b8c880', tape: '#e1bee7' },
  { bg: '#fff3e0', shadow: '#d4c4b080', tape: '#ffe0b2' }
]

export const STICKY_DARK: StickyPalette[] = [
  { bg: '#4a4520', shadow: '#35311880', tape: '#5c5628' },
  { bg: '#4a2d36', shadow: '#35202680', tape: '#5c3642' },
  { bg: '#2d3d30', shadow: '#202c2280', tape: '#364a3a' },
  { bg: '#2d3648', shadow: '#1e243280', tape: '#364258' },
  { bg: '#3d2d3d', shadow: '#2a202a80', tape: '#4a364a' },
  { bg: '#4a3828', shadow: '#35261c80', tape: '#5c4430' }
]

/* ──────────── Node position presets (pixel coords) ──────────── */

export const WIKI_POSITIONS = [
  { x: 150, y: 120 },
  { x: 180, y: 420 },
  { x: 140, y: 720 },
  { x: 160, y: 1020 },
  { x: 170, y: 1320 },
  { x: 150, y: 1620 },
  { x: 130, y: 1920 },
  { x: 155, y: 2220 },
  { x: 140, y: 2520 },
  { x: 165, y: 2820 }
]

export const TODO_POSITIONS = [
  { x: 520, y: 100 },
  { x: 550, y: 400 },
  { x: 530, y: 700 },
  { x: 540, y: 1000 },
  { x: 560, y: 1300 },
  { x: 535, y: 1600 },
  { x: 545, y: 1900 },
  { x: 555, y: 2200 },
  { x: 525, y: 2500 },
  { x: 540, y: 2800 }
]

export const DOC_POSITIONS = [
  { x: 950, y: 110 },
  { x: 970, y: 410 },
  { x: 940, y: 710 },
  { x: 960, y: 1010 },
  { x: 980, y: 1310 },
  { x: 950, y: 1610 },
  { x: 970, y: 1910 },
  { x: 955, y: 2210 },
  { x: 965, y: 2510 },
  { x: 945, y: 2810 }
]

/** 为超出预设数组的节点计算位置，延续垂直排列 */
export function getPositionForIndex(
  positions: { x: number; y: number }[],
  index: number
): { x: number; y: number } {
  if (index < positions.length) {
    return positions[index]
  }
  const last = positions[positions.length - 1]
  const extraRows = index - positions.length + 1
  const xVariants = [last.x - 15, last.x, last.x + 15]
  return {
    x: xVariants[index % 3] ?? last.x,
    y: last.y + extraRows * 300
  }
}
