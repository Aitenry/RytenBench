import * as path from 'path'
import { app } from 'electron'
import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs/promises'
import logger from 'electron-log'

logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
logger.transports.file.fileName = 'database.log'

// 定义数据库文件路径
const dbDir = path.join(app.getPath('userData'), 'RytenBenchDB')

export class Database {
  private db: PGlite | null = null

  constructor() {
    // 构造函数不自动初始化
  }

  /** 连接数据库（创建 PGlite 实例并确保数据目录存在） */
  async connect(): Promise<void> {
    if (this.db) {
      logger.warn('Database already connected')
      return
    }

    // 确保目录存在
    await fs.mkdir(dbDir, { recursive: true })

    this.db = new PGlite(dbDir)
    logger.info('Connected to PGLite database at:', dbDir)
  }

  getDatabase(): PGlite {
    if (!this.db) {
      throw new Error('Database not initialized. Call connect() first.')
    }
    return this.db
  }

  isInitialized(): boolean {
    return this.db !== null
  }

  async close(): Promise<void> {
    if (!this.db) {
      logger.warn('Database not initialized, nothing to close')
      return
    }

    await this.db.close()
    logger.info('Database connection closed.')
    this.db = null
  }
}

/**
 * 工厂函数 - 创建并连接数据库。
 * 建表结构由 `runMigrations()` 按 drizzle 迁移文件应用（见 ./orm.ts），本类只负责连接生命周期。
 */
export async function createDatabase(): Promise<Database> {
  const database = new Database()
  await database.connect()
  return database
}
