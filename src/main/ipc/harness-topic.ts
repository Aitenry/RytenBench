import { ipcMain } from 'electron'
import logger from 'electron-log'
import { todoStore } from '../harness/runtime/todo'
import { goalStore } from '../harness/runtime/goal'
import { jobsRegistry } from '../harness/runtime/jobs'
import { subagentSessions } from '../harness/runtime/subagent-sessions'
import { SpillStore } from '../harness/runtime/spill'
import { deleteCompactionByTopic } from '../database/mapper/compaction'
import { settingsStore } from '../context'
import { clearTopicCache } from '../harness/preload-cache'
import type { HarnessSettings } from '../types/settings'
import {
  getAllWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getAllTopics,
  getAllTopicsPaginated,
  getTopicById,
  createTopic,
  updateTopic,
  deleteTopic,
  getDialoguesByTopicId,
  getDialoguesByTopicIdPaginated,
  addDialogue,
  deleteDialoguesByTopicId,
  deleteDialogueById,
  getUsageByTopic
} from '../database/mapper/harness'
import type { HarnessTopicRow, HarnessDialogueRow } from '../database/mapper/harness'

/** Harness 工作区 / 话题 / 对话记录 CRUD IPC */
export function registerHarnessTopicIpc(): void {
  // --- Harness Workspace IPC handlers ---

  ipcMain.handle('workspace-get-all', async () => {
    try {
      return await getAllWorkspaces()
    } catch (error) {
      logger.error('Error in workspace-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('workspace-create', async (_event, name: string, path: string) => {
    try {
      return await createWorkspace(name, path)
    } catch (error) {
      logger.error('Error in workspace-create:', error)
      throw error
    }
  })

  ipcMain.handle('workspace-update', async (_event, id: number, updates: { name: string }) => {
    try {
      return await updateWorkspace(id, updates)
    } catch (error) {
      logger.error('Error in workspace-update:', error)
      throw error
    }
  })

  ipcMain.handle('workspace-delete', async (_event, id: number) => {
    try {
      clearTopicCache()
      return await deleteWorkspace(id)
    } catch (error) {
      logger.error('Error in workspace-delete:', error)
      throw error
    }
  })

  // --- Harness Topic IPC handlers ---

  ipcMain.handle('harness-topic-get-all', async (_event, workspaceId: number) => {
    try {
      return await getAllTopics(workspaceId)
    } catch (error) {
      logger.error('Error in harness-topic-get-all:', error)
      throw error
    }
  })

  ipcMain.handle(
    'harness-topic-get-paginated',
    async (_event, workspaceId: number, page: number, pageSize: number) => {
      try {
        return await getAllTopicsPaginated(workspaceId, page, pageSize)
      } catch (error) {
        logger.error('Error in harness-topic-get-paginated:', error)
        throw error
      }
    }
  )

  ipcMain.handle('harness-topic-get-by-id', async (_event, id: number) => {
    try {
      return await getTopicById(id)
    } catch (error) {
      logger.error('Error in harness-topic-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle(
    'harness-topic-create',
    async (_event, workspaceId: number, title: string, model?: string, selectedTools?: string) => {
      try {
        clearTopicCache()
        return await createTopic(workspaceId, title, model, selectedTools)
      } catch (error) {
        logger.error('Error in harness-topic-create:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'harness-topic-update',
    async (
      _event,
      id: number,
      updates: Partial<Pick<HarnessTopicRow, 'title' | 'model' | 'selected_tools'>>
    ) => {
      try {
        clearTopicCache()
        return await updateTopic(id, updates)
      } catch (error) {
        logger.error('Error in harness-topic-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('harness-topic-delete', async (_event, id: number) => {
    try {
      clearTopicCache()
      // 清理该话题的对话计划清单（进程级 todoStore）
      todoStore.clear(id)
      // 清理该话题的对话目标（goalStore：缓存 + 数据库行）
      await goalStore.delete(id)
      // 清理该话题的后台任务（全部 kill）
      jobsRegistry.clearTopic(id)
      // 清理该话题的子代理续接会话（全部中断）
      subagentSessions.clearTopic(id)
      // 清理该话题的摘要压缩 checkpoint（topic_compactions 表）
      await deleteCompactionByTopic(id)
      // 清理该话题的工具结果溢出文件（spill 目录）
      const harnessSettings = settingsStore.get('harness') as HarnessSettings | undefined
      SpillStore.pruneTopic(
        harnessSettings?.workspacePath || undefined,
        harnessSettings?.memoryPath || undefined,
        id
      )
      return await deleteTopic(id)
    } catch (error) {
      logger.error('Error in harness-topic-delete:', error)
      throw error
    }
  })

  // --- Harness Dialogue IPC handlers ---

  ipcMain.handle('harness-dialogue-get-by-topic', async (_event, topicId: number) => {
    try {
      return await getDialoguesByTopicId(topicId)
    } catch (error) {
      logger.error('Error in harness-dialogue-get-by-topic:', error)
      throw error
    }
  })

  ipcMain.handle(
    'harness-dialogue-get-by-topic-paginated',
    async (_event, topicId: number, page: number, pageSize: number) => {
      try {
        return await getDialoguesByTopicIdPaginated(topicId, page, pageSize)
      } catch (error) {
        logger.error('Error in harness-dialogue-get-by-topic-paginated:', error)
        throw error
      }
    }
  )

  // 对话真实用量（harness_dialogue_usage）：渲染层按 dialogue_id 回填到各条助手消息
  ipcMain.handle('harness-usage-get-by-topic', async (_event, topicId: number) => {
    try {
      return await getUsageByTopic(topicId)
    } catch (error) {
      logger.error('Error in harness-usage-get-by-topic:', error)
      throw error
    }
  })

  ipcMain.handle(
    'harness-dialogue-add',
    async (_event, dialogue: Omit<HarnessDialogueRow, 'id' | 'created_at'>) => {
      try {
        return await addDialogue(dialogue)
      } catch (error) {
        logger.error('Error in harness-dialogue-add:', error)
        throw error
      }
    }
  )

  ipcMain.handle('harness-dialogue-delete-by-topic', async (_event, topicId: number) => {
    try {
      return await deleteDialoguesByTopicId(topicId)
    } catch (error) {
      logger.error('Error in harness-dialogue-delete-by-topic:', error)
      throw error
    }
  })

  ipcMain.handle('harness-dialogue-delete', async (_event, id: number) => {
    try {
      return await deleteDialogueById(id)
    } catch (error) {
      logger.error('Error in harness-dialogue-delete:', error)
      throw error
    }
  })
}
