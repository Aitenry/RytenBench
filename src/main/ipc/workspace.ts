import { ipcMain } from 'electron'
import { join, resolve, isAbsolute, sep } from 'path'
import * as fs from 'fs'
import logger from 'electron-log'
import { settingsStore } from '../context'

/**
 * 校验渲染端传入的路径必须位于 AI 工作区目录内（防任意路径读写）。
 * 渲染进程存在被注入/被导航到远程页面的风险（preload 暴露了完整 API），
 * 文件类 IPC 入口必须自守边界：非绝对路径、越界路径一律拒绝。
 * 返回规范化后的绝对路径。
 */
function assertInsideWorkspace(inputPath: string): string {
  if (typeof inputPath !== 'string' || !isAbsolute(inputPath)) {
    throw new Error('路径无效：必须传入 AI 工作区内的绝对路径')
  }
  const chatSettings = settingsStore.get('chat') as { workspacePath?: string } | undefined
  const root = chatSettings?.workspacePath
  if (!root) {
    throw new Error('未配置 AI 工作区目录，拒绝文件访问')
  }
  const normalizedRoot = resolve(root)
  const target = resolve(inputPath)
  if (target !== normalizedRoot && !target.startsWith(normalizedRoot + sep)) {
    throw new Error('路径不在 AI 工作区内，已拒绝访问')
  }
  return target
}

/** 工作区文件浏览 IPC（AI 工作区目录的文件操作） */
export function registerWorkspaceIpc(): void {
  ipcMain.handle('workspace-list-dir', async (_event, dirPath: string) => {
    try {
      const safePath = assertInsideWorkspace(dirPath)
      const entries = await fs.promises.readdir(safePath, { withFileTypes: true })
      return entries
        .filter((d) => !d.name.startsWith('.') || d.name === '.gitignore')
        .map((d) => ({
          name: d.name,
          isDirectory: d.isDirectory(),
          path: join(safePath, d.name)
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
      const safePath = assertInsideWorkspace(filePath)
      return await fs.promises.readFile(safePath, 'utf-8')
    } catch (error) {
      logger.error('Error in workspace-read-file:', error)
      throw error
    }
  })

  ipcMain.handle('workspace-save-file', async (_event, filePath: string, content: string) => {
    try {
      const safePath = assertInsideWorkspace(filePath)
      await fs.promises.writeFile(safePath, content, 'utf-8')
      return true
    } catch (error) {
      logger.error('Error in workspace-save-file:', error)
      throw error
    }
  })
}
