/* 「graph」模块词条：图谱视图、工具条、实体详情、构建进度与画布。 */
export const zhCNGraph = {
  /* 实体类型显示名（键与 types/knowledge.ts 的 ENTITY_TYPE_LABEL_KEYS 一一对应） */
  entityType: {
    person: '人物',
    organization: '组织',
    concept: '概念',
    event: '事件',
    location: '地点',
    other: '其他',
    technology: '技术',
    product: '产品',
    system: '体系',
    document: '文档',
    standard: '标准',
    facility: '设施',
    substance: '物质',
    process: '流程',
    role: '角色',
    skill: '技能',
    measure: '指标',
    artifact: '物品',
    creature: '生物',
    realm: '等级'
  },
  /* 关系类型显示名（同上，对应 RELATION_TYPE_LABEL_KEYS） */
  relationType: {
    contains: '包含',
    part_of: '属于',
    is_a: '是一种',
    located_in: '位于',
    depends_on: '依赖于',
    related_to: '相关于',
    leads_to: '导致',
    uses: '使用',
    creates: '创建',
    produces: '生产',
    operates: '运营',
    owns: '拥有',
    acquires: '获得',
    belongs_to: '归属于',
    governs: '监管',
    monitors: '监测',
    employs: '雇用',
    mentors: '指导',
    friend_of: '朋友',
    enemy_of: '敌人',
    loves: '爱慕',
    family_of: '亲属',
    fights: '战斗',
    kills: '击杀'
  },
  empty: {
    noData: '该知识库还没有图谱数据',
    startBuild: '开始构建图谱',
    noSelection: '点击图谱中的节点查看详情'
  },
  toolbar: {
    stats: '实体 {{entityCount}} | 关系 {{relationCount}}',
    searchPlaceholder: '搜索实体...',
    allDocs: '全部文档',
    noDocs: '暂无文档',
    appendModalTitle: '选择文档追加到图谱',
    appendHint_one: '已加入图谱的文档将不会显示在列表中（{{count}} 篇已加入）',
    appendHint_other: '已加入图谱的文档将不会显示在列表中（{{count}} 篇已加入）',
    appendSearchPlaceholder: '搜索并选择文档...',
    allDocsAdded: '所有文档均已加入图谱',
    appendConfirm: '确认追加'
  },
  build: {
    confirmTitle: '确认构建图谱',
    confirmContent: '将为知识库「{{title}}」重新构建知识图谱，已有图谱数据将被清除。确定继续吗？',
    confirmOk: '确定构建',
    starting: '正在启动图谱构建...',
    started: '图谱构建已启动',
    startFailed: '启动构建失败: {{reason}}',
    completed: '图谱构建完成！实体 {{entityCount}}，关系 {{relationCount}}',
    failed: '图谱构建失败: {{reason}}'
  },
  progress: {
    overallProgress: '整体进度',
    entityLabel: '实体',
    relationLabel: '关系',
    documentsProcessed: '已处理 {{processed}}/{{total}} 篇文档',
    chunksProcessed: '已处理 {{processed}}/{{total}} 个文本块'
  },
  detail: {
    confidence: '置信度: {{percent}}%',
    description: '描述',
    aliases: '别名',
    sourceDocs_one: '来源文档 ({{count}})',
    sourceDocs_other: '来源文档 ({{count}})',
    docFallback: '文档 #{{id}}',
    relatedRelations_one: '关联关系 ({{count}})',
    relatedRelations_other: '关联关系 ({{count}})',
    noRelations: '暂无关联关系',
    /* 关系行：中文词直接连箭头，英文需要在两侧留空格 */
    relationLine: '--{{relation}}→',
    createdAt: '创建时间',
    updatedAt: '更新时间'
  },
  canvas: {
    tooltipDescription: '描述：{{description}}',
    /* 边 tooltip 的三段拼接：中文不加空格，英文要加 */
    edgeTooltip: '{{source}}{{relation}}{{target}}',
    showIsolated_one: '显示 {{count}} 个孤点',
    showIsolated_other: '显示 {{count}} 个孤点',
    hideIsolated_one: '隐藏 {{count}} 个孤点',
    hideIsolated_other: '隐藏 {{count}} 个孤点',
    isolatedHidden_one: '已隐藏 {{count}} 个孤点',
    isolatedHidden_other: '已隐藏 {{count}} 个孤点'
  }
}
