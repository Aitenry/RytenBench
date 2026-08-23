import { getDatabaseInstance } from '../instance'
import logger from 'electron-log'
import * as crypto from 'crypto'

async function saveImage(dataUrl: string | null): Promise<string | null> {
  if (!dataUrl) return null

  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const id = crypto.createHash('md5').update(dataUrl).digest('hex')

    await db.query('INSERT INTO images (id, data) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      id,
      dataUrl
    ])

    return id
  } catch (error) {
    logger.error('Failed to save image:', error)
    throw error
  }
}

async function getImageData(id: string): Promise<string | null> {
  try {
    const db = (await getDatabaseInstance()).getDatabase()
    const result = await db.query<{ data: string }>('SELECT data FROM images WHERE id = $1', [id])
    return result.rows[0]?.data ?? null
  } catch (error) {
    logger.error('Failed to get image data:', error)
    throw error
  }
}

export { saveImage, getImageData }
