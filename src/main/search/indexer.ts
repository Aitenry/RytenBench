import { Index } from 'flexsearch'
import logger from 'electron-log'

// 定义文档类型
interface IndexableDocument {
  id: number | string
  title: string
  summary: string | null
}

class FlexSearchIndexer {
  private index: Index
  private isInitialized = false

  constructor() {
    // 创建 FlexSearch Index 实例（内存模式，无需 SQLite）
    this.index = new Index({
      tokenize: 'forward',
      context: true
    })
  }

  /**
   * 初始化索引（内存模式，启动时需重建索引）
   */
  async initializeIndex(): Promise<void> {
    if (this.isInitialized) {
      logger.info('FlexSearch index already initialized.')
      return
    }

    this.isInitialized = true
    logger.info('FlexSearch index initialized (in-memory mode).')
  }

  /**
   * 从数据库重建索引
   */
  async rebuildFromDocuments(docs: IndexableDocument[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('FlexSearch index not initialized. Call initializeIndex first.')
    }

    // 清空现有索引并重建
    logger.info(`Rebuilding FlexSearch index from ${docs.length} documents...`)
    for (const doc of docs) {
      const contentToIndex = `${doc.title || ''} ${doc.summary || ''}`.trim()
      this.index.add(doc.id, contentToIndex)
    }
    logger.info('FlexSearch index rebuild complete.')
  }

  /**
   * 添加文档到索引
   */
  async addDocument(doc: IndexableDocument): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('FlexSearch index not initialized. Call initializeIndex first.')
    }

    const contentToIndex = `${doc.title || ''} ${doc.summary || ''}`.trim()
    this.index.add(doc.id, contentToIndex)
    logger.debug(`Document ID ${doc.id} added/updated in index.`)
  }

  /**
   * 更新文档到索引
   */
  async updateDocument(doc: IndexableDocument): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('FlexSearch index not initialized. Call initializeIndex first.')
    }

    const contentToIndex = `${doc.title || ''} ${doc.summary || ''}`.trim()
    this.index.update(doc.id, contentToIndex)
    logger.debug(`Document ID ${doc.id} added/updated in index.`)
  }

  /**
   * 从索引中删除文档
   */
  async removeDocument(docId: string | number): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('FlexSearch index not initialized. Call initializeIndex first.')
    }

    this.index.remove(docId)
    logger.debug(`Document ID ${docId} removed from index.`)
  }

  /**
   * 执行搜索
   * @param query - 搜索查询字符串
   * @param limit - 限制返回结果数量 (可选)
   * @returns 搜索结果 ID 数组
   */
  async search(query: string, limit?: number): Promise<(string | number)[]> {
    if (!this.isInitialized) {
      throw new Error('FlexSearch index not initialized. Call initializeIndex first.')
    }

    const results = this.index.search(query, { limit: limit || 9 })
    logger.debug(`Search for "${query}" returned ${results.length} results.`)
    return results
  }

  /**
   * 显式提交（内存模式下为空操作，保留以保持 API 兼容）
   */
  async commit(): Promise<void> {
    // 内存模式下无需显式提交
  }

  /**
   * 获取索引是否已初始化
   */
  get initialized(): boolean {
    return this.isInitialized
  }
}

export { FlexSearchIndexer }
export type { IndexableDocument }
