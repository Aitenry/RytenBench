import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { StructuredOutputParser } from '@langchain/core/output_parsers'
import logger from 'electron-log'
import { parseFromLLM } from 'json-llm-repair'
import type { z } from 'zod/v3'
import {
  batchUpsertEntities,
  batchUpsertRelations,
  upsertBuildJob,
  deleteEntitiesByWikiId,
  deleteRelationsByWikiId,
  getFullGraphData,
  getBuildJobByWikiId,
  GraphData,
  updateBuildJob
} from '../database/mapper/graph'
import { getDocById } from '../database/mapper/document'
import { getDirectoriesByWikiId, getDocsByDirectoryId } from '../database/mapper/wiki'
import {
  ENTITY_EXTRACTION_PROMPT,
  ENTITY_GLEANING_PROMPT,
  ENTITY_MERGING_PROMPT,
  RELATION_EXTRACTION_PROMPT,
  CROSS_CHUNK_RELATION_PROMPT
} from './prompts'
import {
  EntitiesArraySchema,
  EntityMergingResultSchema,
  RelationsArraySchema,
  type EntitiesArrayOutput,
  type EntityMergingResultOutput,
  type RelationsArrayOutput
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
}

interface ExtractedEntity {
  name: string
  type: string
  description: string
  aliases: string[]
  confidence: number
  source_doc_ids: number[]
}

interface ExtractedRelation {
  source: string
  target: string
  relation_type: string
  description: string
}

type ProgressCallback = (progress: {
  phase: string
  processedDocs: number
  totalDocs: number
  message: string
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

export class KnowledgeGraphService {
  private model: BaseChatModel
  private llmCache: Map<string, string>
  private readonly CACHE_MAX_SIZE = 500

  // StructuredOutputParser 实例（每个 schema 一个，仅用于 parse 校验）
  private readonly entityParser = StructuredOutputParser.fromZodSchema(EntitiesArraySchema)
  private readonly mergeParser = StructuredOutputParser.fromZodSchema(EntityMergingResultSchema)
  private readonly relationParser = StructuredOutputParser.fromZodSchema(RelationsArraySchema)

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

    // 1. 创建/重置构建任务
    const jobId = await upsertBuildJob(wikiId, config as Record<string, unknown>)

    try {
      // 2. 如果是强制重建，清空已有图谱数据
      if (config?.force) {
        onProgress?.({
          phase: 'cleanup',
          processedDocs: 0,
          totalDocs: 0,
          message: '清理已有图谱数据...'
        })
        await deleteRelationsByWikiId(wikiId)
        await deleteEntitiesByWikiId(wikiId)
      }

      // 3. 快速收集所有文档
      onProgress?.({
        phase: 'collect',
        processedDocs: 0,
        totalDocs: 0,
        message: '收集知识库文档...'
      })
      const docEntries = await this.collectWikiDocs(wikiId)
      const totalDocs = docEntries.length

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

      // ========== Phase 1: 分块 + 实体抽取 ==========
      onProgress?.({
        phase: 'extract_entities',
        processedDocs: 0,
        totalDocs,
        message: '准备文本分块...'
      })

      // 将文档按 Markdown 标题层级分块
      const allChunks: TextChunk[] = []
      for (const entry of docEntries) {
        const chunks = splitByMarkdownHeaders(entry.content, config?.maxChunkSize)
        chunks.forEach((chunk, idx) => {
          allChunks.push({ docId: entry.docId, chunkIndex: idx, content: chunk })
        })
      }

      const totalChunks = allChunks.length
      onProgress?.({
        phase: 'extract_entities',
        processedDocs: 0,
        totalDocs,
        message: `开始实体抽取... ${totalChunks} 个文本块`
      })

      // 并发抽取实体（分批控制并发数）
      const chunkEntities: Map<number, Omit<ExtractedEntity, 'source_doc_ids'>[]> = new Map()

      for (let i = 0; i < allChunks.length; i += maxConcurrency) {
        const batch = allChunks.slice(i, i + maxConcurrency)
        const batchResults = await Promise.all(
          batch.map((chunk) => this.extractEntitiesFromChunk(chunk.content))
        )

        for (let j = 0; j < batch.length; j++) {
          const docId = batch[j].docId
          const existing = chunkEntities.get(docId) || []
          chunkEntities.set(docId, [...existing, ...batchResults[j]])
        }

        const processedChunks = Math.min(i + maxConcurrency, totalChunks)
        const processedDocs = new Set(allChunks.slice(0, i + maxConcurrency).map((c) => c.docId))
          .size
        onProgress?.({
          phase: 'extract_entities',
          processedDocs: Math.min(processedDocs, totalDocs),
          totalDocs,
          message: `实体抽取中... ${processedChunks}/${totalChunks} 块`
        })
        await updateBuildJob(jobId, { processed_notes: processedDocs })
      }

      // ========== Phase 2: Gleaning 二次抽取（可选，由 gleaningMaxDocs 控制成本上限） ==========
      const enableGleaning = config?.enableGleaning !== false
      if (enableGleaning) {
        const maxGleaningDocs = config?.gleaningMaxDocs ?? 100
        const gleaningEntries =
          maxGleaningDocs > 0 && docEntries.length > maxGleaningDocs
            ? docEntries.slice(0, maxGleaningDocs)
            : docEntries

        if (gleaningEntries.length > 0) {
          onProgress?.({
            phase: 'extract_entities',
            processedDocs: totalDocs,
            totalDocs,
            message: `二次扫描遗漏实体... (${gleaningEntries.length} 篇文档)`
          })

          const gleaningBatchSize = maxConcurrency
          for (let i = 0; i < gleaningEntries.length; i += gleaningBatchSize) {
            const batch = gleaningEntries.slice(i, i + gleaningBatchSize)
            const batchResults = await Promise.all(
              batch.map(async (entry) => {
                const existingEntities = chunkEntities.get(entry.docId) || []
                const existingNames = existingEntities.map((e) => e.name)
                if (existingNames.length === 0) return []
                return this.gleanEntities(entry.content, existingNames)
              })
            )

            for (let j = 0; j < batch.length; j++) {
              if (batchResults[j].length > 0) {
                const existing = chunkEntities.get(batch[j].docId) || []
                chunkEntities.set(batch[j].docId, [...existing, ...batchResults[j]])
              }
            }
          }
        }
      }

      // 聚合所有实体（去重合并同文档内同名实体）
      const allExtractedEntities: ExtractedEntity[] = []
      for (const [docId, entities] of chunkEntities) {
        const seen = new Map<string, ExtractedEntity>()
        for (const e of entities) {
          const existing = seen.get(e.name)
          if (existing) {
            existing.aliases = [...new Set([...existing.aliases, ...e.aliases])]
            existing.confidence = Math.max(existing.confidence, e.confidence)
            if (e.description.length > existing.description.length) {
              existing.description = e.description
            }
          } else {
            seen.set(e.name, {
              ...e,
              source_doc_ids: [docId]
            })
          }
        }
        for (const entity of seen.values()) {
          allExtractedEntities.push(entity)
        }
      }

      // ========== Phase 3: 实体消歧合并 ==========
      onProgress?.({
        phase: 'merge_entities',
        processedDocs: totalDocs,
        totalDocs,
        message: '实体消歧合并中...'
      })
      const mergedEntities = await this.mergeEntities(allExtractedEntities)

      // ========== Phase 4: 批量保存实体 ==========
      onProgress?.({
        phase: 'save_entities',
        processedDocs: totalDocs,
        totalDocs,
        message: `保存 ${mergedEntities.length} 个实体...`
      })

      const entityNameToId = await batchUpsertEntities(
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

      // ========== Phase 5: 关系抽取（按块处理，避免全文过长导致 LLM 上下文溢出） ==========
      const allEntityNames = mergedEntities.map((e) => e.name)

      // 按 Markdown 标题层级重新分块，与实体抽取保持相同粒度
      const relationChunks: TextChunk[] = []
      for (const entry of docEntries) {
        const chunks = splitByMarkdownHeaders(entry.content, config?.maxChunkSize)
        chunks.forEach((chunk, idx) => {
          relationChunks.push({ docId: entry.docId, chunkIndex: idx, content: chunk })
        })
      }

      const totalRelationChunks = relationChunks.length
      const allRelations: (ExtractedRelation & { source_note_id: number })[] = []

      onProgress?.({
        phase: 'extract_relations',
        processedDocs: 0,
        totalDocs,
        message: `开始关系抽取... ${totalRelationChunks} 个文本块`
      })

      for (let i = 0; i < relationChunks.length; i += maxConcurrency) {
        const batch = relationChunks.slice(i, i + maxConcurrency)

        // 预计算每块中出现的实体（只送该块相关的实体，减少 LLM 输入噪声）
        const batchRelevant = batch.map((chunk) => ({
          chunk,
          relevantEntities: filterEntitiesInText(allEntityNames, chunk.content)
        }))

        const batchResults = await Promise.all(
          batchRelevant.map(async ({ chunk, relevantEntities }) => {
            if (relevantEntities.length < 2) return []
            return this.extractRelations(chunk.content, relevantEntities, chunk.docId)
          })
        )

        for (const relations of batchResults) {
          allRelations.push(...relations)
        }

        const processedChunks = Math.min(i + maxConcurrency, totalRelationChunks)
        const processedDocIds = new Set(
          relationChunks.slice(0, i + maxConcurrency).map((c) => c.docId)
        )
        onProgress?.({
          phase: 'extract_relations',
          processedDocs: processedDocIds.size,
          totalDocs,
          message: `关系抽取中... ${processedChunks}/${totalRelationChunks} 块`
        })
      }

      // ========== Phase 5b: 跨块关系补全（轻量级：多块文档逐篇补全跨章节关系） ==========
      // 将 relationChunks 按 docId 分组，找出多块文档中跨块分布但尚未连接的实体
      const docChunksMap = new Map<number, TextChunk[]>()
      for (const chunk of relationChunks) {
        if (!docChunksMap.has(chunk.docId)) docChunksMap.set(chunk.docId, [])
        docChunksMap.get(chunk.docId)!.push(chunk)
      }

      const entityDescMap = new Map(
        mergedEntities.map((e) => [
          e.name,
          { name: e.name, type: e.type, description: e.description }
        ])
      )

      const crossChunkTasks: Array<{
        docId: number
        docTitle: string
        entities: { name: string; type: string; description: string }[]
        existingPairs: { source: string; target: string }[]
      }> = []

      for (const [docId, chunks] of docChunksMap) {
        if (chunks.length < 2) continue

        // 收集该文档所有块中出现的实体
        const docEntitySet = new Set<string>()
        for (const chunk of chunks) {
          filterEntitiesInText(allEntityNames, chunk.content).forEach((e) => docEntitySet.add(e))
        }
        if (docEntitySet.size < 2) continue

        // 该文档已有的 per-chunk 关系
        const existingPairs = allRelations
          .filter((r) => r.source_note_id === docId)
          .map((r) => ({ source: r.source, target: r.target }))

        const entityList = [...docEntitySet]
          .map((name) => entityDescMap.get(name)!)
          .filter(Boolean)

        if (entityList.length < 2) continue

        const docEntry = docEntries.find((e) => e.docId === docId)
        crossChunkTasks.push({
          docId,
          docTitle: docEntry?.title || `文档 #${docId}`,
          entities: entityList,
          existingPairs
        })
      }

      if (crossChunkTasks.length > 0) {
        onProgress?.({
          phase: 'extract_relations',
          processedDocs: totalDocs,
          totalDocs,
          message: `跨块关系补全中... ${crossChunkTasks.length} 篇文档`
        })

        for (let i = 0; i < crossChunkTasks.length; i += maxConcurrency) {
          const batch = crossChunkTasks.slice(i, i + maxConcurrency)
          const batchResults = await Promise.all(
            batch.map(({ docId, docTitle, entities, existingPairs }) =>
              this.extractCrossChunkRelations(docTitle, entities, existingPairs, docId)
            )
          )
          for (const relations of batchResults) {
            allRelations.push(...relations)
          }
        }
      }

      // ========== Phase 6: 去重并批量保存关系 ==========
      onProgress?.({
        phase: 'save_relations',
        processedDocs: totalDocs,
        totalDocs,
        message: '保存关系...'
      })

      // 去重关系
      const relationSet = new Map<string, (typeof allRelations)[0]>()
      for (const rel of allRelations) {
        const sourceId = entityNameToId.get(rel.source)
        const targetId = entityNameToId.get(rel.target)
        if (!sourceId || !targetId || sourceId === targetId) continue

        const key = `${sourceId}:${targetId}:${rel.relation_type}`
        const existing = relationSet.get(key)
        if (existing) {
          existing.source_note_id = existing.source_note_id
            ? existing.source_note_id
            : rel.source_note_id
        } else {
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

    if (totalDocs === 0) {
      return { entitiesAdded: 0, relationsAdded: 0 }
    }

    // 1. 并行读取所有文档内容
    onProgress?.({
      phase: 'collect',
      processedDocs: 0,
      totalDocs,
      message: '读取文档内容...'
    })

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
    onProgress?.({
      phase: 'extract_entities',
      processedDocs: 0,
      totalDocs,
      message: '加载已有图谱实体...'
    })
    const { entities: existingEntities } = await getFullGraphData(wikiId)

    // 3. 分块 + 实体抽取（并行批处理）
    const allChunks: TextChunk[] = []
    for (const entry of docEntries) {
      const chunks = splitByMarkdownHeaders(entry.content, maxChunkSize)
      chunks.forEach((chunk, idx) => {
        allChunks.push({ docId: entry.docId, chunkIndex: idx, content: chunk })
      })
    }

    const totalChunks = allChunks.length
    onProgress?.({
      phase: 'extract_entities',
      processedDocs: 0,
      totalDocs,
      message: `开始实体抽取... ${totalChunks} 个文本块`
    })

    const chunkEntities: Map<number, Omit<ExtractedEntity, 'source_doc_ids'>[]> = new Map()

    for (let i = 0; i < allChunks.length; i += maxConcurrency) {
      const batch = allChunks.slice(i, i + maxConcurrency)
      const batchResults = await Promise.all(
        batch.map((chunk) => this.extractEntitiesFromChunk(chunk.content))
      )

      for (let j = 0; j < batch.length; j++) {
        const docId = batch[j].docId
        const existing = chunkEntities.get(docId) || []
        chunkEntities.set(docId, [...existing, ...batchResults[j]])
      }

      const processedChunks = Math.min(i + maxConcurrency, totalChunks)
      const processedDocs = new Set(allChunks.slice(0, i + maxConcurrency).map((c) => c.docId))
        .size
      onProgress?.({
        phase: 'extract_entities',
        processedDocs: Math.min(processedDocs, totalDocs),
        totalDocs,
        message: `实体抽取中... ${processedChunks}/${totalChunks} 块`
      })
    }

    // Gleaning 二次抽取（可选，由 gleaningMaxDocs 控制成本上限）
    const enableGleaning = config?.enableGleaning !== false
    if (enableGleaning) {
      const maxGleaningDocs = config?.gleaningMaxDocs ?? 100
      const gleaningEntries =
        maxGleaningDocs > 0 && docEntries.length > maxGleaningDocs
          ? docEntries.slice(0, maxGleaningDocs)
          : docEntries

      if (gleaningEntries.length > 0) {
        onProgress?.({
          phase: 'extract_entities',
          processedDocs: totalDocs,
          totalDocs,
          message: `二次扫描遗漏实体... (${gleaningEntries.length} 篇文档)`
        })

        const gleaningBatchSize = maxConcurrency
        for (let i = 0; i < gleaningEntries.length; i += gleaningBatchSize) {
          const batch = gleaningEntries.slice(i, i + gleaningBatchSize)
          const batchResults = await Promise.all(
            batch.map(async (entry) => {
              const existingEntities = chunkEntities.get(entry.docId) || []
              const existingNames = existingEntities.map((e) => e.name)
              if (existingNames.length === 0) return []
              return this.gleanEntities(entry.content, existingNames)
            })
          )

          for (let j = 0; j < batch.length; j++) {
            if (batchResults[j].length > 0) {
              const existing = chunkEntities.get(batch[j].docId) || []
              chunkEntities.set(batch[j].docId, [...existing, ...batchResults[j]])
            }
          }
        }
      }
    }

    const docToEntities = chunkEntities

    // 4. 去重合并同文档内的同名实体，附加 source_doc_ids
    const allNewEntities: ExtractedEntity[] = []
    for (const [docId, entities] of docToEntities) {
      const seen = new Map<string, ExtractedEntity>()
      for (const e of entities) {
        const existing = seen.get(e.name)
        if (existing) {
          existing.aliases = [...new Set([...existing.aliases, ...e.aliases])]
          existing.confidence = Math.max(existing.confidence, e.confidence)
          if (e.description.length > existing.description.length) {
            existing.description = e.description
          }
        } else {
          seen.set(e.name, { ...e, source_doc_ids: [docId] })
        }
      }
      for (const entity of seen.values()) {
        allNewEntities.push(entity)
      }
    }

    if (allNewEntities.length === 0) {
      logger.info('No entities extracted from selected notes')
      return { entitiesAdded: 0, relationsAdded: 0 }
    }

    // 5. 将已有实体转为 ExtractedEntity 格式，与新实体一起合并
    const existingAsExtracted: ExtractedEntity[] = existingEntities.map((e) => ({
      name: e.name,
      type: e.type,
      description: e.description || '',
      aliases: e.aliases ? JSON.parse(e.aliases) : [],
      confidence: e.confidence,
      source_doc_ids: e.source_note_ids ? JSON.parse(e.source_note_ids) : []
    }))

    const allEntitiesForMerge = [...existingAsExtracted, ...allNewEntities]

    onProgress?.({
      phase: 'merge_entities',
      processedDocs: totalDocs,
      totalDocs,
      message: '实体消歧合并中...'
    })
    const mergedEntities = await this.mergeEntities(allEntitiesForMerge)

    // 6. 批量保存实体
    onProgress?.({
      phase: 'save_entities',
      processedDocs: totalDocs,
      totalDocs,
      message: `保存 ${mergedEntities.length} 个实体...`
    })

    const entityNameToId = await batchUpsertEntities(
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

    // 7. 关系抽取（按块处理，避免全文过长导致 LLM 上下文溢出）
    const allEntityNames = mergedEntities.map((e) => e.name)

    // 按 Markdown 标题层级重新分块，与实体抽取保持相同粒度
    const relationChunks: TextChunk[] = []
    for (const entry of docEntries) {
      const chunks = splitByMarkdownHeaders(entry.content, maxChunkSize)
      chunks.forEach((chunk, idx) => {
        relationChunks.push({ docId: entry.docId, chunkIndex: idx, content: chunk })
      })
    }

    const totalRelationChunks = relationChunks.length
    const allRelations: (ExtractedRelation & { source_note_id: number })[] = []

    onProgress?.({
      phase: 'extract_relations',
      processedDocs: 0,
      totalDocs,
      message: `开始关系抽取... ${totalRelationChunks} 个文本块`
    })

    for (let i = 0; i < relationChunks.length; i += maxConcurrency) {
      const batch = relationChunks.slice(i, i + maxConcurrency)

      // 预计算每块中出现的实体（只送该块相关的实体，减少 LLM 输入噪声）
      const batchRelevant = batch.map((chunk) => ({
        chunk,
        relevantEntities: filterEntitiesInText(allEntityNames, chunk.content)
      }))

      const batchResults = await Promise.all(
        batchRelevant.map(async ({ chunk, relevantEntities }) => {
          if (relevantEntities.length < 2) return []
          return this.extractRelations(chunk.content, relevantEntities, chunk.docId)
        })
      )

      for (const relations of batchResults) {
        allRelations.push(...relations)
      }

      const processedChunks = Math.min(i + maxConcurrency, totalRelationChunks)
      const processedDocIds = new Set(
        relationChunks.slice(0, i + maxConcurrency).map((c) => c.docId)
      )
      onProgress?.({
        phase: 'extract_relations',
        processedDocs: processedDocIds.size,
        totalDocs,
        message: `关系抽取中... ${processedChunks}/${totalRelationChunks} 块`
      })
    }

    // ========== Phase 7b: 跨块关系补全（轻量级：多块文档逐篇补全跨章节关系） ==========
    const docChunksMap = new Map<number, TextChunk[]>()
    for (const chunk of relationChunks) {
      if (!docChunksMap.has(chunk.docId)) docChunksMap.set(chunk.docId, [])
      docChunksMap.get(chunk.docId)!.push(chunk)
    }

    const entityDescMap = new Map(
      mergedEntities.map((e) => [
        e.name,
        { name: e.name, type: e.type, description: e.description }
      ])
    )

    const crossChunkTasks: Array<{
      docId: number
      docTitle: string
      entities: { name: string; type: string; description: string }[]
      existingPairs: { source: string; target: string }[]
    }> = []

    for (const [docId, chunks] of docChunksMap) {
      if (chunks.length < 2) continue

      const docEntitySet = new Set<string>()
      for (const chunk of chunks) {
        filterEntitiesInText(allEntityNames, chunk.content).forEach((e) => docEntitySet.add(e))
      }
      if (docEntitySet.size < 2) continue

      const existingPairs = allRelations
        .filter((r) => r.source_note_id === docId)
        .map((r) => ({ source: r.source, target: r.target }))

      const entityList = [...docEntitySet].map((name) => entityDescMap.get(name)!).filter(Boolean)

      if (entityList.length < 2) continue

      const docEntry = docEntries.find((e) => e.docId === docId)
      crossChunkTasks.push({
        docId,
        docTitle: docEntry?.title || `文档 #${docId}`,
        entities: entityList,
        existingPairs
      })
    }

    if (crossChunkTasks.length > 0) {
      onProgress?.({
        phase: 'extract_relations',
        processedDocs: totalDocs,
        totalDocs,
        message: `跨块关系补全中... ${crossChunkTasks.length} 篇文档`
      })

      for (let i = 0; i < crossChunkTasks.length; i += maxConcurrency) {
        const batch = crossChunkTasks.slice(i, i + maxConcurrency)
        const batchResults = await Promise.all(
          batch.map(({ docId, docTitle, entities, existingPairs }) =>
            this.extractCrossChunkRelations(docTitle, entities, existingPairs, docId)
          )
        )
        for (const relations of batchResults) {
          allRelations.push(...relations)
        }
      }
    }

    // 8. 去重并批量保存关系
    onProgress?.({
      phase: 'save_relations',
      processedDocs: totalDocs,
      totalDocs,
      message: '保存关系...'
    })

    const relationSet = new Map<string, (typeof allRelations)[0]>()
    for (const rel of allRelations) {
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
   * 从文本块中抽取实体（使用 StructuredOutputParser + Zod 校验）
   */
  private async extractEntitiesFromChunk(
    text: string
  ): Promise<Omit<ExtractedEntity, 'source_doc_ids'>[]> {
    try {
      const parsed = await this.cachedStructuredInvoke<EntitiesArrayOutput>(
        ENTITY_EXTRACTION_PROMPT.replace('{text}', text),
        this.entityParser
      )

      if (parsed && Array.isArray(parsed)) {
        return parsed
          .map((e) => ({
            name: (e.name || '').trim(),
            type: e.type || 'other',
            description: e.description || '',
            aliases: [] as string[],
            confidence: 0.9
          }))
          .filter((e) => e.name.length > 0)
      }
    } catch (error) {
      logger.warn('Entity extraction failed for chunk:', error)
    }

    return []
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
            confidence: 0.85
          }))
          .filter((e) => e.name.length > 0 && !existingNames.includes(e.name))
      }
    } catch (error) {
      logger.warn('Entity gleaning failed:', error)
    }

    return []
  }

  /**
   * 实体消歧合并（优化：先程序化去重，再 LLM 合并）
   * Stage 2 LLM 合并使用 StructuredOutputParser + Zod 校验
   */
  private async mergeEntities(entities: ExtractedEntity[]): Promise<ExtractedEntity[]> {
    if (entities.length <= 1) return entities

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
          existing.name = entity.name // 用更长的名称
        }
      } else {
        nameMap.set(key, { ...entity })
      }
    }

    const stage1Entities = Array.from(nameMap.values())

    // Stage 2: LLM 合并（只在实体数量适中时使用，含 Zod 校验）
    if (stage1Entities.length > 10 && stage1Entities.length <= 200) {
      try {
        const parsed = await this.cachedStructuredInvoke<EntityMergingResultOutput>(
          ENTITY_MERGING_PROMPT.replace('{entities}', JSON.stringify(stage1Entities, null, 2)),
          this.mergeParser
        )

        if (parsed?.merged && Array.isArray(parsed.merged)) {
          return parsed.merged.map(
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
        }
      } catch (error) {
        logger.warn('Entity merging with LLM failed, using simple dedup:', error)
      }
    }

    return stage1Entities
  }

  /**
   * 从文本中抽取实体间关系（使用 StructuredOutputParser + Zod 校验）
   */
  private async extractRelations(
    text: string,
    entityNames: string[],
    noteId: number
  ): Promise<(ExtractedRelation & { source_note_id: number })[]> {
    if (entityNames.length < 2) return []

    try {
      const parsed = await this.cachedStructuredInvoke<RelationsArrayOutput>(
        RELATION_EXTRACTION_PROMPT.replace('{entities}', JSON.stringify(entityNames)).replace(
          '{text}',
          text
        ),
        this.relationParser
      )

      if (parsed && Array.isArray(parsed)) {
        return parsed
          .filter(
            (r) =>
              r.source &&
              r.target &&
              r.relation_type &&
              entityNames.includes(r.source) &&
              entityNames.includes(r.target)
          )
          .map((r) => ({
            source: r.source,
            target: r.target,
            relation_type: r.relation_type,
            description: r.description || '',
            source_note_id: noteId
          }))
      }
    } catch (error) {
      logger.warn('Relation extraction failed:', error)
    }

    return []
  }

  /**
   * 跨块关系补全（轻量级：仅送实体描述 + 文档标题，不送全文）
   * 用于发现同一篇文档中分散在不同块之间的实体间关系
   */
  private async extractCrossChunkRelations(
    noteTitle: string,
    allEntitiesInNote: { name: string; type: string; description: string }[],
    existingRelations: { source: string; target: string }[],
    noteId: number
  ): Promise<(ExtractedRelation & { source_note_id: number })[]> {
    const entityNames = allEntitiesInNote.map((e) => e.name)
    if (entityNames.length < 2) return []

    try {
      const parsed = await this.cachedStructuredInvoke<RelationsArrayOutput>(
        CROSS_CHUNK_RELATION_PROMPT.replace('{noteTitle}', noteTitle)
          .replace('{entities}', JSON.stringify(allEntitiesInNote))
          .replace(
            '{existingRelations}',
            existingRelations.length > 0 ? JSON.stringify(existingRelations) : '[]'
          ),
        this.relationParser
      )

      if (parsed && Array.isArray(parsed)) {
        // 过滤掉已有关系中的重复
        const existingSet = new Set(existingRelations.map((r) => `${r.source}:${r.target}`))
        return parsed
          .filter(
            (r) =>
              r.source &&
              r.target &&
              r.relation_type &&
              entityNames.includes(r.source) &&
              entityNames.includes(r.target) &&
              !existingSet.has(`${r.source}:${r.target}`)
          )
          .map((r) => ({
            source: r.source,
            target: r.target,
            relation_type: r.relation_type,
            description: r.description || '',
            source_note_id: noteId
          }))
      }
    } catch (error) {
      logger.warn('Cross-chunk relation extraction failed:', error)
    }

    return []
  }
}
