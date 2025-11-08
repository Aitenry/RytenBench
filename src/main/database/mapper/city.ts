import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'
import * as sqlite3 from 'sqlite3'

interface UrbanResourceRow {
  city_code: number | string
  city_name: string
  city_district: string
}

// --- 根据 city_id 查询 ---
async function getUrbanResourceByCityCode(cityId: number | string): Promise<UrbanResourceRow[]> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    // 使用参数化查询，? 是占位符
    const sql = 'SELECT * FROM urban_resource WHERE city_code = ?'

    return new Promise((resolve, reject) => {
      db!.all(sql, [cityId], (err, rows: UrbanResourceRow[]) => {
        if (err) {
          logger.error('Error executing query by city_id:', err.message)
          reject(err)
        } else {
          logger.info(`Query by city_id=${cityId} returned ${rows.length} rows.`)
          resolve(rows)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for city_id query:', error)
    throw error // 重新抛出错误，以便调用者处理
  }
}

// --- 根据 city_name 查询 ---
async function getUrbanResourceByCityName(cityName: string): Promise<UrbanResourceRow[]> {
  let db: sqlite3.Database | null = null
  try {
    db = (await getDatabaseInstance()).getDatabase()

    // 使用参数化查询，? 是占位符
    const sql = 'SELECT * FROM urban_resource WHERE city_name = ?'

    return new Promise((resolve, reject) => {
      db!.all(sql, [cityName], (err, rows: UrbanResourceRow[]) => {
        if (err) {
          logger.error('Error executing query by city_name:', err.message)
          reject(err)
        } else {
          logger.info(`Query by city_name="${cityName}" returned ${rows.length} rows.`)
          resolve(rows)
        }
      })
    })
  } catch (error) {
    logger.error('Failed to get database instance for city_name query:', error)
    throw error
  }
}

export { getUrbanResourceByCityCode, getUrbanResourceByCityName }
