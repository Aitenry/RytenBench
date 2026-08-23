import { dialog, ipcMain } from 'electron'
import * as fs from 'fs'

/** 通用文件选择 IPC（聊天附件：图片/文档、文本文件） */
export function registerDialogIpc(): void {
  ipcMain.handle('select-image-file', async (_event, allowImages?: boolean) => {
    try {
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']
      const docExts = ['pdf', 'txt', 'md', 'csv', 'json', 'xml', 'doc', 'docx', 'xls', 'xlsx']

      const extensions = allowImages !== false ? [...imageExts, ...docExts] : docExts

      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Supported Files', extensions },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      const fileName = filePath.split(/[\\/]/).pop() || 'file'
      const ext = filePath.split('.').pop()?.toLowerCase() || 'bin'
      const isImage = imageExts.includes(ext)

      // 非视觉模型时禁止选择图片
      if (allowImages === false && isImage) {
        await dialog.showErrorBox(
          '不支持的文件类型',
          '当前模型不支持视觉识别，请选择文档类附件（pdf、txt、md 等）'
        )
        return null
      }

      if (isImage) {
        const fileBuffer = fs.readFileSync(filePath)
        const base64 = fileBuffer.toString('base64')
        const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`
        return { dataUrl: `data:${mimeType};base64,${base64}`, fileName, isImage: true }
      }

      return { dataUrl: filePath, fileName, isImage: false }
    } catch (error) {
      console.error('Error selecting file:', error)
      throw error
    }
  })

  ipcMain.handle('select-text-file', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })

      if (result.canceled || result.filePaths.length === 0) {
        return null
      }

      const filePath = result.filePaths[0]
      const fileName = filePath.split(/[\\/]/).pop() || 'file'
      return { fileName, filePath }
    } catch (error) {
      console.error('Error selecting text file:', error)
      throw error
    }
  })
}
