import { ipcMain } from 'electron'
import { settingsStore } from '../context'
import { getActiveWorkspaceId } from '../database/workspace-context'
import { ChatSettings } from '../types/settings'
import type { MnemonComponent } from '../chat/runtime/mnemon'

// 当前记忆目录（从设置读取）
function currentMemoryPath(): string | undefined {
  const chatSettings = settingsStore.get('chat') as ChatSettings | undefined
  return chatSettings?.memoryPath || undefined
}

// 当前工作区 Mnemon 组件（记忆按工作区目录隔离：<memoryPath>/workspace-<id>/mnemon）
async function currentMnemonComponent(): Promise<MnemonComponent | undefined> {
  const { getMnemonComponent } = await import('../chat/mnemon-singleton')
  return getMnemonComponent(currentMemoryPath(), getActiveWorkspaceId())
}

/** Mnemon 记忆管理 IPC（三层记忆：热记忆 / 长期空间 / 档案） */
export function registerMnemonIpc(): void {
  // 记忆系统总览快照
  ipcMain.handle('mnemon-snapshot', async () => {
    const component = await currentMnemonComponent()
    if (!component) {
      return { configured: false, error: '未配置记忆存储目录' }
    }
    const [runtime, bodies, documents] = await Promise.all([
      Promise.resolve(component.runtimeMemory.snapshot()),
      component.service.bodies(),
      Promise.resolve(component.documents.snapshot())
    ])
    return { configured: true, runtime, bodies, documents }
  })

  // 热记忆增删改（add / replace / remove）
  ipcMain.handle(
    'mnemon-runtime-mutate',
    async (
      _event,
      request: {
        action: string
        target: string
        content?: string
        old_text?: string
        importance?: string
      }
    ) => {
      const component = await currentMnemonComponent()
      if (!component) return { success: false, message: '未配置记忆存储目录' }
      return await component.runtimeMemory.mutate({
        action: request.action as 'add' | 'replace' | 'remove',
        target: request.target as 'user' | 'memory',
        content: request.content,
        oldText: request.old_text,
        importance: request.importance as 'critical' | 'normal' | 'low' | undefined
      })
    }
  )

  // 长期记忆空间目录
  ipcMain.handle('mnemon-bodies', async () => {
    const component = await currentMnemonComponent()
    if (!component) return { items: [], total: 0, activeCount: 0, directory: '', generatedAt: '' }
    return await component.service.bodies()
  })

  // 创建记忆空间
  ipcMain.handle(
    'mnemon-body-create',
    async (_event, request: { name: string; description: string }) => {
      const component = await currentMnemonComponent()
      if (!component) return { success: false, message: '未配置记忆存储目录' }
      try {
        const body = await component.service.createBody(request)
        return { success: true, body }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // 更新记忆空间（名称/描述/激活）
  ipcMain.handle(
    'mnemon-body-update',
    async (
      _event,
      id: string,
      request: { name?: string; description?: string; active?: boolean }
    ) => {
      const component = await currentMnemonComponent()
      if (!component) return { success: false, message: '未配置记忆存储目录' }
      try {
        const body = component.service.updateBody(id, request)
        return { success: true, body }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // 记忆空间内容浏览
  ipcMain.handle('mnemon-body-list', async (_event, memoryBodyIds?: string[]) => {
    const component = await currentMnemonComponent()
    if (!component) return []
    try {
      return await component.service.list(memoryBodyIds, 200)
    } catch {
      return []
    }
  })

  // 档案快照
  ipcMain.handle('mnemon-document-snapshot', async () => {
    const component = await currentMnemonComponent()
    if (!component) return null
    return component.documents.snapshot()
  })
}
