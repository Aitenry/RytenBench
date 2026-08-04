import { StructuredOutputParser } from '@langchain/core/output_parsers'
import logger from 'electron-log'
import { dice } from 'strsimkit'
import { EntityMergingResultSchema, type EntityMergingResultOutput } from '../schemas'
import { ENTITY_MERGING_PROMPT } from '../prompts'
import type { ExtractedEntity } from '../types'
import type { ServiceContext } from './llm-invoke'

const mergeParser = StructuredOutputParser.fromZodSchema(EntityMergingResultSchema)

/**
 * 按实体名文本相似度聚类分组，确保同名/相似名的实体在同一批次中合并
 * 使用 Dice 系数（string-similarity），相似度阈值 0.6 以上为同一组
 * - 单批次上限 40 个实体
 * - 优先比较短名称实体（更可能是其他名称的子串/简称）
 */
export function groupEntitiesByPrefix(entities: ExtractedEntity[]): ExtractedEntity[][] {
  const MAX_BATCH = 40
  const SIMILARITY_THRESHOLD = 0.6

  if (entities.length <= MAX_BATCH) return [entities]

  const sorted = [...entities].sort((a, b) => a.name.length - b.name.length)

  const clusters: { names: string[]; entities: ExtractedEntity[] }[] = []

  for (const entity of sorted) {
    const name = entity.name

    let bestClusterIndex = -1
    let bestScore = 0

    for (let i = 0; i < clusters.length; i++) {
      if (clusters[i].entities.length >= MAX_BATCH) continue

      let maxSimilarity = 0
      for (const existingName of clusters[i].names) {
        const sim = dice(name, existingName)
        if (sim > maxSimilarity) maxSimilarity = sim
        if (maxSimilarity >= SIMILARITY_THRESHOLD) break
      }

      if (maxSimilarity >= SIMILARITY_THRESHOLD && maxSimilarity > bestScore) {
        bestScore = maxSimilarity
        bestClusterIndex = i
      }
    }

    if (bestClusterIndex >= 0) {
      clusters[bestClusterIndex].names.push(name)
      clusters[bestClusterIndex].entities.push(entity)
    } else {
      clusters.push({ names: [name], entities: [entity] })
    }
  }

  return clusters.map((c) => c.entities)
}

/**
 * 实体消歧合并（Stage 1 程序化去重 → Stage 2 按名前缀分批次 LLM 合并）
 * onProgress(processedBatches, totalBatches) 用于上报阶段详情进度
 */
export async function mergeEntities(
  ctx: ServiceContext,
  entities: ExtractedEntity[],
  onProgress?: (processed: number, total: number) => void
): Promise<ExtractedEntity[]> {
  if (entities.length <= 1) {
    onProgress?.(1, 1)
    return entities
  }

  // Stage 1: 程序化合并（完全同名 + 简单别名匹配）
  const nameMap = new Map<string, ExtractedEntity>()

  for (const entity of entities) {
    const key = entity.name.toLowerCase()
    const existing = nameMap.get(key)
    if (existing) {
      existing.aliases = [...new Set([...existing.aliases, ...entity.aliases])]
      existing.source_doc_ids = [...new Set([...existing.source_doc_ids, ...entity.source_doc_ids])]
      existing.confidence = Math.max(existing.confidence, entity.confidence)
      if (entity.description.length > existing.description.length) {
        existing.description = entity.description
        existing.name = entity.name
      }
    } else {
      nameMap.set(key, { ...entity })
    }
  }

  const stage1Entities = Array.from(nameMap.values())
  if (stage1Entities.length <= 1) {
    onProgress?.(1, 1)
    return stage1Entities
  }

  // Stage 2: 按名前缀分组 → 分批次 LLM 合并
  const batches = groupEntitiesByPrefix(stage1Entities)
  onProgress?.(0, batches.length)

  const allMerged: ExtractedEntity[] = []

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    if (batch.length <= 1) {
      allMerged.push(...batch)
    } else {
      try {
        const parsed = await ctx.cachedInvoke<EntityMergingResultOutput>(
          ENTITY_MERGING_PROMPT.replace('{entities}', JSON.stringify(batch, null, 2)),
          mergeParser
        )

        if (parsed?.merged && Array.isArray(parsed.merged)) {
          allMerged.push(
            ...parsed.merged.map(
              (e) =>
                ({
                  name: e.name,
                  type: e.type || 'other',
                  description: e.description || '',
                  aliases: e.aliases || [],
                  confidence: e.confidence ?? 0.9,
                  source_doc_ids: e.source_doc_ids || []
                }) as ExtractedEntity
            )
          )
        } else {
          allMerged.push(...batch)
        }
      } catch (error) {
        logger.warn(
          `Entity merging batch ${i + 1}/${batches.length} failed, keeping original:`,
          error
        )
        allMerged.push(...batch)
      }
    }
    onProgress?.(i + 1, batches.length)
  }

  return allMerged
}
