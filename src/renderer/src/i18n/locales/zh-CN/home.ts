/* 「home」模块（首页 / 文档树 / 文档与待办编辑器 / 预览弹窗）词条。
   命名约定：t('home.<group>.<key>')，键名一律 camelCase，不写中文。 */
export const zhCNHome = {
  /* 名词（树分区标题、搜索分组、统计块、面包屑兜底共用） */
  term: {
    doc: '文档',
    docLibrary: '文档库',
    todo: '待办',
    wiki: '知识库',
    directory: '目录',
    graph: '知识图谱',
    properties: '属性'
  },
  /* 待办 / 文档状态名 */
  status: {
    pending: '待办',
    doing: '进行中',
    done: '已完成'
  },
  /* 面包屑 */
  breadcrumb: {
    home: '首页',
    docWithId: '文档 {{id}}',
    todoWithId: '待办 {{id}}'
  },
  /* 表单字段标签与占位提示 */
  field: {
    title: '标题',
    summary: '摘要',
    tags: '标签',
    cover: '封面',
    coverImage: '封面图片',
    coverAlt: '封面',
    dueDate: '截止日期',
    priority: '优先级',
    status: '状态',
    category: '分类',
    startTime: '开始时间',
    completedTime: '完成时间',
    createdTime: '创建时间',
    updatedTime: '更新时间',
    directoryName: '目录名称',
    tagPlaceholder: '输入标签后按回车添加',
    tagPlaceholderMore: '继续添加…',
    selectImage: '选择图片',
    changeImage: '更换图片',
    uploadImage: '上传图片',
    removeImage: '移除图片'
  },
  /* 左侧文档树 */
  tree: {
    createNamed: '新建{{name}}'
  },
  /* 树内搜索 */
  search: {
    placeholder: '搜索文档 / 待办 / 知识库',
    noResults: '无匹配结果'
  },
  /* 文档 */
  doc: {
    untitled: '未命名文档',
    create: '新建文档',
    import: '导入文档',
    importing: '正在导入文档...',
    importSuccess: '文档导入成功',
    importFailed: '导入文档失败',
    creating: '正在创建文档...',
    createSuccess: '文档创建成功',
    createFailed: '创建文档失败',
    delete: '删除文档',
    deleteHard: '彻底删除',
    deleteTitle: '确定要删除文档「{{name}}」吗？',
    deleting: '正在删除文档...',
    deleteSuccess: '文档已删除',
    deleteFailed: '删除文档失败',
    archiveToOtherDir: '归档到其他目录',
    archiveToWiki: '归档到知识库',
    createdAt: '创建于 {{date}}',
    titleWithId: '文档 {{id}}',
    notFound: '文档不存在或已被删除',
    empty: '暂无文档',
    propsSaved: '文档属性已保存',
    propsSaveFailed: '保存文档属性失败'
  },
  /* 待办 */
  todo: {
    untitled: '未命名待办',
    create: '新建待办',
    addTitle: '添加待办事项',
    editTitle: '待办事项详情',
    titlePlaceholder: '请输入待办事项标题',
    categoryPlaceholder: '请输入分类',
    contentPlaceholder: '写点什么…支持 Markdown（# 标题、- 列表、``` 代码块）',
    creating: '正在添加待办事项...',
    createSuccess: '待办事项添加成功',
    createFailed: '添加待办事项失败',
    saving: '正在保存待办...',
    updated: '待办已更新',
    saveFailed: '保存待办失败',
    deleteTitle: '确定要删除这条待办吗？',
    actionStart: '开始任务',
    actionComplete: '标记完成',
    actionReactivate: '重新激活',
    updatingStatus: '正在更新状态...',
    markedDoing: '已标记为进行中',
    reactivated: '已重新激活',
    statusUpdateFailed: '更新状态失败',
    priority: '优先级 P{{level}}',
    duePrefix: '截止 ',
    overduePrefix: '已逾期 · ',
    metaCreated: '创建 {{time}}',
    metaUpdated: '更新 {{time}}',
    metaStarted: '开始 {{time}}',
    metaCompleted: '完成 {{time}}',
    empty: '暂无待办',
    notFound: '待办不存在或已被删除'
  },
  /* 知识库 */
  wiki: {
    create: '新建知识库',
    edit: '编辑知识库',
    titlePlaceholder: '知识库标题',
    summaryPlaceholder: '知识库摘要',
    creating: '正在创建知识库...',
    createSuccess: '知识库创建成功！',
    createFailed: '创建知识库失败',
    saving: '正在保存知识库...',
    updated: '知识库已更新',
    saveFailed: '保存知识库失败',
    delete: '删除知识库',
    deleteTitle: '确定要删除知识库「{{name}}」吗？',
    deleteContent: '删除后知识库及其目录结构将被移除，目录中的文档不会被删除。',
    deleting: '正在删除知识库...',
    deleted: '知识库已删除',
    deleteFailed: '删除知识库失败',
    empty: '暂无知识库',
    notFound: '知识库不存在或已被删除'
  },
  /* 知识库目录 */
  dir: {
    create: '新建目录',
    createChild: '新建子目录',
    createSubTitle: '在「{{name}}」下新建目录',
    renameTitle: '重命名目录',
    defaultName: '新目录',
    creating: '正在创建目录...',
    createSuccess: '目录创建成功！',
    saving: '正在保存目录...',
    saved: '目录已保存',
    saveFailed: '保存目录失败',
    delete: '删除目录',
    deleteTitle: '确定要删除目录「{{name}}」吗？',
    deleteContent: '目录中的文档不会被删除，只会与目录解除关联。',
    deleting: '正在删除目录...',
    deleteSuccess: '目录已删除',
    deleteFailed: '删除目录失败',
    removeDoc: '从目录移除',
    removeDocTitle: '从「{{dir}}」移除「{{name}}」？',
    removeDocContent: '仅解除目录关联，文档本身不会被删除。',
    removing: '正在移除...',
    removed: '已从目录移除',
    removeFailed: '移除失败'
  },
  /* 知识图谱入口 */
  graph: {
    view: '查看图谱'
  },
  /* 文档 / 待办编辑器的保存状态条 */
  editor: {
    saving: '保存中…',
    unsaved: '未保存',
    saved: '已保存',
    savedWithTime: '已保存 {{time}}',
    hint: 'Ctrl+S 立即保存 · 编辑后自动保存'
  },
  /* 右侧大纲面板 */
  outline: {
    title: '大纲',
    empty: '暂无标题',
    wordCount: '字数',
    created: '创建',
    updated: '更新'
  },
  /* 首页仪表盘 */
  dashboard: {
    greetingNight: '夜深了',
    greetingMorning: '早上好',
    greetingAfternoon: '下午好',
    greetingEvening: '晚上好',
    welcomeBack: '{{greeting}}，欢迎回来',
    /* dayjs 日期格式：中文保留「年月日」，英文用本地习惯顺序 */
    dateFormat: 'YYYY 年 M 月 D 日 dddd',
    subtitle: '从左侧文档树选择内容，或快速新建开始记录',
    recentUpdate: '最近更新 {{date}}',
    pendingTodos: '未完成待办',
    overdueCount_one: '{{count}} 项已逾期',
    overdueCount_other: '{{count}} 项已逾期',
    noOverdue: '无逾期',
    wikiSubtitle: '知识沉淀与归档',
    todoSection: '待办事项',
    recentDocsSection: '最近文档',
    noPendingTodos: '暂无未完成的待办',
    noDocsHint: '暂无文档，点击「新建文档」开始写作'
  },
  /* 归档文档弹窗 */
  archive: {
    title: '归档「{{name}}」到知识库目录',
    ok: '归档',
    stepWiki: '1. 选择知识库',
    stepDirectory: '2. 选择目录',
    selectWikiFirst: '请先选择知识库',
    noDirectories: '该知识库暂无目录',
    archiving: '正在归档文档...',
    success: '文档归档成功！',
    failed: '归档文档失败'
  },
  /* 文档属性弹窗 */
  props: {
    title: '文档属性',
    titleWithDoc: '属性 · {{name}}',
    summaryPlaceholder: '一句话描述这篇文档…'
  },
  /* 文档预览弹窗 */
  preview: {
    doc: '文档预览',
    empty: '暂无内容'
  }
}
