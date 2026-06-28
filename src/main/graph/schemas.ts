/**
 * 知识图谱 Zod 数据模式 —— 定义所有 LLM 输出的结构化契约
 * 配合 StructuredOutputParser 使用，实现 JSON 输出的强制校验
 */
import { z } from 'zod/v3'

/** 实体类型枚举 */
const EntityTypeSchema = z.enum([
  'person',
  'organization',
  'technology',
  'concept',
  'event',
  'location',
  'product',
  'other'
])

/** 单个实体 */
export const EntitySchema = z.object({
  name: z.string().describe('实体规范化全称'),
  type: EntityTypeSchema.describe('实体类型'),
  description: z.string().describe('15字以内的简洁描述')
})

/** 实体数组 —— 实体抽取 & Gleaning 使用 */
export const EntitiesArraySchema = z.array(EntitySchema)

/** 合并后的实体（含别名等元信息） */
export const MergedEntitySchema = z.object({
  name: z.string().describe('规范化名称'),
  type: EntityTypeSchema.describe('实体类型'),
  description: z.string().describe('综合描述'),
  aliases: z.array(z.string()).describe('别名列表'),
  confidence: z.number().describe('置信度 0-1'),
  source_note_ids: z.array(z.number()).describe('来源笔记 ID 列表')
})

/** 实体消歧合并结果 */
export const EntityMergingResultSchema = z.object({
  merged: z.array(MergedEntitySchema).describe('合并后的实体列表'),
  removed_names: z.array(z.string()).describe('被合并掉的名称列表')
})

/** 关系类型枚举 */
const RelationTypeSchema = z.enum([
  'depends_on',
  'contains',
  'part_of',
  'related_to',
  'creates',
  'uses',
  'is_a',
  'leads_to'
])

/** 单个关系 */
export const RelationSchema = z.object({
  source: z.string().describe('源实体名称'),
  target: z.string().describe('目标实体名称'),
  relation_type: RelationTypeSchema.describe('关系类型'),
  description: z.string().describe('15字以内的简短关系描述')
})

/** 关系数组 —— 关系抽取使用 */
export const RelationsArraySchema = z.array(RelationSchema)

// ========== 类型推导 ==========
export type EntityOutput = z.infer<typeof EntitySchema>
export type EntitiesArrayOutput = z.infer<typeof EntitiesArraySchema>
export type MergedEntityOutput = z.infer<typeof MergedEntitySchema>
export type EntityMergingResultOutput = z.infer<typeof EntityMergingResultSchema>
export type RelationOutput = z.infer<typeof RelationSchema>
export type RelationsArrayOutput = z.infer<typeof RelationsArraySchema>
