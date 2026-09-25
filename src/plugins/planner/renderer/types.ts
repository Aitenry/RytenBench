/* planner 插件自己的渲染层常量与组件 props（原先混在 core 的 @renderer/types/planner.ts 里）。
   插件专属内容不再放 core：core 反向 import 插件类型会破坏「插件可停用」的边界。
   跨进程 DTO（行类型 / 树节点）在 ../shared/types.ts。 */

export const PRIORITY_MAP: Record<number, { label: string; hex: string; rgba: string }> = {
  0: { label: 'P0', hex: '#D32F2F', rgba: 'rgba(211,47,47,0.3)' },
  1: { label: 'P1', hex: '#E64A19', rgba: 'rgba(230,74,25,0.3)' },
  2: { label: 'P2', hex: '#F57C00', rgba: 'rgba(245,124,0,0.3)' },
  3: { label: 'P3', hex: '#388E3C', rgba: 'rgba(56,142,60,0.3)' },
  4: { label: 'P4', hex: '#1976D2', rgba: 'rgba(25,118,210,0.3)' },
  5: { label: 'P5', hex: '#7B1FA2', rgba: 'rgba(123,31,162,0.3)' },
  6: { label: 'P6', hex: '#757575', rgba: 'rgba(117,117,117,0.3)' },
  7: { label: 'P7', hex: '#BDBDBD', rgba: 'rgba(189,189,189,0.3)' }
}

export const DAY_COL_WIDTH = 60
export const ROW_HEIGHT = 36
