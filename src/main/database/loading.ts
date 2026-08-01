import * as path from 'path'
import { app } from 'electron'
import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs/promises'
import logger from 'electron-log'

logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
logger.transports.file.fileName = 'database.log'

// 定义数据库文件路径
const dbDir = path.join(app.getPath('userData'), 'RytenBenchDB')

// 定义 SQL 文件路径
const sqlDir = app.isPackaged
  ? path.join(process.resourcesPath, 'database', 'sql')
  : path.join(app.getAppPath(), 'src', 'main', 'database', 'sql')
const schemaMigrationsSqlPath = path.join(sqlDir, 'schema_migrations.sql')
const imagesSqlPath = path.join(sqlDir, 'images.sql')
const todosSqlPath = path.join(sqlDir, 'todos.sql')
const plannerSqlPath = path.join(sqlDir, 'planner.sql')
const wikiSqlPath = path.join(sqlDir, 'wiki.sql')
const chatSqlPath = path.join(sqlDir, 'chat.sql')
const musicSqlPath = path.join(sqlDir, 'music.sql')
const nodePositionsSqlPath = path.join(sqlDir, 'node_positions.sql')
const graphTablesSqlPath = path.join(sqlDir, 'graph.sql')
const agentConfigSqlPath = path.join(sqlDir, 'agent_config.sql')
const llmProvidersSqlPath = path.join(sqlDir, 'llm_providers.sql')

export class Database {
  private db: PGlite | null = null

  constructor() {
    // 构造函数不自动初始化
  }

  async initialize(): Promise<void> {
    if (this.db) {
      logger.warn('Database already initialized')
      return
    }

    // 确保目录存在
    await fs.mkdir(dbDir, { recursive: true })

    this.db = new PGlite(dbDir)
    logger.info('Connected to PGLite database at:', dbDir)
    await this.initializeTables()
  }

  private async initializeTables(): Promise<void> {
    await this.executeSQLFile(schemaMigrationsSqlPath, 'schema_migrations.sql')
    await this.executeSQLFile(imagesSqlPath, 'images.sql')
    await this.executeSQLFile(todosSqlPath, 'todos.sql')
    await this.executeSQLFile(plannerSqlPath, 'planner.sql')
    await this.executeSQLFile(wikiSqlPath, 'wiki.sql')
    await this.executeSQLFile(chatSqlPath, 'chat.sql')
    await this.executeSQLFile(musicSqlPath, 'music.sql')
    await this.executeSQLFile(nodePositionsSqlPath, 'node_positions.sql')
    await this.executeSQLFile(graphTablesSqlPath, 'graph_tables.sql')
    await this.executeSQLFile(agentConfigSqlPath, 'agent_config.sql')
    await this.executeSQLFile(llmProvidersSqlPath, 'llm_providers.sql')
    logger.info('Initialization and SQL file execution complete.')
  }

  // 执行指定的 SQL 文件（不检查重复执行）
  private async executeSQLFile(filePath: string, scriptName: string): Promise<void> {
    logger.info(`Reading SQL file: ${filePath}`)
    const sqlContent = await fs.readFile(filePath, 'utf8')
    logger.info(`Executing SQL file: ${scriptName}`)
    await this.db!.exec(sqlContent)
    logger.info(`Successfully executed SQL file: ${scriptName}`)
  }

  getDatabase(): PGlite {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
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

// 工厂函数 - 主动创建和初始化
export async function createDatabase(): Promise<Database> {
  const database = new Database()
  await database.initialize()
  return database
}

// 如果需要单例模式
let singletonInstance: Database | null = null

export async function getDatabase(): Promise<Database> {
  if (!singletonInstance) {
    singletonInstance = new Database()
    await singletonInstance.initialize()
  }
  return singletonInstance
}
