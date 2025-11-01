import * as path from 'path'
import { app } from 'electron'
import * as sqlite3 from 'sqlite3'
import logger from 'electron-log'

logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
logger.transports.file.fileName = 'database.log'

// 定义数据库文件路径
const dbPath = path.join(app.getPath('userData'), 'asetools.sqlite')

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
    return new Promise((resolve, reject) => {
      // 定义创建表的 SQL 语句数组
      const createTableSQLs = [
        `CREATE TABLE IF NOT EXISTS city_code (
            city_id   VARCHAR(45) NOT NULL PRIMARY KEY,
            city_name VARCHAR(45) NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS daily_weather (
            id                 VARCHAR(45) NOT NULL PRIMARY KEY,
            date               VARCHAR(45) NOT NULL,
            morning            VARCHAR(45) NOT NULL,
            evening            VARCHAR(45) NOT NULL,
            temperature        VARCHAR(45) NOT NULL,
            morning_wind_direction   VARCHAR(45) NOT NULL,
            evening_wind_direction   VARCHAR(45) NOT NULL,
            wind_power         VARCHAR(45) NOT NULL
        );`,
        `CREATE TABLE IF NOT EXISTS hourly_weather (
            id                    VARCHAR(45) NOT NULL PRIMARY KEY,
            hour_time             VARCHAR(45) NOT NULL,
            temperature           VARCHAR(45) NOT NULL,
            real_feel             VARCHAR(45) NOT NULL,
            probability_of_rain   VARCHAR(45) NOT NULL,
            wind_power            VARCHAR(45) NOT NULL,
            humidity              VARCHAR(45) NOT NULL,
            gust                  VARCHAR(45) NOT NULL,
            dew_point             VARCHAR(45) NOT NULL,
            visibility            VARCHAR(45) NOT NULL,
            cloudiness            VARCHAR(45) NOT NULL,
            weather               VARCHAR(45) NOT NULL,
            weather_image         VARCHAR(45)
        )`
      ]

      let executedCount = 0
      const total = createTableSQLs.length

      createTableSQLs.forEach((sql) => {
        this.database!.run(sql, (err) => {
          if (err) {
            logger.error('Error creating table:', err.message)
            reject(err)
          } else {
            executedCount++
            logger.info(
              `Table created successfully (or already exists). Executed ${executedCount}/${total}`
            )
            if (executedCount === total) {
              logger.info('All tables are ready.')
              resolve()
            }
          }
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
