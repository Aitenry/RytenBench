/* 记忆设置页词条（Mnemon 三层记忆管理）。 */
export const zhCNMemorySettings = {
  page: {
    title: '记忆（Mnemon）',
    description:
      '三层记忆：热记忆（每轮注入）· 长期记忆空间（按需召回）· 项目档案（完整文档）。存储于记忆根目录下，并按工作区目录隔离（每个工作区一套独立记忆，互不串扰）。'
  },
  storage: {
    sectionTitle: '记忆存储目录',
    placeholder: '例如：E:\\RytenBench\\Memory（留空不启用）',
    browse: '浏览…',
    activePath: '当前已生效：{{path}}',
    saved: '记忆目录已保存',
    cleared: '已清空记忆目录',
    selectFailed: '选择目录失败: {{reason}}'
  },
  enable: {
    sectionTitle: '启用记忆',
    empty: '未配置记忆目录，模型将没有持久记忆。',
    emptyHint: '在上方选择一个目录（例如 E:\\RytenBench\\Memory）并保存即可启用三层记忆。'
  },
  manage: {
    sectionTitle: '记忆管理',
    snapshotFailed: '加载记忆快照失败: {{reason}}'
  },
  tabs: {
    runtime: '热记忆（{{count}}）',
    bodies: '长期空间（{{count}}）',
    documents: '档案（{{count}}）'
  },
  importance: {
    label: '重要性',
    critical: '重要',
    normal: '普通',
    low: '次要'
  },
  runtime: {
    bytes: '{{used}} / {{limit}} 字节',
    count: '{{count}} 条',
    add: '记住',
    emptyUser: '暂无用户画像记忆',
    emptyMemory: '暂无项目记忆',
    removeConfirm: '删除这条记忆？',
    contentRequired: '请输入记忆内容'
  },
  targets: {
    userLabel: '用户画像',
    userDesc: '身份 · 偏好 · 沟通风格',
    userPlaceholder: '输入要记住的用户信息，如：偏好深色主题、喜欢编辑部风格设计',
    userHint: '用户画像容量 4 KiB；重要度高的条目整理时优先保留。',
    memoryLabel: '项目记忆',
    memoryDesc: '决策 · 约定 · 可复用经验',
    memoryPlaceholder: '输入要记住的项目信息，如：重构方案已定稿，底层用 LangChain',
    memoryHint: '项目记忆容量 10 KiB，写满后低优先级条目自动归档到长期空间。'
  },
  bodies: {
    namePlaceholder: '空间名称，如：Blog 项目',
    descriptionPlaceholder: '路由描述：什么内容属于这里、何时召回',
    create: '创建空间',
    nameRequired: '请输入空间名称',
    created: '已创建「{{name}}」',
    empty: '暂无记忆空间。模型对话中可通过 mnemon_memory_body_create 工具创建，或在这里手动创建。',
    active: '激活',
    inactive: '未激活',
    unhealthy: '异常',
    stats: '洞察 {{insights}} · 关系 {{edges}} · 已删 {{deleted}}',
    content: '内容',
    participatesInRecall: '参与召回',
    excludedFromRecall: '不参与召回'
  },
  insights: {
    title: '「{{name}}」内容',
    empty: '空间内暂无内容',
    meta: '{{category}} · 重要度 {{importance}} · {{date}}'
  },
  documents: {
    empty: '暂无项目档案。模型对话中可通过 mnemon_document_manage 工具创建设计 / 流程 / 交接文档。',
    updatedAt: '更新于 {{time}} · revision {{revision}}'
  },
  mechanism: {
    sectionTitle: '记忆机制说明',
    runtimeTitle: '热记忆',
    runtimeDesc:
      'USER 用户画像（4 KiB）+ MEMORY 项目记忆（10 KiB），每轮自动注入；模型用 mnemon_runtime_memory 工具维护；MEMORY 写满自动归档到长期空间。',
    bodiesTitle: '长期记忆空间',
    bodiesDesc:
      '跨会话稳定洞察，每空间独立数据库 + 四类关系；mnemon_recall 召回、mnemon_remember 沉淀；激活状态控制是否参与召回。',
    documentsTitle: '项目档案',
    documentsDesc:
      '完整 Markdown 文档（设计/流程/交接），active 参与搜索、archived 冷层；mnemon_document_manage 创建，mnemon_document_search 检索。'
  }
}
