import { ipcMain } from 'electron'
import logger from 'electron-log'
import {
  getAllNodePositions,
  saveNodePosition,
  saveNodePositions,
  deleteNodePosition
} from '../database/mapper/node_position'

/** 图谱/看板节点位置 IPC */
export function registerNodePositionIpc(): void {
  ipcMain.handle('node-positions-get-all', async () => {
    try {
      return await getAllNodePositions()
    } catch (error) {
      logger.error('Error in node-positions-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('node-position-save', async (_event, nodeId: string, x: number, y: number) => {
    try {
      await saveNodePosition(nodeId, x, y)
    } catch (error) {
      logger.error('Error in node-position-save:', error)
      throw error
    }
  })

  ipcMain.handle(
    'node-positions-save-batch',
    async (_event, positions: { node_id: string; x: number; y: number }[]) => {
      try {
        await saveNodePositions(positions)
      } catch (error) {
        logger.error('Error in node-positions-save-batch:', error)
        throw error
      }
    }
  )

  ipcMain.handle('node-position-delete', async (_event, nodeId: string) => {
    try {
      return await deleteNodePosition(nodeId)
    } catch (error) {
      logger.error('Error in node-position-delete:', error)
      throw error
    }
  })
}
