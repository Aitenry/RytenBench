/* 图谱设置页词条。 */
export const zhCNGraphSettings = {
  pageTitle: '图谱构建设置',
  pageDescription: '管理知识图谱构建参数与默认模型配置',
  build: {
    sectionTitle: '构建参数',
    maxConcurrencyTitle: '最大并发 LLM 调用数',
    maxConcurrencyDescription:
      '构建知识图谱时同时进行的 LLM 请求数量，值越大构建越快但对 API 压力也越大',
    gleaningTitle: 'Gleaning 二次扫描',
    gleaningDescription: '实体抽取后再扫描一次，确保遗漏的实体也被发现',
    gleaningThresholdTitle: 'Gleaning 文档数阈值',
    gleaningThresholdDescription:
      '仅当知识库文档总数不超过此阈值时才执行 Gleaning，超出则跳过以节省时间',
    chunkSizeTitle: '文本分块大小',
    chunkSizeDescription: 'Markdown 文本按标题层级分块时每块的最大字符数'
  },
  model: {
    sectionTitle: '默认模型',
    graphModelTitle: '图谱构建使用模型',
    graphModelDescription: '构建知识图谱时默认使用的大模型，留空则使用供应商默认设置',
    graphModelPlaceholder: '使用供应商默认设置',
    embeddingTitle: 'Embedding 模型',
    embeddingDescription: '用于文本向量化嵌入的模型，仅显示标记为嵌入标签的供应商',
    embeddingPlaceholder: '未设置 Embedding 模型',
    embeddingEmpty: '暂无 Embedding 模型，请先在模型设置中添加'
  }
}
