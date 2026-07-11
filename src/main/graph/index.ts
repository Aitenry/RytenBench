import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { StructuredOutputParser } from '@langchain/core/output_parsers'
import logger from 'electron-log'
import { parseFromLLM } from 'json-llm-repair'
import { dice } from 'strsimkit'
import type { z } from 'zod/v3'
import {
  batchUpsertEntities,
  batchUpsertRelations,
  batchUpdateEntityConfidence,
  upsertBuildJob,
  deleteEntitiesByWikiId,
  deleteRelationsByWikiId,
  getFullGraphData,
  getBuildJobByWikiId,
  getRelationsByWikiId,
  GraphData,
  updateBuildJob
} from '../database/mapper/graph'
import { getDocById } from '../database/mapper/document'
import { getDirectoriesByWikiId, getDocsByDirectoryId } from '../database/mapper/wiki'
import {
  ENTITY_GLEANING_PROMPT,
  ENTITY_MERGING_PROMPT,
  ENTITY_RELATION_EXTRACTION_PROMPT,
  INCREMENTAL_CROSS_CHUNK_PROMPT
} from './prompts'
import {
  EntitiesArraySchema,
  EntityMergingResultSchema,
  RelationsArraySchema,
  UnifiedExtractionSchema,
  ALLOWED_ENTITY_TYPES,
  ALLOWED_RELATION_TYPES,
  type EntitiesArrayOutput,
  type EntityMergingResultOutput,
  type RelationsArrayOutput,
  type UnifiedExtractionOutput
} from './schemas'

export interface BuildConfig {
  /** 最大并发 LLM 调用数（默认 8） */
  maxConcurrency?: number
  /** 是否强制重建 */
  force?: boolean
  gleaningThreshold?: number
  /** 是否启用 gleaning（二次抽取遗漏实体，默认 true） */
  enableGleaning?: boolean
  /** Gleaning 最大处理文档数：当库中文档很多时限制 gleaning 总成本（默认 100，设为 0 不限） */
  gleaningMaxDocs?: number
  /** Markdown 分块最大字符数（默认 2000） */
  maxChunkSize?: number
  /** 单次 LLM 调用处理的文档数量（批量模式，默认 1） */
  batchSize?: number
  /** 混合置信度权重：LLM 置信度占比（默认 0.6） */
  llmConfidenceWeight?: number
  /** 混合置信度权重：统计特征占比（默认 0.4） */
  statConfidenceWeight?: number
}

interface ExtractedEntity {
  name: string
  type: string
  description: string
  aliases: string[]
  confidence: number
  source_doc_ids: number[]
  relationCount?: number
}

interface ExtractedRelation {
  source: string
  target: string
  relation_type: string
  description: string
}

type ProgressCallback = (progress: {
  wikiId: number
  phase: string
  phaseLabel: string
  phaseProgress: number
  overallProgress: number
  processedDocs: number
  totalDocs: number
  processedChunks: number
  totalChunks: number
  entityCount: number
  relationCount: number
  message: string
  needsRefresh?: boolean
}) => void

/** 文本分块结果 */
interface TextChunk {
  docId: number
  chunkIndex: number
  content: string
}

// ==================== 工具函数 ====================

/**
 * 检测场景分隔符（小说等叙事文本常用）
 * 支持：--- / *** / * * * / ___ / 空行 + 短居中标题 + 空行 等模式
 * 返回分隔符的位置列表（文本中的字符索引）
 */
function findSceneBreaks(text: string): number[] {
  const positions: number[] = []

  // 1. Markdown 水平分隔线：^---+$ | ^\*{3,}$ | ^_{3,}$ | ^\* \* \*$
  const hrPattern = /^(?:---+|\*{3,}|_{3,}|(?:\* ){2,}\*|(?:- ){2,}-)$/gm
  let hrMatch: RegExpExecArray | null
  while ((hrMatch = hrPattern.exec(text)) !== null) {
    positions.push(hrMatch.index)
  }

  // 2. 空行包围的短标题行
  const sceneTitlePattern = /(?:^|\n)\s*\n(?!\s*#)(\S[^\n]{0,30}\S)\s*\n\s*\n/gm
  let stMatch: RegExpExecArray | null
  while ((stMatch = sceneTitlePattern.exec(text)) !== null) {
    const titleText = stMatch[1].trim()
    const isVeryShort = titleText.length <= 6
    if (isVeryShort) {
      positions.push(stMatch.index + stMatch[0].indexOf(titleText))
    }
  }

  // 排序并去重（相邻 50 字符内合并）
  positions.sort((a, b) => a - b)
  const merged: number[] = []
  for (const pos of positions) {
    if (merged.length === 0 || pos - merged[merged.length - 1] > 50) {
      merged.push(pos)
    }
  }
  return merged
}

/**
 * 按 Markdown 标题层级切分文本（参考 LightRAG / GraphRAG 的分块策略）
 * - 保持标题层级上下文（如 "# A > ## B > ### C"），提升实体抽取的语义准确性
 * - 跳过代码块内的标题行（避免将 ```java # Title``` 误识别为标题）
 * - 单段过长时回退到段落分块
 * - 标题稀疏时自动检测场景分隔符作为补充分块点（适配小说等叙事文本）
 */
function splitByMarkdownHeaders(text: string, maxChunkSize = 2000): string[] {
  // 1. 定位所有代码块的范围，标题检测时跳过这些区域
  const codeBlockPattern = /```[\s\S]*?```/g
  const codeBlockRanges: Array<[number, number]> = []
  let codeMatch: RegExpExecArray | null
  while ((codeMatch = codeBlockPattern.exec(text)) !== null) {
    codeBlockRanges.push([codeMatch.index, codeMatch.index + codeMatch[0].length])
  }

  const isInCodeBlock = (pos: number): boolean =>
    codeBlockRanges.some(([start, end]) => pos >= start && pos < end)

  // 2. 定位所有标题行
  const headerPattern = /^(#+)\s+(.*)/gm

  interface HeaderInfo {
    index: number // 标题行起始位置
    endIndex: number // 标题行结束位置（下一行开头）
    level: number // 标题层级（# = 1, ## = 2, ...）
    text: string // 标题文本
  }

  const headers: HeaderInfo[] = []
  let headerMatch: RegExpExecArray | null
  while ((headerMatch = headerPattern.exec(text)) !== null) {
    if (!isInCodeBlock(headerMatch.index)) {
      headers.push({
        index: headerMatch.index,
        endIndex: headerMatch.index + headerMatch[0].length,
        level: headerMatch[1].length,
        text: headerMatch[2].trim()
      })
    }
  }

  // 无标题时回退到段落分块
  if (headers.length === 0) {
    return fallbackParagraphChunk(text, maxChunkSize)
  }

  // 标题稀疏检测：文本很长但标题很少（如小说一章仅一个 # 标题）→ 注入场景分隔符作为虚拟二级标题
  if (headers.length === 1 && text.length > maxChunkSize * 1.5) {
    const sceneBreaks = findSceneBreaks(text)
    if (sceneBreaks.length > 0) {
      // 将场景分隔符注入为虚拟 ## 标题
      for (const pos of sceneBreaks) {
        // 提取分隔符后的前 15 个字符作为场景标签
        const afterBreak = text.slice(pos).split('\n').slice(0, 3).join(' ').slice(0, 30).trim()
        headers.push({
          index: pos,
          endIndex: pos,
          level: 2,
          text: `[场景] ${afterBreak || '...'}`
        })
      }
      // 重新按位置排序
      headers.sort((a, b) => a.index - b.index)
    }
  }

  // 3. 按标题切分，每段携带完整层级上下文
  const chunks: string[] = []
  const headerStack: string[] = []
  let lastEnd = 0
  let currentBody = ''

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]

    // 保存上一个 section（如果已有标题上下文）
    if (headerStack.length > 0) {
      const bodyContent = text.slice(lastEnd, h.index).trim()
      if (bodyContent) {
        currentBody += bodyContent + '\n'
        const headerPath = headerStack.join(' > ')
        const fullContent = `# ${headerPath}\n\n${currentBody.trim()}`

        if (fullContent.trim().length > maxChunkSize) {
          chunks.push(...splitLongContent(fullContent, maxChunkSize))
        } else {
          chunks.push(fullContent.trim())
        }
      }
      currentBody = ''
    }

    // 更新标题栈：当前层级 <= 栈大小时，弹出到上一级
    while (headerStack.length >= h.level) {
      headerStack.pop()
    }
    headerStack.push(h.text)
    lastEnd = h.endIndex
  }

  // 4. 处理最后一个 section
  if (lastEnd < text.length) {
    const remaining = text.slice(lastEnd).trim()
    if (remaining) currentBody += remaining
  }
  if (headerStack.length > 0 && currentBody.trim()) {
    const headerPath = headerStack.join(' > ')
    const fullContent = `# ${headerPath}\n\n${currentBody.trim()}`
    if (fullContent.trim().length > maxChunkSize) {
      chunks.push(...splitLongContent(fullContent, maxChunkSize))
    } else {
      chunks.push(fullContent.trim())
    }
  }

  return chunks.length > 0 ? chunks : [text]
}

/**
 * 过长的单个 section 进一步按段落拆分，保留标题路径作为上下文前缀
 */
function splitLongContent(fullContent: string, maxSize: number): string[] {
  const headerEnd = fullContent.indexOf('\n\n')
  if (headerEnd === -1) {
    // 没有明显的标题/正文分隔，直接按字符切分
    return splitByCharOverlap(fullContent, maxSize)
  }

  const headerPrefix = fullContent.slice(0, headerEnd)
  const body = fullContent.slice(headerEnd + 2)

  if (body.length <= maxSize) return [fullContent]

  // 按段落切分 body，每段带上 header 前缀
  const paragraphs = body.split(/\n\s*\n/)
  const chunks: string[] = []
  let current = ''
  const overlap = 100

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    if (current.length + trimmed.length > maxSize && current.length > 0) {
      chunks.push(`${headerPrefix}\n\n${current.trim()}`)
      // 重叠：保留最后一段
      const lastPara = current.split(/\n\s*\n/).pop() || ''
      current = lastPara.length > overlap ? lastPara.slice(-overlap) + '\n\n' : lastPara + '\n\n'
    }
    current += trimmed + '\n\n'
  }

  if (current.trim()) {
    chunks.push(`${headerPrefix}\n\n${current.trim()}`)
  }

  return chunks.length > 0 ? chunks : [fullContent]
}

/**
 * 纯字符级重叠切分（无标题时的兜底策略）
 */
function splitByCharOverlap(text: string, maxSize: number, overlap = 200): string[] {
  if (text.length <= maxSize) return [text]

  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + maxSize, text.length)
    chunks.push(text.slice(start, end))
    start += maxSize - overlap
  }
  return chunks
}

/**
 * 段落级回退分块（无 Markdown 标题时使用）
 */
function fallbackParagraphChunk(text: string, maxSize: number): string[] {
  if (text.length <= maxSize) return [text]

  const paragraphs = text.split(/\n\s*\n/)
  const chunks: string[] = []
  let current = ''
  const overlap = 200

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    if (current.length + trimmed.length > maxSize && current.length > 0) {
      chunks.push(current.trim())
      const lastPara = current.split(/\n\s*\n/).pop() || ''
      current = lastPara.length > overlap ? lastPara.slice(-overlap) + '\n\n' : lastPara + '\n\n'
    }
    current += trimmed + '\n\n'
  }

  if (current.trim()) {
    chunks.push(current.trim())
  }

  return chunks.length > 0 ? chunks : [text]
}

/**
 * 预计算：批量检查哪些实体出现在文本中（不区分大小写）
 * 一次性 lowerCase 文本，避免 O(n*m) 次重复转换
 */
function filterEntitiesInText(entityNames: string[], text: string): string[] {
  const lowerText = text.toLowerCase()
  return entityNames.filter((name) => lowerText.includes(name.toLowerCase()))
}

/**
 * 组装文档内容：避免 title 与 content 首行标题重复
 * 例如 note.title="第四章" 且 content="# 第四章\n..." 时，不再重复拼接
 */
function assembleDocContent(title: string, content: string): string {
  const trimmedContent = content.trimStart()
  // 判断 content 首行是否是 Markdown 标题且与 title 相同或高度相似
  const firstLine = trimmedContent.split('\n')[0] || ''
  const headingMatch = firstLine.match(/^#+\s+(.*)/)
  if (headingMatch) {
    const headingText = headingMatch[1].trim()
    // 标题文本包含关系（任一包含另一即可）
    if (headingText === title || headingText.includes(title) || title.includes(headingText)) {
      return trimmedContent
    }
  }
  return `${title}\n${trimmedContent}`
}

interface EntityStats {
  relationCount: number
  totalEntities: number
  totalDocs: number
  totalRelations: number
}

function calculateStatConfidence(
  entity: ExtractedEntity & { relationCount?: number },
  stats: EntityStats
): number {
  const docFreqScore = Math.min(entity.source_doc_ids.length / stats.totalDocs, 1)
  const relationScore =
    stats.totalRelations > 0 ? Math.min((entity.relationCount ?? 0) / stats.totalRelations, 0.5) : 0
  const descScore = Math.min(entity.description.length / 15, 1)

  const combined = docFreqScore * 0.4 + relationScore * 0.3 + descScore * 0.3
  return Math.max(0.3, Math.min(1.0, combined))
}

function applyHybridConfidence(
  entities: ExtractedEntity[],
  relations: (ExtractedRelation & { source_note_id: number })[],
  llmWeight: number = 0.6,
  statWeight: number = 0.4
): ExtractedEntity[] {
  const entityRelationCount = new Map<string, number>()
  for (const rel of relations) {
    entityRelationCount.set(rel.source, (entityRelationCount.get(rel.source) || 0) + 1)
    entityRelationCount.set(rel.target, (entityRelationCount.get(rel.target) || 0) + 1)
  }

  const allDocIds = new Set<number>()
  for (const entity of entities) {
    entity.source_doc_ids.forEach((id) => allDocIds.add(id))
  }

  const stats: EntityStats = {
    relationCount: relations.length,
    totalEntities: entities.length,
    totalDocs: allDocIds.size || 1,
    totalRelations: relations.length
  }

  return entities.map((entity) => {
    const statScore = calculateStatConfidence(
      { ...entity, relationCount: entityRelationCount.get(entity.name) || 0 },
      stats
    )
    const finalConfidence = Math.max(
      0.3,
      Math.min(1.0, entity.confidence * llmWeight + statScore * statWeight)
    )
    return { ...entity, confidence: finalConfidence }
  })
}

export class KnowledgeGraphService {
  private model: BaseChatModel
  private llmCache: Map<string, string>
  private readonly CACHE_MAX_SIZE = 500

  // StructuredOutputParser 实例（每个 schema 一个，仅用于 parse 校验）
  private readonly entityParser = StructuredOutputParser.fromZodSchema(EntitiesArraySchema)
  private readonly mergeParser = StructuredOutputParser.fromZodSchema(EntityMergingResultSchema)
  private readonly relationParser = StructuredOutputParser.fromZodSchema(RelationsArraySchema)
  private readonly unifiedParser = StructuredOutputParser.fromZodSchema(UnifiedExtractionSchema)

  constructor(model: BaseChatModel) {
    this.model = model
    this.llmCache = new Map()
  }

  /**
   * 带缓存的 LLM 结构化调用
   * 1. 缓存原始 LLM 响应
   * 2. 尝试 Zod 严格校验
   * 3. 失败则回退到 json-llm-repair（提取 + 修复 + 解析）
   */
  private async cachedStructuredInvoke<T>(
    prompt: string,
    parser: StructuredOutputParser<z.ZodTypeAny>
  ): Promise<T | null> {
    // 缓存 key 基于 prompt 内容
    const cacheKey = prompt.slice(0, 200) + '|||' + prompt.slice(-200)
    const cached = this.llmCache.get(cacheKey)

    let rawContent: string
    if (cached !== undefined) {
      rawContent = cached
    } else {
      const response = await this.model.invoke(prompt)
      rawContent = typeof response.content === 'string' ? response.content : ''

      // LRU 淘汰
      if (this.llmCache.size >= this.CACHE_MAX_SIZE) {
        const firstKey = this.llmCache.keys().next().value
        if (firstKey) this.llmCache.delete(firstKey)
      }
      this.llmCache.set(cacheKey, rawContent)
    }

    const attempt = <T>(fn: () => T | Promise<T>): Promise<T | null> =>
      Promise.resolve(fn()).catch(() => null)

    const parsed =
      (await attempt(() => parser.parse(rawContent) as T)) ??
      (await attempt(() => parseFromLLM(rawContent, { mode: 'repair' }) as T))

    if (parsed == null) {
      logger.warn('All parsing strategies failed for prompt')
    }

    return parsed as T
  }

  /**
   * 从整个知识库构建知识图谱（优化版）
   */
  async buildGraph(
    wikiId: number,
    onProgress?: ProgressCallback,
    config?: BuildConfig
  ): Promise<GraphData> {
    const maxConcurrency = config?.maxConcurrency ?? 8
    const startTime = Date.now()

    const PHASES = {
      cleanup: { label: '清理数据', weight: 5 },
      collect: { label: '收集文档', weight: 5 },
      extract: { label: '抽取实体与关系', weight: 40 },
      gleaning: { label: '二次抽取遗漏实体', weight: 10 },
      merge_entities: { label: '实体消歧合并', weight: 10 },
      cross_chunk: { label: '跨块关系补全', weight: 10 },
      adjust_confidence: { label: '计算混合置信度', weight: 5 },
      update_confidence: { label: '更新实体置信度', weight: 5 },
      save_relations: { label: '保存关系', weight: 10 }
    }

    const PHASE_ORDER = [
      'cleanup',
      'collect',
      'extract',
      'gleaning',
      'merge_entities',
      'cross_chunk',
      'adjust_confidence',
      'update_confidence',
      'save_relations'
    ] as const
    const TOTAL_WEIGHT = PHASE_ORDER.reduce((sum, phase) => sum + PHASES[phase].weight, 0)

    let currentPhaseIndex = 0
    let phaseProgress = 0

    const sendProgress = (
      phase: string,
      message: string,
      details: {
        processedDocs?: number
        totalDocs?: number
        processedChunks?: number
        totalChunks?: number
        entityCount?: number
        relationCount?: number
        needsRefresh?: boolean
      } = {}
    ): void => {
      const phaseIndex = PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number])
      if (phaseIndex >= 0 && phaseIndex > currentPhaseIndex) {
        currentPhaseIndex = phaseIndex
        phaseProgress = 0
      }

      const completedWeight = PHASE_ORDER.slice(0, currentPhaseIndex).reduce(
        (sum, p) => sum + PHASES[p].weight,
        0
      )
      const currentPhase = PHASES[phase as keyof typeof PHASES]

      let overallProgress = completedWeight
      if (currentPhase) {
        overallProgress += currentPhase.weight * phaseProgress
      }
      overallProgress = Math.min(100, Math.round((overallProgress / TOTAL_WEIGHT) * 100))

      onProgress?.({
        wikiId,
        phase,
        phaseLabel: currentPhase?.label || phase,
        phaseProgress: Math.round(phaseProgress * 100),
        overallProgress,
        processedDocs: details.processedDocs ?? 0,
        totalDocs: details.totalDocs ?? 0,
        processedChunks: details.processedChunks ?? 0,
        totalChunks: details.totalChunks ?? 0,
        entityCount: details.entityCount ?? 0,
        relationCount: details.relationCount ?? 0,
        message,
        needsRefresh: details.needsRefresh
      })
    }

    // 1. 创建/重置构建任务
    const jobId = await upsertBuildJob(wikiId, config as Record<string, unknown>)

    try {
      // 2. 如果是强制重建，清空已有图谱数据
      if (config?.force) {
        sendProgress('cleanup', '清理已有图谱数据...')
        await deleteRelationsByWikiId(wikiId)
        await deleteEntitiesByWikiId(wikiId)
        phaseProgress = 1
        sendProgress('cleanup', '清理完成')
      }

      // 3. 快速收集所有文档
      currentPhaseIndex = PHASE_ORDER.indexOf('collect')
      phaseProgress = 0
      sendProgress('collect', '收集知识库文档...')
      const docEntries = await this.collectWikiDocs(wikiId)
      const totalDocs = docEntries.length
      phaseProgress = 1
      sendProgress('collect', `收集完成，共 ${totalDocs} 篇文档`)

      if (totalDocs === 0) {
        await updateBuildJob(jobId, {
          status: 'completed',
          total_notes: 0,
          entity_count: 0,
          relation_count: 0
        })
        return { entities: [], relations: [] }
      }

      await updateBuildJob(jobId, { status: 'running', total_notes: totalDocs })

      // ========== Phase 1: 分块 + 统一抽取（实体+关系） ==========
      currentPhaseIndex = PHASE_ORDER.indexOf('extract')
      phaseProgress = 0
      sendProgress('extract', '准备文本分块...', { totalDocs, entityCount: 0, relationCount: 0 })

      const allChunks: TextChunk[] = []
      for (const entry of docEntries) {
        const chunks = splitByMarkdownHeaders(entry.content, config?.maxChunkSize)
        chunks.forEach((chunk, idx) => {
          allChunks.push({ docId: entry.docId, chunkIndex: idx, content: chunk })
        })
      }

      const totalChunks = allChunks.length
      sendProgress('extract', `开始实体和关系抽取... ${totalChunks} 个文本块`, {
        totalDocs,
        totalChunks,
        entityCount: 0,
        relationCount: 0
      })

      const allExtractedEntities: ExtractedEntity[] = []
      const allExtractedRelations: (ExtractedRelation & { source_note_id: number })[] = []
      const entityNameToId = new Map<string, number>()

      for (let i = 0; i < allChunks.length; i += maxConcurrency) {
        const batch = allChunks.slice(i, i + maxConcurrency)
        const batchResults = await Promise.all(
          batch.map((chunk) => this.extractEntitiesAndRelations(chunk.content, chunk.docId))
        )

        const batchEntities: ExtractedEntity[] = []
        const batchRelations: (ExtractedRelation & { source_note_id: number })[] = []

        for (let j = 0; j < batch.length; j++) {
          const { entities, relations } = batchResults[j]
          const docId = batch[j].docId

          for (const e of entities) {
            batchEntities.push({ ...e, source_doc_ids: [docId] })
          }
          batchRelations.push(...relations)
        }

        allExtractedEntities.push(...batchEntities)
        allExtractedRelations.push(...batchRelations)

        const batchEntityNames = batchEntities.map((e) => e.name)
        const batchRelationsToSave = batchRelations.filter(
          (r) => batchEntityNames.includes(r.source) && batchEntityNames.includes(r.target)
        )

        const batchEntityNameToId = await batchUpsertEntities(
          batchEntities.map((e) => ({
            wiki_id: wikiId,
            name: e.name,
            type: e.type,
            description: e.description,
            aliases: JSON.stringify(e.aliases),
            properties: null,
            confidence: e.confidence,
            source_note_ids: JSON.stringify(e.source_doc_ids)
          }))
        )

        for (const [name, id] of batchEntityNameToId) {
          entityNameToId.set(name, id)
        }

        const batchRelationSet = new Map<string, (typeof batchRelationsToSave)[0]>()
        for (const rel of batchRelationsToSave) {
          const sourceId = entityNameToId.get(rel.source)
          const targetId = entityNameToId.get(rel.target)
          if (!sourceId || !targetId || sourceId === targetId) continue

          const key = `${sourceId}:${targetId}:${rel.relation_type}`
          if (!batchRelationSet.has(key)) {
            batchRelationSet.set(key, rel)
          }
        }

        if (batchRelationSet.size > 0) {
          await batchUpsertRelations(
            Array.from(batchRelationSet.values()).map((rel) => ({
              wiki_id: wikiId,
              source_id: entityNameToId.get(rel.source)!,
              target_id: entityNameToId.get(rel.target)!,
              relation_type: rel.relation_type,
              description: rel.description,
              properties: null,
              confidence: 1.0,
              source_note_ids: JSON.stringify([rel.source_note_id])
            }))
          )
        }

        const processedChunks = Math.min(i + maxConcurrency, totalChunks)
        const processedDocs = new Set(allChunks.slice(0, i + maxConcurrency).map((c) => c.docId))
          .size
        phaseProgress = processedChunks / totalChunks
        sendProgress(
          'extract',
          `抽取中... ${processedChunks}/${totalChunks} 块（${entityNameToId.size} 实体，${allExtractedRelations.length} 关系）`,
          {
            processedDocs: Math.min(processedDocs, totalDocs),
            totalDocs,
            processedChunks,
            totalChunks,
            entityCount: entityNameToId.size,
            relationCount: allExtractedRelations.length,
            needsRefresh: true
          }
        )
        await updateBuildJob(jobId, { processed_notes: processedDocs })
      }

      // ========== Phase 2: Gleaning 二次抽取（可选，按块级批处理） ==========
      const enableGleaning = config?.enableGleaning !== false
      if (enableGleaning && allChunks.length > 0) {
        currentPhaseIndex = PHASE_ORDER.indexOf('gleaning')
        phaseProgress = 0
        sendProgress('gleaning', `二次扫描遗漏实体... ${allChunks.length} 个文本块`, {
          totalDocs,
          totalChunks,
          entityCount: entityNameToId.size,
          relationCount: allExtractedRelations.length
        })

        for (let i = 0; i < allChunks.length; i += maxConcurrency) {
          const batch = allChunks.slice(i, i + maxConcurrency)
          const existingNames = [...entityNameToId.keys()]
          const batchResults =
            existingNames.length > 0
              ? await Promise.all(
                  batch.map((chunk) => this.gleanEntities(chunk.content, existingNames))
                )
              : batch.map(() => [] as Omit<ExtractedEntity, 'source_doc_ids'>[])

          for (let j = 0; j < batch.length; j++) {
            if (batchResults[j].length > 0) {
              const gleanedEntities = batchResults[j].map((e) => ({
                ...e,
                source_doc_ids: [batch[j].docId]
              }))
              allExtractedEntities.push(...gleanedEntities)

              const gleanedNameToId = await batchUpsertEntities(
                gleanedEntities.map((e) => ({
                  wiki_id: wikiId,
                  name: e.name,
                  type: e.type,
                  description: e.description,
                  aliases: JSON.stringify(e.aliases),
                  properties: null,
                  confidence: e.confidence,
                  source_note_ids: JSON.stringify(e.source_doc_ids)
                }))
              )

              for (const [name, id] of gleanedNameToId) {
                entityNameToId.set(name, id)
              }
            }
          }

          const processedChunks = Math.min(i + maxConcurrency, allChunks.length)
          const processedDocs = new Set(allChunks.slice(0, i + maxConcurrency).map((c) => c.docId))
            .size
          phaseProgress = processedChunks / allChunks.length
          sendProgress(
            'gleaning',
            `二次抽取中... ${processedChunks}/${allChunks.length} 块（${entityNameToId.size} 实体）`,
            {
              processedDocs: Math.min(processedDocs, totalDocs),
              totalDocs,
              processedChunks,
              totalChunks,
              entityCount: entityNameToId.size,
              relationCount: allExtractedRelations.length,
              needsRefresh: true
            }
          )
        }
      }

      // ========== Phase 3: 实体消歧合并（跨块） ==========
      currentPhaseIndex = PHASE_ORDER.indexOf('merge_entities')
      phaseProgress = 0
      sendProgress('merge_entities', '实体消歧合并中...', {
        totalDocs,
        entityCount: entityNameToId.size,
        relationCount: allExtractedRelations.length
      })
      let mergedEntities = await this.mergeEntities(allExtractedEntities, (done, total) => {
        phaseProgress = Math.min(1, done / total)
        sendProgress('merge_entities', `实体消歧合并中... ${done}/${total} 批次`, {
          totalDocs,
          entityCount: entityNameToId.size,
          relationCount: allExtractedRelations.length,
          needsRefresh: true
        })
      })
      phaseProgress = 1
      sendProgress('merge_entities', `实体消歧合并完成，共 ${mergedEntities.length} 个实体`, {
        totalDocs,
        entityCount: mergedEntities.length,
        relationCount: allExtractedRelations.length
      })

      // ========== Phase 4: 跨块关系补全（增量块级批处理） ==========
      const allEntityNames = mergedEntities.map((e) => e.name)
      const entityDescMap = new Map(
        mergedEntities.map((e) => [
          e.name,
          { name: e.name, type: e.type, description: e.description }
        ])
      )

      const docChunksMap = new Map<number, TextChunk[]>()
      for (const chunk of allChunks) {
        if (!docChunksMap.has(chunk.docId)) docChunksMap.set(chunk.docId, [])
        docChunksMap.get(chunk.docId)!.push(chunk)
      }

      // 增量任务：每个文档内，将 chunk 按顺序与已处理的前序 chunk 实体进行比对
      const crossChunkTasks: Array<{
        docId: number
        docTitle: string
        previousEntities: { name: string; type: string; description: string }[]
        currentEntities: { name: string; type: string; description: string }[]
        existingPairs: { source: string; target: string }[]
      }> = []

      for (const [docId, chunks] of docChunksMap) {
        if (chunks.length < 2) continue

        const docEntry = docEntries.find((e) => e.docId === docId)
        const docTitle = docEntry?.title || `文档 #${docId}`

        // 收集该文档在 extract 阶段已发现的关系，避免增量步骤间重复
        const allDocPairs = allExtractedRelations
          .filter((r) => r.source_note_id === docId)
          .map((r) => ({ source: r.source, target: r.target }))

        // 预计算每个 chunk 中出现的实体
        const chunkEntityLists: { name: string; type: string; description: string }[][] = []
        for (const chunk of chunks) {
          const names = filterEntitiesInText(allEntityNames, chunk.content)
          chunkEntityLists.push(names.map((name) => entityDescMap.get(name)!).filter(Boolean))
        }

        // 增量推进：从第 2 个 chunk 开始，每次比较当前 chunk 实体与前序累积实体
        const accumulated: { name: string; type: string; description: string }[] = [
          ...chunkEntityLists[0]
        ]
        const seen = new Set(chunkEntityLists[0].map((e) => e.name))

        for (let ci = 1; ci < chunks.length; ci++) {
          if (accumulated.length > 0 && chunkEntityLists[ci].length > 0) {
            crossChunkTasks.push({
              docId,
              docTitle,
              previousEntities: [...accumulated],
              currentEntities: chunkEntityLists[ci],
              existingPairs: allDocPairs
            })
          }

          // 将当前 chunk 的新实体累积到前序集合中
          for (const e of chunkEntityLists[ci]) {
            if (!seen.has(e.name)) {
              seen.add(e.name)
              accumulated.push(e)
            }
          }
        }
      }

      if (crossChunkTasks.length > 0) {
        currentPhaseIndex = PHASE_ORDER.indexOf('cross_chunk')
        phaseProgress = 0
        sendProgress('cross_chunk', `跨块关系补全中... ${crossChunkTasks.length} 个片段`, {
          totalDocs,
          entityCount: mergedEntities.length,
          relationCount: allExtractedRelations.length
        })

        for (let i = 0; i < crossChunkTasks.length; i += maxConcurrency) {
          const batch = crossChunkTasks.slice(i, i + maxConcurrency)
          const batchResults = await Promise.all(
            batch.map(({ docId, docTitle, previousEntities, currentEntities, existingPairs }) =>
              this.extractIncrementalCrossChunkRelations(
                docTitle,
                previousEntities,
                currentEntities,
                existingPairs,
                docId
              )
            )
          )
          for (let j = 0; j < batchResults.length; j++) {
            allExtractedRelations.push(...batchResults[j])
          }

          const processed = Math.min(i + maxConcurrency, crossChunkTasks.length)
          phaseProgress = processed / crossChunkTasks.length
          sendProgress('cross_chunk', `跨块关系补全中... ${processed}/${crossChunkTasks.length}`, {
            processedDocs: Math.min(
              processed,
              new Set(crossChunkTasks.slice(0, i + maxConcurrency).map((t) => t.docId)).size
            ),
            totalDocs,
            entityCount: mergedEntities.length,
            relationCount: allExtractedRelations.length,
            needsRefresh: true
          })
        }
      }

      // ========== Phase 5: 混合置信度计算 ==========
      currentPhaseIndex = PHASE_ORDER.indexOf('adjust_confidence')
      phaseProgress = 0
      sendProgress('adjust_confidence', '计算混合置信度...', {
        totalDocs,
        entityCount: mergedEntities.length,
        relationCount: allExtractedRelations.length
      })
      const llmWeight = config?.llmConfidenceWeight ?? 0.6
      const statWeight = config?.statConfidenceWeight ?? 0.4
      mergedEntities = applyHybridConfidence(
        mergedEntities,
        allExtractedRelations,
        llmWeight,
        statWeight
      )
      phaseProgress = 1
      sendProgress('adjust_confidence', '混合置信度计算完成', {
        totalDocs,
        entityCount: mergedEntities.length,
        relationCount: allExtractedRelations.length
      })

      // ========== Phase 6: 更新实体置信度 ==========
      currentPhaseIndex = PHASE_ORDER.indexOf('update_confidence')
      phaseProgress = 0
      sendProgress('update_confidence', '更新实体置信度...', {
        totalDocs,
        entityCount: mergedEntities.length,
        relationCount: allExtractedRelations.length
      })
      await batchUpdateEntityConfidence(
        mergedEntities.map((e) => ({
          id: entityNameToId.get(e.name)!,
          confidence: e.confidence
        }))
      )
      phaseProgress = 1
      sendProgress('update_confidence', '实体置信度更新完成', {
        totalDocs,
        entityCount: mergedEntities.length,
        relationCount: allExtractedRelations.length
      })

      // ========== Phase 7: 保存跨块关系 ==========
      currentPhaseIndex = PHASE_ORDER.indexOf('save_relations')
      phaseProgress = 0
      sendProgress('save_relations', '保存跨块关系...', {
        totalDocs,
        entityCount: mergedEntities.length,
        relationCount: allExtractedRelations.length
      })

      const relationSet = new Map<string, (typeof allExtractedRelations)[0]>()
      for (const rel of allExtractedRelations) {
        const sourceId = entityNameToId.get(rel.source)
        const targetId = entityNameToId.get(rel.target)
        if (!sourceId || !targetId || sourceId === targetId) continue

        const key = `${sourceId}:${targetId}:${rel.relation_type}`
        if (!relationSet.has(key)) {
          relationSet.set(key, rel)
        }
      }

      const relationsToSave = Array.from(relationSet.values())
      const savedRelationCount = await batchUpsertRelations(
        relationsToSave.map((rel) => ({
          wiki_id: wikiId,
          source_id: entityNameToId.get(rel.source)!,
          target_id: entityNameToId.get(rel.target)!,
          relation_type: rel.relation_type,
          description: rel.description,
          properties: null,
          confidence: 1.0,
          source_note_ids: JSON.stringify([rel.source_note_id])
        }))
      )
      phaseProgress = 1
      sendProgress('save_relations', `关系保存完成，共 ${savedRelationCount} 条`, {
        totalDocs,
        entityCount: mergedEntities.length,
        relationCount: savedRelationCount
      })

      // ========== 完成 ==========
      const allDocIds = docEntries.map((e) => e.docId)
      await updateBuildJob(jobId, {
        status: 'completed',
        processed_notes: totalDocs,
        entity_count: mergedEntities.length,
        relation_count: savedRelationCount,
        processed_note_ids: JSON.stringify(allDocIds)
      })

      logger.info(
        `Graph build completed: ${mergedEntities.length} entities, ${savedRelationCount} relations in ${Date.now() - startTime}ms`
      )

      return await getFullGraphData(wikiId)
    } catch (error) {
      logger.error('Graph build failed:', error)
      await updateBuildJob(jobId, {
        status: 'failed',
        error_message: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * 将多篇文档增量追加到已有知识图谱
   * 不会清空已有数据，只提取这些文档的实体和关系并合并到图谱中
   */
  async appendDocs(
    wikiId: number,
    docIds: number[],
    onProgress?: ProgressCallback,
    config?: BuildConfig
  ): Promise<{ entitiesAdded: number; relationsAdded: number }> {
    const maxConcurrency = config?.maxConcurrency ?? 8
    const maxChunkSize = config?.maxChunkSize
    const startTime = Date.now()
    const totalDocs = docIds.length

    const PHASES = {
      collect: { label: '收集文档', weight: 10 },
      extract: { label: '抽取实体与关系', weight: 40 },
      gleaning: { label: '二次抽取遗漏实体', weight: 10 },
      merge_entities: { label: '实体消歧合并', weight: 10 },
      cross_chunk: { label: '跨块关系补全', weight: 10 },
      save_entities: { label: '保存实体', weight: 5 },
      load_existing_relations: { label: '加载已有关系', weight: 5 },
      adjust_confidence: { label: '计算混合置信度', weight: 5 },
      update_confidence: { label: '更新实体置信度', weight: 5 },
      save_relations: { label: '保存关系', weight: 10 }
    }

    const PHASE_ORDER = [
      'collect',
      'extract',
      'gleaning',
      'merge_entities',
      'cross_chunk',
      'save_entities',
      'load_existing_relations',
      'adjust_confidence',
      'update_confidence',
      'save_relations'
    ] as const
    const TOTAL_WEIGHT = PHASE_ORDER.reduce((sum, phase) => sum + PHASES[phase].weight, 0)

    let currentPhaseIndex = 0
    let phaseProgress = 0

    const sendProgress = (
      phase: string,
      message: string,
      details: {
        processedDocs?: number
        totalDocs?: number
        processedChunks?: number
        totalChunks?: number
        entityCount?: number
        relationCount?: number
        needsRefresh?: boolean
      } = {}
    ): void => {
      const phaseIndex = PHASE_ORDER.indexOf(phase as (typeof PHASE_ORDER)[number])
      if (phaseIndex >= 0 && phaseIndex > currentPhaseIndex) {
        currentPhaseIndex = phaseIndex
        phaseProgress = 0
      }

      const completedWeight = PHASE_ORDER.slice(0, currentPhaseIndex).reduce(
        (sum, p) => sum + PHASES[p].weight,
        0
      )
      const currentPhase = PHASES[phase as keyof typeof PHASES]

      let overallProgress = completedWeight
      if (currentPhase) {
        overallProgress += currentPhase.weight * phaseProgress
      }
      overallProgress = Math.min(100, Math.round((overallProgress / TOTAL_WEIGHT) * 100))

      onProgress?.({
        wikiId,
        phase,
        phaseLabel: currentPhase?.label || phase,
        phaseProgress: Math.round(phaseProgress * 100),
        overallProgress,
        processedDocs: details.processedDocs ?? 0,
        totalDocs: details.totalDocs ?? 0,
        processedChunks: details.processedChunks ?? 0,
        totalChunks: details.totalChunks ?? 0,
        entityCount: details.entityCount ?? 0,
        relationCount: details.relationCount ?? 0,
        message,
        needsRefresh: details.needsRefresh
      })
    }

    if (totalDocs === 0) {
      return { entitiesAdded: 0, relationsAdded: 0 }
    }

    // 1. 并行读取所有文档内容
    currentPhaseIndex = PHASE_ORDER.indexOf('collect')
    phaseProgress = 0
    sendProgress('collect', '读取文档内容...', { totalDocs })

    const docEntries: { docId: number; content: string; title: string }[] = []
    for (let i = 0; i < docIds.length; i++) {
      const note = await getDocById(docIds[i])
      if (!note || !note.content) {
        logger.warn(`Doc ${docIds[i]} not found or empty, skipping`)
        continue
      }
      docEntries.push({
        docId: note.id,
        title: note.title,
        content: assembleDocContent(note.title, note.content)
      })
    }

    if (docEntries.length === 0) {
      throw new Error('所选文档均不存在或内容为空')
    }

    // 2. 获取已有图谱实体
    currentPhaseIndex = PHASE_ORDER.indexOf('extract')
    phaseProgress = 0
    sendProgress('extract', '加载已有图谱实体...', { totalDocs })
    const { entities: existingEntities } = await getFullGraphData(wikiId)

    // 3. 分块 + 统一抽取（实体+关系）
    const allChunks: TextChunk[] = []
    for (const entry of docEntries) {
      const chunks = splitByMarkdownHeaders(entry.content, maxChunkSize)
      chunks.forEach((chunk, idx) => {
        allChunks.push({ docId: entry.docId, chunkIndex: idx, content: chunk })
      })
    }

    const totalChunks = allChunks.length
    sendProgress('extract', `开始实体和关系抽取... ${totalChunks} 个文本块`, {
      totalDocs,
      totalChunks
    })

    const allNewEntities: ExtractedEntity[] = []
    const allNewRelations: (ExtractedRelation & { source_note_id: number })[] = []
    let entityNameToId = new Map<string, number>()

    for (const e of existingEntities) {
      entityNameToId.set(e.name, e.id)
    }

    for (let i = 0; i < allChunks.length; i += maxConcurrency) {
      const batch = allChunks.slice(i, i + maxConcurrency)
      const batchResults = await Promise.all(
        batch.map((chunk) => this.extractEntitiesAndRelations(chunk.content, chunk.docId))
      )

      const batchEntities: ExtractedEntity[] = []
      const batchRelations: (ExtractedRelation & { source_note_id: number })[] = []

      for (let j = 0; j < batch.length; j++) {
        const { entities, relations } = batchResults[j]
        const docId = batch[j].docId

        for (const e of entities) {
          batchEntities.push({ ...e, source_doc_ids: [docId] })
        }
        batchRelations.push(...relations)
      }

      allNewEntities.push(...batchEntities)
      allNewRelations.push(...batchRelations)

      const batchEntityNames = batchEntities.map((e) => e.name)
      const batchRelationsToSave = batchRelations.filter(
        (r) =>
          (batchEntityNames.includes(r.source) && batchEntityNames.includes(r.target)) ||
          (entityNameToId.has(r.source) && entityNameToId.has(r.target))
      )

      const batchEntityNameToId = await batchUpsertEntities(
        batchEntities.map((e) => ({
          wiki_id: wikiId,
          name: e.name,
          type: e.type,
          description: e.description,
          aliases: JSON.stringify(e.aliases),
          properties: null,
          confidence: e.confidence,
          source_note_ids: JSON.stringify(e.source_doc_ids)
        }))
      )

      for (const [name, id] of batchEntityNameToId) {
        entityNameToId.set(name, id)
      }

      const batchRelationSet = new Map<string, (typeof batchRelationsToSave)[0]>()
      for (const rel of batchRelationsToSave) {
        const sourceId = entityNameToId.get(rel.source)
        const targetId = entityNameToId.get(rel.target)
        if (!sourceId || !targetId || sourceId === targetId) continue

        const key = `${sourceId}:${targetId}:${rel.relation_type}`
        if (!batchRelationSet.has(key)) {
          batchRelationSet.set(key, rel)
        }
      }

      if (batchRelationSet.size > 0) {
        await batchUpsertRelations(
          Array.from(batchRelationSet.values()).map((rel) => ({
            wiki_id: wikiId,
            source_id: entityNameToId.get(rel.source)!,
            target_id: entityNameToId.get(rel.target)!,
            relation_type: rel.relation_type,
            description: rel.description,
            properties: null,
            confidence: 1.0,
            source_note_ids: JSON.stringify([rel.source_note_id])
          }))
        )
      }

      const processedChunks = Math.min(i + maxConcurrency, totalChunks)
      const processedDocs = new Set(allChunks.slice(0, i + maxConcurrency).map((c) => c.docId)).size
      phaseProgress = processedChunks / totalChunks
      sendProgress(
        'extract',
        `抽取中... ${processedChunks}/${totalChunks} 块（${entityNameToId.size} 实体，${allNewRelations.length} 关系）`,
        {
          processedDocs: Math.min(processedDocs, totalDocs),
          totalDocs,
          processedChunks,
          totalChunks,
          entityCount: entityNameToId.size,
          relationCount: allNewRelations.length,
          needsRefresh: true
        }
      )
    }

    // Gleaning 二次抽取（可选，按块级批处理）
    const enableGleaning = config?.enableGleaning !== false
    if (enableGleaning && allChunks.length > 0) {
      currentPhaseIndex = PHASE_ORDER.indexOf('gleaning')
      phaseProgress = 0
      sendProgress('gleaning', `二次扫描遗漏实体... ${allChunks.length} 个文本块`, {
        totalDocs,
        totalChunks,
        entityCount: entityNameToId.size,
        relationCount: allNewRelations.length
      })

      for (let i = 0; i < allChunks.length; i += maxConcurrency) {
        const batch = allChunks.slice(i, i + maxConcurrency)
        const existingNames = [...entityNameToId.keys()]
        const batchResults =
          existingNames.length > 0
            ? await Promise.all(
                batch.map((chunk) => this.gleanEntities(chunk.content, existingNames))
              )
            : batch.map(() => [] as Omit<ExtractedEntity, 'source_doc_ids'>[])

        for (let j = 0; j < batch.length; j++) {
          if (batchResults[j].length > 0) {
            const gleanedEntities = batchResults[j].map((e) => ({
              ...e,
              source_doc_ids: [batch[j].docId]
            }))
            allNewEntities.push(...gleanedEntities)

            const gleanedNameToId = await batchUpsertEntities(
              gleanedEntities.map((e) => ({
                wiki_id: wikiId,
                name: e.name,
                type: e.type,
                description: e.description,
                aliases: JSON.stringify(e.aliases),
                properties: null,
                confidence: e.confidence,
                source_note_ids: JSON.stringify(e.source_doc_ids)
              }))
            )

            for (const [name, id] of gleanedNameToId) {
              entityNameToId.set(name, id)
            }
          }
        }

        const processedChunks = Math.min(i + maxConcurrency, allChunks.length)
        const processedDocs = new Set(allChunks.slice(0, i + maxConcurrency).map((c) => c.docId))
          .size
        phaseProgress = processedChunks / allChunks.length
        sendProgress(
          'gleaning',
          `二次抽取中... ${processedChunks}/${allChunks.length} 块（${entityNameToId.size} 实体）`,
          {
            processedDocs: Math.min(processedDocs, totalDocs),
            totalDocs,
            processedChunks,
            totalChunks,
            entityCount: entityNameToId.size,
            relationCount: allNewRelations.length,
            needsRefresh: true
          }
        )
      }
    }

    if (allNewEntities.length === 0) {
      logger.info('No entities extracted from selected notes')
      return { entitiesAdded: 0, relationsAdded: 0 }
    }

    // 4. 将已有实体转为 ExtractedEntity 格式，与新实体一起合并
    const existingAsExtracted: ExtractedEntity[] = existingEntities.map((e) => ({
      name: e.name,
      type: e.type,
      description: e.description || '',
      aliases: e.aliases ? JSON.parse(e.aliases) : [],
      confidence: e.confidence,
      source_doc_ids: e.source_note_ids ? JSON.parse(e.source_note_ids) : []
    }))

    const allEntitiesForMerge = [...existingAsExtracted, ...allNewEntities]

    currentPhaseIndex = PHASE_ORDER.indexOf('merge_entities')
    phaseProgress = 0
    sendProgress('merge_entities', '实体消歧合并中...', {
      totalDocs,
      entityCount: entityNameToId.size,
      relationCount: allNewRelations.length
    })
    let mergedEntities = await this.mergeEntities(allEntitiesForMerge, (done, total) => {
      phaseProgress = Math.min(1, done / total)
      sendProgress('merge_entities', `实体消歧合并中... ${done}/${total} 批次`, {
        totalDocs,
        entityCount: entityNameToId.size,
        relationCount: allNewRelations.length,
        needsRefresh: true
      })
    })
    phaseProgress = 1
    sendProgress('merge_entities', `实体消歧合并完成，共 ${mergedEntities.length} 个实体`, {
      totalDocs,
      entityCount: mergedEntities.length,
      relationCount: allNewRelations.length
    })

    // 5. 跨块关系补全（增量块级批处理）
    const allEntityNames = mergedEntities.map((e) => e.name)
    const entityDescMap = new Map(
      mergedEntities.map((e) => [
        e.name,
        { name: e.name, type: e.type, description: e.description }
      ])
    )

    const docChunksMap = new Map<number, TextChunk[]>()
    for (const chunk of allChunks) {
      if (!docChunksMap.has(chunk.docId)) docChunksMap.set(chunk.docId, [])
      docChunksMap.get(chunk.docId)!.push(chunk)
    }

    // 增量任务：每个文档内，将 chunk 按顺序与已处理的前序 chunk 实体进行比对
    const crossChunkTasks: Array<{
      docId: number
      docTitle: string
      previousEntities: { name: string; type: string; description: string }[]
      currentEntities: { name: string; type: string; description: string }[]
      existingPairs: { source: string; target: string }[]
    }> = []

    for (const [docId, chunks] of docChunksMap) {
      if (chunks.length < 2) continue

      const docEntry = docEntries.find((e) => e.docId === docId)
      const docTitle = docEntry?.title || `文档 #${docId}`

      // 收集该文档在 extract 阶段已发现的关系，避免增量步骤间重复
      const allDocPairs = allNewRelations
        .filter((r) => r.source_note_id === docId)
        .map((r) => ({ source: r.source, target: r.target }))

      // 预计算每个 chunk 中出现的实体
      const chunkEntityLists: { name: string; type: string; description: string }[][] = []
      for (const chunk of chunks) {
        const names = filterEntitiesInText(allEntityNames, chunk.content)
        chunkEntityLists.push(names.map((name) => entityDescMap.get(name)!).filter(Boolean))
      }

      // 增量推进：从第 2 个 chunk 开始，每次比较当前 chunk 实体与前序累积实体
      const accumulated: { name: string; type: string; description: string }[] = [
        ...chunkEntityLists[0]
      ]
      const seen = new Set(chunkEntityLists[0].map((e) => e.name))

      for (let ci = 1; ci < chunks.length; ci++) {
        if (accumulated.length > 0 && chunkEntityLists[ci].length > 0) {
          crossChunkTasks.push({
            docId,
            docTitle,
            previousEntities: [...accumulated],
            currentEntities: chunkEntityLists[ci],
            existingPairs: allDocPairs
          })
        }

        // 将当前 chunk 的新实体累积到前序集合中
        for (const e of chunkEntityLists[ci]) {
          if (!seen.has(e.name)) {
            seen.add(e.name)
            accumulated.push(e)
          }
        }
      }
    }

    if (crossChunkTasks.length > 0) {
      currentPhaseIndex = PHASE_ORDER.indexOf('cross_chunk')
      phaseProgress = 0
      sendProgress('cross_chunk', `跨块关系补全中... ${crossChunkTasks.length} 个片段`, {
        totalDocs,
        entityCount: mergedEntities.length,
        relationCount: allNewRelations.length
      })

      for (let i = 0; i < crossChunkTasks.length; i += maxConcurrency) {
        const batch = crossChunkTasks.slice(i, i + maxConcurrency)
        const batchResults = await Promise.all(
          batch.map(({ docId, docTitle, previousEntities, currentEntities, existingPairs }) =>
            this.extractIncrementalCrossChunkRelations(
              docTitle,
              previousEntities,
              currentEntities,
              existingPairs,
              docId
            )
          )
        )
        for (let j = 0; j < batchResults.length; j++) {
          allNewRelations.push(...batchResults[j])
        }

        const processed = Math.min(i + maxConcurrency, crossChunkTasks.length)
        phaseProgress = processed / crossChunkTasks.length
        sendProgress('cross_chunk', `跨块关系补全中... ${processed}/${crossChunkTasks.length}`, {
          processedDocs: Math.min(
            processed,
            new Set(crossChunkTasks.slice(0, i + maxConcurrency).map((t) => t.docId)).size
          ),
          totalDocs,
          entityCount: mergedEntities.length,
          relationCount: allNewRelations.length,
          needsRefresh: true
        })
      }
    }

    // 6. 批量保存合并后的实体
    currentPhaseIndex = PHASE_ORDER.indexOf('save_entities')
    phaseProgress = 0
    sendProgress('save_entities', `保存 ${mergedEntities.length} 个实体...`, {
      totalDocs,
      entityCount: mergedEntities.length,
      relationCount: allNewRelations.length
    })

    entityNameToId = await batchUpsertEntities(
      mergedEntities.map((e) => ({
        wiki_id: wikiId,
        name: e.name,
        type: e.type,
        description: e.description,
        aliases: JSON.stringify(e.aliases),
        properties: null,
        confidence: e.confidence,
        source_note_ids: JSON.stringify(e.source_doc_ids)
      }))
    )
    phaseProgress = 1
    sendProgress('save_entities', '实体保存完成', {
      totalDocs,
      entityCount: entityNameToId.size,
      relationCount: allNewRelations.length
    })

    // 7. 查询已有关系，与新抽取关系合并用于置信度计算
    currentPhaseIndex = PHASE_ORDER.indexOf('load_existing_relations')
    phaseProgress = 0
    sendProgress('load_existing_relations', '加载已有关系...', {
      totalDocs,
      entityCount: entityNameToId.size,
      relationCount: allNewRelations.length
    })
    const existingDbRelations = await getRelationsByWikiId(wikiId)
    const entityIdToName = new Map<string, string>()
    for (const [name, id] of entityNameToId) {
      entityIdToName.set(String(id), name)
    }
    const allRelationsWithExisting = [
      ...allNewRelations,
      ...existingDbRelations.map((r) => ({
        source: entityIdToName.get(String(r.source_id)) || '',
        target: entityIdToName.get(String(r.target_id)) || '',
        relation_type: r.relation_type,
        description: r.description || '',
        source_note_id: 0
      }))
    ].filter((r) => r.source && r.target)
    phaseProgress = 1
    sendProgress('load_existing_relations', `加载完成，共 ${existingDbRelations.length} 条关系`, {
      totalDocs,
      entityCount: entityNameToId.size,
      relationCount: allRelationsWithExisting.length
    })

    // 8. 混合置信度计算（基于 LLM 置信度 + 统计特征，包含已有关系）
    currentPhaseIndex = PHASE_ORDER.indexOf('adjust_confidence')
    phaseProgress = 0
    sendProgress('adjust_confidence', '计算混合置信度...', {
      totalDocs,
      entityCount: entityNameToId.size,
      relationCount: allRelationsWithExisting.length
    })
    const llmWeight = config?.llmConfidenceWeight ?? 0.6
    const statWeight = config?.statConfidenceWeight ?? 0.4
    mergedEntities = applyHybridConfidence(
      mergedEntities,
      allRelationsWithExisting,
      llmWeight,
      statWeight
    )

    // 9. 更新实体置信度
    currentPhaseIndex = PHASE_ORDER.indexOf('update_confidence')
    phaseProgress = 0
    sendProgress('update_confidence', '更新实体置信度...', {
      totalDocs,
      entityCount: entityNameToId.size,
      relationCount: allNewRelations.length
    })
    await batchUpdateEntityConfidence(
      mergedEntities.map((e) => ({
        id: entityNameToId.get(e.name)!,
        confidence: e.confidence
      }))
    )
    phaseProgress = 1
    sendProgress('update_confidence', '实体置信度更新完成', {
      totalDocs,
      entityCount: entityNameToId.size,
      relationCount: allNewRelations.length
    })

    // 10. 去重并批量保存关系
    currentPhaseIndex = PHASE_ORDER.indexOf('save_relations')
    phaseProgress = 0
    sendProgress('save_relations', '保存关系...', {
      totalDocs,
      entityCount: entityNameToId.size,
      relationCount: allNewRelations.length
    })

    const relationSet = new Map<string, (typeof allNewRelations)[0]>()
    for (const rel of allNewRelations) {
      const sourceId = entityNameToId.get(rel.source)
      const targetId = entityNameToId.get(rel.target)
      if (!sourceId || !targetId || sourceId === targetId) continue

      const key = `${sourceId}:${targetId}:${rel.relation_type}`
      if (!relationSet.has(key)) {
        relationSet.set(key, rel)
      }
    }

    const relationsToSave = Array.from(relationSet.values())
    const savedRelationCount = await batchUpsertRelations(
      relationsToSave.map((rel) => ({
        wiki_id: wikiId,
        source_id: entityNameToId.get(rel.source)!,
        target_id: entityNameToId.get(rel.target)!,
        relation_type: rel.relation_type,
        description: rel.description,
        properties: null,
        confidence: 1.0,
        source_note_ids: JSON.stringify([rel.source_note_id])
      }))
    )
    phaseProgress = 1
    sendProgress('save_relations', `关系保存完成，共 ${savedRelationCount} 条`, {
      totalDocs,
      entityCount: entityNameToId.size,
      relationCount: savedRelationCount
    })

    logger.info(
      `Notes append completed: ${mergedEntities.length - existingEntities.length} entities, ${savedRelationCount} relations in ${Date.now() - startTime}ms`
    )

    // 更新 build job 的 processed_note_ids（与已有文档 ID 合并去重）
    const existingJob = await getBuildJobByWikiId(wikiId)
    const existingDocIds: number[] = existingJob?.processed_note_ids
      ? JSON.parse(existingJob.processed_note_ids)
      : []
    const mergedDocIds = [...new Set([...existingDocIds, ...docIds])]
    if (existingJob) {
      await updateBuildJob(existingJob.id, {
        processed_note_ids: JSON.stringify(mergedDocIds)
      })
    }

    return {
      entitiesAdded: mergedEntities.length - existingEntities.length,
      relationsAdded: savedRelationCount
    }
  }

  /**
   * 收集知识库下所有文档的内容（优化：并行读取文档）
   */
  private async collectWikiDocs(
    wikiId: number
  ): Promise<{ docId: number; content: string; title: string }[]> {
    const directories = await getDirectoriesByWikiId(wikiId)
    const seenDocIds = new Set<number>()

    // 先收集所有文档引用
    const docRefs: { doc_id: number }[] = []
    for (const dir of directories) {
      const refs = await getDocsByDirectoryId(dir.id)
      for (const ref of refs) {
        if (!seenDocIds.has(ref.doc_id)) {
          seenDocIds.add(ref.doc_id)
          docRefs.push({ doc_id: ref.doc_id })
        }
      }
    }

    // 并行读取所有文档（分批防止过载）
    const BATCH_SIZE = 20
    const results: { docId: number; content: string; title: string }[] = []

    for (let i = 0; i < docRefs.length; i += BATCH_SIZE) {
      const batch = docRefs.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(
        batch.map(async (ref) => {
          const note = await getDocById(ref.doc_id)
          if (note && note.content) {
            return {
              docId: note.id,
              content: assembleDocContent(note.title, note.content),
              title: note.title
            }
          }
          return null
        })
      )
      for (const result of batchResults) {
        if (result) results.push(result)
      }
    }

    return results
  }

  /**
   * Gleaning：二次扫描遗漏实体（使用 StructuredOutputParser + Zod 校验）
   */
  private async gleanEntities(
    text: string,
    existingNames: string[]
  ): Promise<Omit<ExtractedEntity, 'source_doc_ids'>[]> {
    try {
      const parsed = await this.cachedStructuredInvoke<EntitiesArrayOutput>(
        ENTITY_GLEANING_PROMPT.replace('{existing_entities}', existingNames.join('、')).replace(
          '{text}',
          text
        ),
        this.entityParser
      )

      if (parsed && Array.isArray(parsed)) {
        return parsed
          .map((e) => ({
            name: (e.name || '').trim(),
            type: e.type || 'other',
            description: e.description || '',
            aliases: [] as string[],
            confidence: e.confidence >= 0 && e.confidence <= 1 ? e.confidence : 0.65
          }))
          .filter((e) => e.name.length > 0 && !existingNames.includes(e.name))
      }
    } catch (error) {
      logger.warn('Entity gleaning failed:', error)
    }

    return []
  }

  /**
   * 实体消歧合并（Stage 1 程序化去重 → Stage 2 按名前缀分批次 LLM 合并）
   * onProgress(processedBatches, totalBatches) 用于上报阶段详情进度
   */
  private async mergeEntities(
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
        existing.source_doc_ids = [
          ...new Set([...existing.source_doc_ids, ...entity.source_doc_ids])
        ]
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
    const batches = this.groupEntitiesByPrefix(stage1Entities)
    onProgress?.(0, batches.length)

    const allMerged: ExtractedEntity[] = []

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      if (batch.length <= 1) {
        allMerged.push(...batch)
      } else {
        try {
          const parsed = await this.cachedStructuredInvoke<EntityMergingResultOutput>(
            ENTITY_MERGING_PROMPT.replace('{entities}', JSON.stringify(batch, null, 2)),
            this.mergeParser
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

  /**
   * 按实体名文本相似度聚类分组，确保同名/相似名的实体在同一批次中合并
   * 使用 Dice 系数（string-similarity），相似度阈值 0.6 以上为同一组
   * - 单批次上限 40 个实体
   * - 优先比较短名称实体（更可能是其他名称的子串/简称）
   */
  private groupEntitiesByPrefix(entities: ExtractedEntity[]): ExtractedEntity[][] {
    const MAX_BATCH = 40
    const SIMILARITY_THRESHOLD = 0.6

    if (entities.length <= MAX_BATCH) return [entities]

    // 按名称长度升序排列：短名称优先聚类（短名更可能是子串/别名/简称）
    const sorted = [...entities].sort((a, b) => a.name.length - b.name.length)

    // 贪心聚类：每个实体尝试加入已有簇，否则新建簇
    const clusters: { names: string[]; entities: ExtractedEntity[] }[] = []

    for (const entity of sorted) {
      const name = entity.name

      // 先在已有簇中找一个未满的相似簇
      let bestClusterIndex = -1
      let bestScore = 0

      for (let i = 0; i < clusters.length; i++) {
        if (clusters[i].entities.length >= MAX_BATCH) continue

        // 与簇中所有已存在名称比对，取最高相似度
        let maxSimilarity = 0
        for (const existingName of clusters[i].names) {
          const sim = dice(name, existingName)
          if (sim > maxSimilarity) maxSimilarity = sim
          if (maxSimilarity >= SIMILARITY_THRESHOLD) break // 已达标，无需继续比
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
   * 增量跨块关系补全（按 chunk 顺序推进）
   * 每次只比较当前 chunk 实体(A组) 与已处理的前序 chunk 实体(B组)之间的关系
   * 上下文窗口可控，同时产生更多批次实现渐进式进度展示
   */
  private async extractIncrementalCrossChunkRelations(
    noteTitle: string,
    previousEntities: { name: string; type: string; description: string }[],
    currentEntities: { name: string; type: string; description: string }[],
    existingPairs: { source: string; target: string }[],
    noteId: number
  ): Promise<(ExtractedRelation & { source_note_id: number })[]> {
    const allNames = [...previousEntities.map((e) => e.name), ...currentEntities.map((e) => e.name)]
    if (allNames.length < 2 || previousEntities.length === 0 || currentEntities.length === 0)
      return []

    try {
      const parsed = await this.cachedStructuredInvoke<RelationsArrayOutput>(
        INCREMENTAL_CROSS_CHUNK_PROMPT.replace('{docTitle}', noteTitle)
          .replace('{previousEntities}', JSON.stringify(previousEntities))
          .replace('{currentEntities}', JSON.stringify(currentEntities))
          .replace(
            '{existingPairs}',
            existingPairs.length > 0 ? JSON.stringify(existingPairs) : '[]'
          ),
        this.relationParser
      )

      if (parsed && Array.isArray(parsed)) {
        const existingSet = new Set(existingPairs.map((r) => `${r.source}:${r.target}`))
        let invalidTypeCount = 0
        const filtered = parsed
          .filter(
            (r) =>
              r.source &&
              r.target &&
              r.relation_type &&
              allNames.includes(r.source) &&
              allNames.includes(r.target) &&
              r.source !== r.target &&
              !existingSet.has(`${r.source}:${r.target}`)
          )
          .filter((r) => {
            const valid = ALLOWED_RELATION_TYPES.has(r.relation_type)
            if (!valid) invalidTypeCount++
            return valid
          })
          .map((r) => ({
            source: r.source,
            target: r.target,
            relation_type: r.relation_type,
            description: r.description || '',
            source_note_id: noteId
          }))

        if (invalidTypeCount > 0) {
          logger.warn(
            `Filtered out ${invalidTypeCount} incremental cross-chunk relation(s) with invalid type in doc #${noteId}`
          )
        }
        return filtered
      }
    } catch (error) {
      logger.warn('Incremental cross-chunk relation extraction failed:', error)
    }

    return []
  }

  /**
   * 统一抽取：从文本块中同时抽取实体和关系（一次 LLM 调用）
   */
  private async extractEntitiesAndRelations(
    text: string,
    noteId: number
  ): Promise<{
    entities: Omit<ExtractedEntity, 'source_doc_ids'>[]
    relations: (ExtractedRelation & { source_note_id: number })[]
  }> {
    try {
      const parsed = await this.cachedStructuredInvoke<UnifiedExtractionOutput>(
        ENTITY_RELATION_EXTRACTION_PROMPT.replace('{text}', text),
        this.unifiedParser
      )

      if (parsed) {
        const entityNames = new Set<string>()
        const entities = (parsed.entities || [])
          .map((e) => ({
            name: (e.name || '').trim(),
            type: ALLOWED_ENTITY_TYPES.has(e.type) ? e.type : 'other',
            description: e.description || '',
            aliases: [] as string[],
            confidence: e.confidence >= 0 && e.confidence <= 1 ? e.confidence : 0.7
          }))
          .filter((e) => e.name.length > 0)

        for (const e of entities) {
          entityNames.add(e.name)
        }

        let invalidRelationCount = 0
        const relations = (parsed.relations || [])
          .filter(
            (r) =>
              r.source &&
              r.target &&
              r.relation_type &&
              entityNames.has(r.source) &&
              entityNames.has(r.target) &&
              r.source !== r.target
          )
          .filter((r) => {
            const valid = ALLOWED_RELATION_TYPES.has(r.relation_type)
            if (!valid) invalidRelationCount++
            return valid
          })
          .map((r) => ({
            source: r.source,
            target: r.target,
            relation_type: r.relation_type,
            description: r.description || '',
            source_note_id: noteId
          }))

        if (invalidRelationCount > 0) {
          logger.warn(
            `Filtered out ${invalidRelationCount} relation(s) with invalid type in chunk of doc #${noteId}`
          )
        }

        return { entities, relations }
      }
    } catch (error) {
      logger.warn('Unified extraction failed for chunk:', error)
    }

    return { entities: [], relations: [] }
  }
}
