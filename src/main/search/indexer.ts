import { Index } from 'flexsearch'
import Database from 'flexsearch/db/sqlite'
import * as sqlite3 from 'sqlite3'
import { existsSync } from 'fs'
import logger from 'electron-log'

// 定义文档类型 (根据你的实际数据结构修改，例如笔记或待办事项)
interface IndexableDocument {
  id: number | string
  title: string
  summary: string | null
}

class FlexSearchIndexer {
  private index: Index // FlexSearch Index 实例
  private readonly db: Database // FlexSearch Database 实例
  private isInitialized = false
  private readonly sqlitePath: string // 保存数据库文件路径

  constructor(sqlitePath: string) {
    this.sqlitePath = sqlitePath

    // 检查文件是否存在
    const dbExists = existsSync(this.sqlitePath)
    if (dbExists) {
      logger.info(`SQLite database file found at: ${this.sqlitePath}. Opening...`)
    } else {
      logger.info(
        `SQLite database file does not exist at: ${this.sqlitePath}. Creating a new one...`
      )
    }

    this.db = new Database('RytenBenchIndex', {
      db: new sqlite3.Database(this.sqlitePath)
    })

    // 创建 FlexSearch Index 实例
    this.index = new Index({
      tokenize: 'forward',
      context: true
    })
  }

  /**
   * 挂载索引到 SQLite 数据库，加载现有索引或创建新索引
   */
  async initializeIndex(): Promise<void> {
    if (this.isInitialized) {
      logger.info('FlexSearch index already initialized.')
      return
    }

    try {
      logger.info(`Mounting FlexSearch index to SQLite: ${this.sqlitePath}`)
      await this.index.mount(this.db)
      this.isInitialized = true
      logger.info('FlexSearch index mounted successfully.')
    } catch (error) {
      logger.error('Error mounting FlexSearch index:', error)
      throw error
    }
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
   * 显式提交当前所有更改到数据库
   */
  async commit(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('FlexSearch index not initialized. Call initializeIndex first.')
    }
    await this.index.commit()
    logger.info('FlexSearch index changes committed to database.')
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
