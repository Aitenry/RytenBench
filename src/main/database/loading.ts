import * as path from 'path'
import { app } from 'electron'
import * as sqlite3 from 'sqlite3'
import logger from 'electron-log'

logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
logger.transports.file.fileName = 'database.log'

// 定义数据库文件路径
const dbPath = path.join(app.getPath('userData'), 'asetools.sqlite')

// 定义数据库类
export class Database {
  private readonly database: sqlite3.Database

  constructor() {
    // 打开数据库连接
    this.database = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('Could not connect to database:', err.message)
      } else {
        logger.info('Connected to SQLite database at:', dbPath)
        this.initializeTables()
      }
    })
  }

  private initializeTables(): void {
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

    // 逐个执行创建表的语句
    let executedCount = 0
    const total = createTableSQLs.length

    createTableSQLs.forEach((sql) => {
      this.database.run(sql, (err) => {
        if (err) {
          logger.error('Error creating table:', err.message)
        } else {
          executedCount++
          logger.info(
            `Table created successfully (or already exists). Executed ${executedCount}/${total}`
          )
          if (executedCount === total) {
            logger.info('All tables are ready.')
          }
        }
      })
    })
  }

  // 获取数据库实例
  getDatabase(): sqlite3.Database {
    return this.database
  }

  // 关闭数据库连接
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.database.close((err) => {
        if (err) {
          logger.error('Error closing database:', err.message)
          reject(err)
        } else {
          logger.info('Database connection closed.')
          resolve()
        }
      })
    })
  }
}

// 创建数据库实例
export const database = new Database()
