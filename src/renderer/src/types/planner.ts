import type {
  PlannerTaskRow as PlannerTaskRowFromDb,
  PlannerDependencyRow as PlannerDependencyRowFromDb,
  PlannerTreeNode as PlannerTreeNodeFromDb
} from '../../../main/database/mapper/planner'

/** 计划任务行（复用主进程 mapper 推导出的行类型，避免两处手工维护） */
export type PlannerTaskRow = PlannerTaskRowFromDb

export type PlannerTreeNode = PlannerTreeNodeFromDb

export type PlannerDependencyRow = PlannerDependencyRowFromDb

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
