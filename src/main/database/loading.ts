import * as path from 'path'
import { app } from 'electron'
import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs/promises'
import logger from 'electron-log'

logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
logger.transports.file.fileName = 'database.log'

// 定义数据库文件路径
const dbDir = path.join(app.getPath('userData'), 'RytenBenchDB')

// 定义 SQL 文件路径（开发模式下直接读取源码目录；打包后随 extraResources 复制到 resources/database/sql）
const sqlDir = app.isPackaged
  ? path.join(process.resourcesPath, 'database', 'sql')
  : path.join(app.getAppPath(), 'src', 'main', 'database', 'sql')

/** 单个 SQL 文件信息（文件名约定：`序号_表名.sql`，如 `004_todo_items.sql`） */
export interface SqlFileInfo {
  /** 完整文件名，如 `004_todo_items.sql` */
  name: string
  /** 表名，如 `todo_items`（从文件名中提取） */
  tableName: string
  /** 完整路径 */
  path: string
}

/** 提取表名：`004_todo_items.sql` → `todo_items`；非标准命名返回文件名本身 */
function extractTableName(fileName: string): string {
  const match = /^\d+_(.+)\.sql$/i.exec(fileName)
  return match ? match[1] : fileName.replace(/\.sql$/i, '')
}

/**
 * 列出数据库初始化所需的所有 SQL 文件（按文件名排序，数字前缀保证外键依赖顺序）。
 * 开发/打包两种模式下 sqlDir 不同，统一在此扫描。
 */
export async function listSqlFiles(): Promise<SqlFileInfo[]> {
  const entries = await fs.readdir(sqlDir)
  const files = entries.filter((name) => name.toLowerCase().endsWith('.sql')).sort() // 数字前缀排序：001_xxx 在 002_xxx 之前
  return files.map((name) => ({
    name,
    tableName: extractTableName(name),
    path: path.join(sqlDir, name)
  }))
}

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

  /** 执行单个表 SQL 文件（建表 + 索引 + 迁移语句，全部幂等） */
  async executeTable(file: SqlFileInfo): Promise<void> {
    if (!this.db) {
      throw new Error('Database not connected. Call connect() first.')
    }
    logger.info(`Reading SQL file: ${file.name} (table=${file.tableName})`)
    const sqlContent = await fs.readFile(file.path, 'utf8')
    logger.info(`Executing SQL file: ${file.name} (table=${file.tableName})`)
    await this.db.exec(sqlContent)
    logger.info(`Successfully executed SQL file: ${file.name} (table=${file.tableName})`)
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

// 工厂函数 - 创建并连接数据库（建表由调用方按步骤逐个执行）
export async function createDatabase(): Promise<Database> {
  const database = new Database()
  await database.connect()
  return database
}

// 如果需要单例模式
let singletonInstance: Database | null = null

export async function getDatabase(): Promise<Database> {
  if (!singletonInstance) {
    singletonInstance = new Database()
    await singletonInstance.connect()
    const sqlFiles = await listSqlFiles()
    for (const file of sqlFiles) {
      await singletonInstance.executeTable(file)
    }
  }
  return singletonInstance
}
