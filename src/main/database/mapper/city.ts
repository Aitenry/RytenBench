import { getDatabaseInstance } from '../../index'
import logger from 'electron-log'

interface UrbanResourceRow {
  city_code: number | string
  city_name: string
  city_district: string
}

// --- 根据 city_code 查询 ---
async function getUrbanResourceByCityCode(cityCode: number | string): Promise<UrbanResourceRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM urban_resource WHERE city_code = $1'
    const result = await db.query<UrbanResourceRow>(sql, [cityCode])
    logger.info(`Query by city_code=${cityCode} returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get urban resource by city code:', error)
    throw error
  }
}

// --- 根据 city_name 查询 ---
async function getUrbanResourceByCityName(cityName: string): Promise<UrbanResourceRow[]> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const sql = 'SELECT * FROM urban_resource WHERE city_name = $1'
    const result = await db.query<UrbanResourceRow>(sql, [cityName])
    logger.info(`Query by city_name="${cityName}" returned ${result.rows.length} rows.`)
    return result.rows
  } catch (error) {
    logger.error('Failed to get urban resource by city name:', error)
    throw error
  }
}

export { getUrbanResourceByCityCode, getUrbanResourceByCityName }
