import logger from 'electron-log'
import {
  batchUpsertEntities,
  batchUpsertRelations,
  batchUpdateEntityConfidence,
  upsertBuildJob,
  deleteEntitiesByWikiId,
  deleteRelationsByWikiId,
  getFullGraphData,
  GraphData,
  updateBuildJob
} from '../../database/mapper/graph'
import { splitByMarkdownHeaders, filterEntitiesInText, applyHybridConfidence } from '../utils'
import type {
  BuildConfig,
  ExtractedEntity,
  ExtractedRelation,
  ProgressCallback,
  TextChunk
} from '../types'
import type { ServiceContext } from './llm-invoke'
import { collectWikiDocs } from './collect-docs'
import { extractEntitiesAndRelations, gleanEntities } from './extraction'
import { mergeEntities } from './merging'
import { extractIncrementalCrossChunkRelations } from './cross-chunk'

export async function buildGraph(
  ctx: ServiceContext,
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
    const docEntries = await collectWikiDocs(wikiId)
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
        batch.map((chunk) => extractEntitiesAndRelations(ctx, chunk.content, chunk.docId))
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
      const processedDocs = new Set(allChunks.slice(0, i + maxConcurrency).map((c) => c.docId)).size
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

    // ========== Phase 2: Gleaning 二次抽取 ==========
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
                batch.map((chunk) => gleanEntities(ctx, chunk.content, existingNames))
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

    // ========== Phase 3: 实体消歧合并 ==========
    currentPhaseIndex = PHASE_ORDER.indexOf('merge_entities')
    phaseProgress = 0
    sendProgress('merge_entities', '实体消歧合并中...', {
      totalDocs,
      entityCount: entityNameToId.size,
      relationCount: allExtractedRelations.length
    })
    let mergedEntities = await mergeEntities(ctx, allExtractedEntities, (done, total) => {
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

    // ========== Phase 4: 跨块关系补全 ==========
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

      const allDocPairs = allExtractedRelations
        .filter((r) => r.source_note_id === docId)
        .map((r) => ({ source: r.source, target: r.target }))

      const chunkEntityLists: { name: string; type: string; description: string }[][] = []
      for (const chunk of chunks) {
        const names = filterEntitiesInText(allEntityNames, chunk.content)
        chunkEntityLists.push(names.map((name) => entityDescMap.get(name)!).filter(Boolean))
      }

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
            extractIncrementalCrossChunkRelations(
              ctx,
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
