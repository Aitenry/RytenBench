import * as path from 'path'
import { app } from 'electron'
import * as sqlite3 from 'sqlite3'
import * as fs from 'fs/promises' // 引入 fs/promises 用于异步读取文件
import logger from 'electron-log'

logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
logger.transports.file.fileName = 'database.log'

// 定义数据库文件路径
const dbPath = path.join(app.getPath('userData'), 'RytenBench.sqlite')

// 定义 SQL 文件路径
const sqlDir = path.join(app.getAppPath(), 'src', 'main', 'database', 'sql')
const createTablesSqlPath = path.join(sqlDir, 'create_tables.sql')
const cityCodeSqlPath = path.join(sqlDir, 'city_code.sql')

export class Database {
  private database: sqlite3.Database | null = null

  constructor() {
    // 构造函数不自动初始化
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.database) {
        logger.warn('Database already initialized')
        resolve()
        return
      }

      // 打开数据库连接
      this.database = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          logger.error('Could not connect to database:', err.message)
          reject(err)
        } else {
          logger.info('Connected to SQLite database at:', dbPath)
          this.initializeTables()
            .then(() => resolve())
            .catch(reject)
        }
      })
    })
  }

  private async initializeTables(): Promise<void> {
    // 读取并执行创建表的 SQL 文件
    return this.executeSQLFile(createTablesSqlPath, 'create_tables.sql')
      .then(() => {
        logger.info('Tables created successfully.')
        // 创建表后，执行插入初始数据的 SQL 文件
        return this.executeSQLFileIfNotDone(cityCodeSqlPath, 'city_code.sql')
      })
      .then(() => {
        logger.info('Initialization and SQL file execution complete.')
      })
  }

  // 执行指定的 SQL 文件（不检查重复执行）
  private async executeSQLFile(filePath: string, scriptName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(`Reading SQL file: ${filePath}`)
      fs.readFile(filePath, 'utf8')
        .then((sqlContent) => {
          logger.info(`Executing SQL file: ${scriptName}`)
          this.database!.exec(sqlContent, (execErr) => {
            if (execErr) {
              logger.error(`Error executing SQL file ${scriptName}:`, execErr.message)
              reject(execErr)
            } else {
              logger.info(`Successfully executed SQL file: ${scriptName}`)
              resolve()
            }
          })
        })
        .catch((readErr) => {
          logger.error(`Error reading SQL file ${filePath}:`, readErr.message)
          reject(readErr)
        })
    })
  }

  // 新增方法：检查并执行 SQL 文件（用于需要避免重复执行的场景，如插入初始数据）
  private async executeSQLFileIfNotDone(filePath: string, scriptName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // 首先检查是否已经执行过
      const checkSql = `SELECT 1 FROM schema_migrations WHERE script_name = ? LIMIT 1`
      this.database!.get(checkSql, [scriptName], (err, row) => {
        if (err) {
          logger.error('Error checking migration status:', err.message)
          reject(err)
          return
        }

        if (row) {
          logger.info(`SQL file ${scriptName} has already been executed.`)
          resolve()
          return
        }

        // 如果没有执行过，则读取并执行文件
        fs.readFile(filePath, 'utf8')
          .then((sqlContent) => {
            logger.info(`Executing SQL file from path: ${filePath}`)
            this.database!.exec(sqlContent, (execErr) => {
              if (execErr) {
                logger.error('Error executing SQL file:', execErr.message)
                reject(execErr)
              } else {
                logger.info(`Successfully executed SQL file: ${filePath}`)
                // 记录执行状态
                const insertSql = `INSERT INTO schema_migrations (script_name) VALUES (?)`
                this.database!.run(insertSql, [scriptName], (insertErr) => {
                  if (insertErr) {
                    logger.error('Error recording migration:', insertErr.message)
                    reject(insertErr)
                  } else {
                    logger.info(`Recorded execution of ${scriptName} in schema_migrations.`)
                    resolve()
                  }
                })
              }
            })
          })
          .catch((readErr) => {
            logger.error('Error reading SQL file:', readErr.message)
            reject(readErr)
          })
      })
    })
  }

  getDatabase(): sqlite3.Database {
    if (!this.database) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.database
  }

  isInitialized(): boolean {
    return this.database !== null
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.database) {
        logger.warn('Database not initialized, nothing to close')
        resolve()
        return
      }

      this.database.close((err) => {
        if (err) {
          logger.error('Error closing database:', err.message)
          reject(err)
        } else {
          logger.info('Database connection closed.')
          this.database = null
          resolve()
        }
      })
    })
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
