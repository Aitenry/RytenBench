/**
 * 知识图谱构建进度文案（进度卡与通知里显示的阶段名 + 进度描述）。
 * 由 `src/main/graph/service/{build-graph,append-docs}.ts` 下发给渲染进程。
 * 中文是源语言，`enUSGraphProgress` 用 `typeof zhCNGraphProgress` 约束。
 */
export const zhCNGraphProgress = {
  /** 阶段名：sendProgress 的第一个参数（phase key）对应 weight 表里的 label */
  labels: {
    cleanup: '清理数据',
    collect: '收集文档',
    extract: '抽取实体与关系',
    gleaning: '二次抽取遗漏实体',
    mergeEntities: '实体消歧合并',
    crossChunk: '跨块关系补全',
    saveEntities: '保存实体',
    loadExistingRelations: '加载已有关系',
    adjustConfidence: '计算混合置信度',
    updateConfidence: '更新实体置信度',
    saveRelations: '保存关系'
  },
  /** 进度描述：sendProgress 的第二个参数 */
  messages: {
    cleaningUp: '清理已有图谱数据...',
    cleanupDone: '清理完成',
    collectingWikiDocs: '收集知识库文档...',
    collectDone: '收集完成，共 {{count}} 篇文档',
    readingDocs: '读取文档内容...',
    preparingChunks: '准备文本分块...',
    loadingExistingEntities: '加载已有图谱实体...',
    extractionStarted: '开始实体和关系抽取... {{count}} 个文本块',
    extractionProgress: '抽取中... {{done}}/{{total}} 块（{{entities}} 实体，{{relations}} 关系）',
    gleaningStarted: '二次扫描遗漏实体... {{count}} 个文本块',
    gleaningProgress: '二次抽取中... {{done}}/{{total}} 块（{{entities}} 实体）',
    merging: '实体消歧合并中...',
    mergingBatches: '实体消歧合并中... {{done}}/{{total}} 批次',
    mergingDone: '实体消歧合并完成，共 {{count}} 个实体',
    crossChunkStarted: '跨块关系补全中... {{count}} 个片段',
    crossChunkProgress: '跨块关系补全中... {{done}}/{{total}}',
    savingEntities: '保存 {{count}} 个实体...',
    entitiesSaved: '实体保存完成',
    loadingExistingRelations: '加载已有关系...',
    relationsLoaded: '加载完成，共 {{count}} 条关系',
    adjustingConfidence: '计算混合置信度...',
    updatingConfidence: '更新实体置信度...',
    confidenceUpdated: '实体置信度更新完成',
    /** build-graph 保存的是跨块关系 */
    savingRelations: '保存跨块关系...',
    /** append-docs 保存的是全部关系 */
    savingCrossChunkRelations: '保存关系...',
    relationsSaved: '关系保存完成，共 {{count}} 条',
    docFallbackTitle: '文档 #{{id}}'
  },
  /** 会经 IPC 冒到界面上的错误 */
  errors: {
    emptyDocs: '所选文档均不存在或内容为空'
  }
}

export const enUSGraphProgress: typeof zhCNGraphProgress = {
  labels: {
    cleanup: 'Cleaning up data',
    collect: 'Collecting documents',
    extract: 'Extracting entities and relations',
    gleaning: 'Gleaning missed entities',
    mergeEntities: 'Merging duplicate entities',
    crossChunk: 'Completing cross-chunk relations',
    saveEntities: 'Saving entities',
    loadExistingRelations: 'Loading existing relations',
    adjustConfidence: 'Computing hybrid confidence',
    updateConfidence: 'Updating entity confidence',
    saveRelations: 'Saving relations'
  },
  messages: {
    cleaningUp: 'Cleaning up existing graph data...',
    cleanupDone: 'Cleanup complete',
    collectingWikiDocs: 'Collecting knowledge base documents...',
    collectDone: 'Collection complete — {{count}} documents',
    readingDocs: 'Reading document contents...',
    preparingChunks: 'Preparing text chunks...',
    loadingExistingEntities: 'Loading existing graph entities...',
    extractionStarted: 'Starting entity and relation extraction... {{count}} chunks',
    extractionProgress:
      'Extracting... chunk {{done}}/{{total}} ({{entities}} entities, {{relations}} relations)',
    gleaningStarted: 'Scanning for missed entities... {{count}} chunks',
    gleaningProgress: 'Second pass... chunk {{done}}/{{total}} ({{entities}} entities)',
    merging: 'Merging duplicate entities...',
    mergingBatches: 'Merging duplicate entities... batch {{done}}/{{total}}',
    mergingDone: 'Entity merge complete — {{count}} entities',
    crossChunkStarted: 'Completing cross-chunk relations... {{count}} segments',
    crossChunkProgress: 'Completing cross-chunk relations... {{done}}/{{total}}',
    savingEntities: 'Saving {{count}} entities...',
    entitiesSaved: 'Entities saved',
    loadingExistingRelations: 'Loading existing relations...',
    relationsLoaded: 'Loading complete — {{count}} relations',
    adjustingConfidence: 'Computing hybrid confidence...',
    updatingConfidence: 'Updating entity confidence...',
    confidenceUpdated: 'Entity confidence updated',
    savingRelations: 'Saving cross-chunk relations...',
    savingCrossChunkRelations: 'Saving relations...',
    relationsSaved: 'Relations saved — {{count}} total',
    docFallbackTitle: 'Document #{{id}}'
  },
  errors: {
    emptyDocs: 'None of the selected documents exist or they are all empty'
  }
}
