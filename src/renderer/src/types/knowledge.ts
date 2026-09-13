import React from 'react'
import type {
  GraphEntity as GraphEntityFromDb,
  GraphRelation as GraphRelationFromDb,
  GraphData as GraphDataFromDb,
  GraphBuildJob as BuildJobFromDb
} from '../../../main/database/mapper/graph'

// 图谱相关行类型一律复用主进程 mapper（由 drizzle schema 推导），避免渲染层手抄导致漂移
export type GraphEntity = GraphEntityFromDb

export type GraphRelation = GraphRelationFromDb

export type GraphData = GraphDataFromDb

export type BuildJob = BuildJobFromDb

export interface GraphChartNode {
  id: string
  name: string
  category: number
  symbolSize: number
  original: GraphEntity
}

export interface GraphChartLink {
  source: string
  target: string
  label: string
  description?: string | null
}

export interface GraphChartCategory {
  name: string
  itemStyle: { color: string }
}

export interface GraphChartData {
  nodes: GraphChartNode[]
  links: GraphChartLink[]
  categories: GraphChartCategory[]
}

/** 目录树节点 */
export interface TreeNodeData {
  key: React.Key
  title: React.ReactNode
  children?: TreeNodeData[]
}

/** 带子节点的目录 */
export interface DirectoryWithChildren {
  id: number
  wiki_id: number
  parent_id: number | null
  name: string
  sort_order: number
  level: number
  created_at: string
  updated_at: string
  children?: DirectoryWithChildren[]
}

/** 百科编辑数据 */
export interface WikiEditData {
  title: string
  summary: string | null
  tags: string | null
  image: string | null
}

/** 实体类型 → 颜色映射 */
export const ENTITY_TYPE_COLORS: Record<string, string> = {
  person: '#FF6B6B',
  organization: '#4ECDC4',
  concept: '#96CEB4',
  event: '#D4A017',
  location: '#DDA0DD',
  other: '#BDC3C7',
  technology: '#45B7D1',
  product: '#98D8C8',
  system: '#3498DB',
  document: '#E67E22',
  standard: '#1ABC9C',
  facility: '#7F8C8D',
  substance: '#9B59B6',
  process: '#2ECC71',
  role: '#F39C12',
  skill: '#FF8C42',
  measure: '#E74C3C',
  artifact: '#FFD700',
  creature: '#8E44AD',
  realm: '#17A589'
}

/**
 * 实体类型 → 词条键映射。
 * 本模块不持有 `t`，而 i18next 的 `t()` 只接受字面量键，所以这里存「数据值 → 字面量词条键」，
 * 由调用方（GraphView / EntityDetail）用 `t()` 求值；表里未收录的类型回退成原始 type 字符串。
 */
export type GraphEntityTypeLabelKey =
  | 'graph.entityType.person'
  | 'graph.entityType.organization'
  | 'graph.entityType.concept'
  | 'graph.entityType.event'
  | 'graph.entityType.location'
  | 'graph.entityType.other'
  | 'graph.entityType.technology'
  | 'graph.entityType.product'
  | 'graph.entityType.system'
  | 'graph.entityType.document'
  | 'graph.entityType.standard'
  | 'graph.entityType.facility'
  | 'graph.entityType.substance'
  | 'graph.entityType.process'
  | 'graph.entityType.role'
  | 'graph.entityType.skill'
  | 'graph.entityType.measure'
  | 'graph.entityType.artifact'
  | 'graph.entityType.creature'
  | 'graph.entityType.realm'

export const ENTITY_TYPE_LABEL_KEYS: Partial<Record<string, GraphEntityTypeLabelKey>> = {
  person: 'graph.entityType.person',
  organization: 'graph.entityType.organization',
  concept: 'graph.entityType.concept',
  event: 'graph.entityType.event',
  location: 'graph.entityType.location',
  other: 'graph.entityType.other',
  technology: 'graph.entityType.technology',
  product: 'graph.entityType.product',
  system: 'graph.entityType.system',
  document: 'graph.entityType.document',
  standard: 'graph.entityType.standard',
  facility: 'graph.entityType.facility',
  substance: 'graph.entityType.substance',
  process: 'graph.entityType.process',
  role: 'graph.entityType.role',
  skill: 'graph.entityType.skill',
  measure: 'graph.entityType.measure',
  artifact: 'graph.entityType.artifact',
  creature: 'graph.entityType.creature',
  realm: 'graph.entityType.realm'
}

/** 关系类型 → 词条键映射（同上，取值同样收窄成字面量联合） */
export type GraphRelationTypeLabelKey =
  | 'graph.relationType.contains'
  | 'graph.relationType.part_of'
  | 'graph.relationType.is_a'
  | 'graph.relationType.located_in'
  | 'graph.relationType.depends_on'
  | 'graph.relationType.related_to'
  | 'graph.relationType.leads_to'
  | 'graph.relationType.uses'
  | 'graph.relationType.creates'
  | 'graph.relationType.produces'
  | 'graph.relationType.operates'
  | 'graph.relationType.owns'
  | 'graph.relationType.acquires'
  | 'graph.relationType.belongs_to'
  | 'graph.relationType.governs'
  | 'graph.relationType.monitors'
  | 'graph.relationType.employs'
  | 'graph.relationType.mentors'
  | 'graph.relationType.friend_of'
  | 'graph.relationType.enemy_of'
  | 'graph.relationType.loves'
  | 'graph.relationType.family_of'
  | 'graph.relationType.fights'
  | 'graph.relationType.kills'

export const RELATION_TYPE_LABEL_KEYS: Partial<Record<string, GraphRelationTypeLabelKey>> = {
  contains: 'graph.relationType.contains',
  part_of: 'graph.relationType.part_of',
  is_a: 'graph.relationType.is_a',
  located_in: 'graph.relationType.located_in',
  depends_on: 'graph.relationType.depends_on',
  related_to: 'graph.relationType.related_to',
  leads_to: 'graph.relationType.leads_to',
  uses: 'graph.relationType.uses',
  creates: 'graph.relationType.creates',
  produces: 'graph.relationType.produces',
  operates: 'graph.relationType.operates',
  owns: 'graph.relationType.owns',
  acquires: 'graph.relationType.acquires',
  belongs_to: 'graph.relationType.belongs_to',
  governs: 'graph.relationType.governs',
  monitors: 'graph.relationType.monitors',
  employs: 'graph.relationType.employs',
  mentors: 'graph.relationType.mentors',
  friend_of: 'graph.relationType.friend_of',
  enemy_of: 'graph.relationType.enemy_of',
  loves: 'graph.relationType.loves',
  family_of: 'graph.relationType.family_of',
  fights: 'graph.relationType.fights',
  kills: 'graph.relationType.kills'
}
