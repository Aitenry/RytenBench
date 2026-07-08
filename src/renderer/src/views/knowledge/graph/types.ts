export interface GraphEntity {
  id: number
  wiki_id: number
  name: string
  type: string
  description: string | null
  aliases: string | null
  properties: string | null
  confidence: number
  source_note_ids: string | null
  created_at: string
  updated_at: string
}

export interface GraphRelation {
  id: number
  wiki_id: number
  source_id: number
  target_id: number
  relation_type: string
  description: string | null
  properties: string | null
  confidence: number
  source_note_ids: string | null
  created_at: string
}

export interface GraphData {
  entities: GraphEntity[]
  relations: GraphRelation[]
}

export interface BuildJob {
  id: number
  wiki_id: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  total_notes: number
  processed_notes: number
  entity_count: number
  relation_count: number
  error_message: string | null
  config: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface WikiRow {
  id: number
  title: string
  summary: string | null
  image: string | null
  created_at: string
  updated_at: string
  doc_count: number
  tags: string | null
}

/** 实体类型 → 颜色映射 */
export const ENTITY_TYPE_COLORS: Record<string, string> = {
  person: '#FF6B6B',
  organization: '#4ECDC4',
  technology: '#45B7D1',
  concept: '#96CEB4',
  event: '#D4A017',
  location: '#DDA0DD',
  product: '#98D8C8',
  artifact: '#FFD700',
  skill: '#FF8C42',
  creature: '#8E44AD',
  realm: '#17A589',
  other: '#BDC3C7'
}

/** 实体类型 → 中文标签映射 */
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  person: '人物',
  organization: '组织',
  technology: '技术',
  concept: '概念',
  event: '事件',
  location: '地点',
  product: '产品',
  artifact: '物品',
  skill: '技能',
  creature: '生物',
  realm: '等级',
  other: '其他'
}

/** 关系类型 → 中文标签映射 */
export const RELATION_TYPE_LABELS: Record<string, string> = {
  depends_on: '依赖于',
  contains: '包含',
  part_of: '属于',
  related_to: '相关于',
  creates: '创建',
  uses: '使用',
  is_a: '是一种',
  opposes: '对立',
  leads_to: '导致',
  example_of: '示例',
  friend_of: '朋友',
  enemy_of: '敌人',
  loves: '爱慕',
  family_of: '亲属',
  mentors: '指导',
  belongs_to: '归属于',
  fights: '战斗',
  kills: '击杀',
  acquires: '获得',
  located_in: '位于'
}
