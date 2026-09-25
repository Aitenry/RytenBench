import { settingsStore } from '../../../../main/context'
import type { MainIpcHandlers } from '../../../../main/plugins/context'
import { mainMessages } from '../../../../main/i18n'
import { getActiveWorkspaceId } from '../../../../main/database/workspace-context'
import { HarnessSettings } from '../../../../main/types/settings'
import type { MnemonComponent } from '../runtime/mnemon/index'

// 当前记忆目录（从设置读取）
function currentMemoryPath(): string | undefined {
  const harnessSettings = settingsStore.get('harness') as HarnessSettings | undefined
  return harnessSettings?.memoryPath || undefined
}

// 当前工作区 Mnemon 组件（记忆按工作区目录隔离：<memoryPath>/workspace-<id>/mnemon）
async function currentMnemonComponent(): Promise<MnemonComponent | undefined> {
  const { getMnemonComponent } = await import('../mnemon-singleton')
  return getMnemonComponent(currentMemoryPath(), getActiveWorkspaceId())
}

/**
 * Mnemon 记忆管理 IPC（三层记忆：热记忆 / 长期空间 / 档案）。
 *
 * 通道名一律 `plugin:harness:<原扁平名>`；记忆组件按「记忆目录 + 当前工作区」隔离，
 * 未配置记忆目录时各通道返回 configured:false / 空结果，不抛错。
 */
export function mnemonIpcHandlers(): MainIpcHandlers {
  const handlers: MainIpcHandlers = {}
  /** 收通道：本插件的命名空间前缀只在这里出现 */
  const handle = (channel: string, handler: (...args: never[]) => unknown): void => {
    handlers[`plugin:harness:${channel}`] = handler
  }

  // 记忆系统总览快照
  handle('mnemon-snapshot', async () => {
    const component = await currentMnemonComponent()
    if (!component) {
      return { configured: false, error: mainMessages().error.memoryDirNotConfigured }
    }
    const [runtime, bodies, documents] = await Promise.all([
      Promise.resolve(component.runtimeMemory.snapshot()),
      component.service.bodies(),
      Promise.resolve(component.documents.snapshot())
    ])
    return { configured: true, runtime, bodies, documents }
  })

  // 热记忆增删改（add / replace / remove）
  handle(
    'mnemon-runtime-mutate',
    async (request: {
      action: string
      target: string
      content?: string
      old_text?: string
      importance?: string
    }) => {
      const component = await currentMnemonComponent()
      if (!component)
        return { success: false, message: mainMessages().error.memoryDirNotConfigured }
      // 参数守卫（修复：request 为 undefined 时 `request.action` 直接 TypeError，
      // 且该 handler 无 try/catch，异常会挂起调用方）
      if (
        !request ||
        typeof request !== 'object' ||
        typeof request.action !== 'string' ||
        typeof request.target !== 'string'
      ) {
        return { success: false, message: mainMessages().error.invalidRequest }
      }
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
  handle('mnemon-bodies', async () => {
    const component = await currentMnemonComponent()
    if (!component) return { items: [], total: 0, activeCount: 0, directory: '', generatedAt: '' }
    return await component.service.bodies()
  })

  // 创建记忆空间
  handle('mnemon-body-create', async (request: { name: string; description: string }) => {
    const component = await currentMnemonComponent()
    if (!component) return { success: false, message: mainMessages().error.memoryDirNotConfigured }
    try {
      const body = await component.service.createBody(request)
      return { success: true, body }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // 更新记忆空间（名称/描述/激活）
  handle(
    'mnemon-body-update',
    async (id: string, request: { name?: string; description?: string; active?: boolean }) => {
      const component = await currentMnemonComponent()
      if (!component)
        return { success: false, message: mainMessages().error.memoryDirNotConfigured }
      try {
        const body = component.service.updateBody(id, request)
        return { success: true, body }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // 记忆空间内容浏览
  handle('mnemon-body-list', async (memoryBodyIds?: string[]) => {
    const component = await currentMnemonComponent()
    if (!component) return []
    try {
      return await component.service.list(memoryBodyIds, 200)
    } catch {
      return []
    }
  })

  // 档案快照
  handle('mnemon-document-snapshot', async () => {
    const component = await currentMnemonComponent()
    if (!component) return null
    return component.documents.snapshot()
  })

  return handlers
}
