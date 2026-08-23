import { ipcMain } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import logger from 'electron-log'

/** 工作区文件浏览 IPC（AI 工作区目录的文件操作） */
export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace-list-dir', async (_event, dirPath: string) => {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      return entries
        .filter((d) => !d.name.startsWith('.') || d.name === '.gitignore')
        .map((d) => ({
          name: d.name,
          isDirectory: d.isDirectory(),
          path: join(dirPath, d.name)
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
    } catch (error) {
      logger.error('Error in workspace-list-dir:', error)
      throw error
    }
  })

  ipcMain.handle('workspace-read-file', async (_event, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return content
    } catch (error) {
      logger.error('Error in workspace-read-file:', error)
      throw error
    }
  })

  ipcMain.handle('workspace-save-file', async (_event, filePath: string, content: string) => {
    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return true
    } catch (error) {
      logger.error('Error in workspace-save-file:', error)
      throw error
    }
  })
}
