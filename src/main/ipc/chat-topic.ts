import { ipcMain } from 'electron'
import logger from 'electron-log'
import { todoStore } from '../chat/runtime/todo'
import { clearTopicCache } from '../chat/preload-cache'
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
  deleteDialogueById
} from '../database/mapper/chat'
import type { ChatTopicRow, ChatDialogueRow } from '../database/mapper/chat'

/** Chat 工作区 / 话题 / 对话记录 CRUD IPC */
export function registerChatTopicIpc(): void {
  // --- Chat Workspace IPC handlers ---

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

  // --- Chat Topic IPC handlers ---

  ipcMain.handle('chat-topic-get-all', async (_event, workspaceId: number) => {
    try {
      return await getAllTopics(workspaceId)
    } catch (error) {
      logger.error('Error in chat-topic-get-all:', error)
      throw error
    }
  })

  ipcMain.handle(
    'chat-topic-get-paginated',
    async (_event, workspaceId: number, page: number, pageSize: number) => {
      try {
        return await getAllTopicsPaginated(workspaceId, page, pageSize)
      } catch (error) {
        logger.error('Error in chat-topic-get-paginated:', error)
        throw error
      }
    }
  )

  ipcMain.handle('chat-topic-get-by-id', async (_event, id: number) => {
    try {
      return await getTopicById(id)
    } catch (error) {
      logger.error('Error in chat-topic-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle(
    'chat-topic-create',
    async (_event, workspaceId: number, title: string, model?: string, selectedTools?: string) => {
      try {
        clearTopicCache()
        return await createTopic(workspaceId, title, model, selectedTools)
      } catch (error) {
        logger.error('Error in chat-topic-create:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'chat-topic-update',
    async (
      _event,
      id: number,
      updates: Partial<Pick<ChatTopicRow, 'title' | 'model' | 'selected_tools'>>
    ) => {
      try {
        clearTopicCache()
        return await updateTopic(id, updates)
      } catch (error) {
        logger.error('Error in chat-topic-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('chat-topic-delete', async (_event, id: number) => {
    try {
      clearTopicCache()
      // 清理该话题的对话计划清单（进程级 todoStore）
      todoStore.clear(id)
      return await deleteTopic(id)
    } catch (error) {
      logger.error('Error in chat-topic-delete:', error)
      throw error
    }
  })

  // --- Chat Dialogue IPC handlers ---

  ipcMain.handle('chat-dialogue-get-by-topic', async (_event, topicId: number) => {
    try {
      return await getDialoguesByTopicId(topicId)
    } catch (error) {
      logger.error('Error in chat-dialogue-get-by-topic:', error)
      throw error
    }
  })

  ipcMain.handle(
    'chat-dialogue-get-by-topic-paginated',
    async (_event, topicId: number, page: number, pageSize: number) => {
      try {
        return await getDialoguesByTopicIdPaginated(topicId, page, pageSize)
      } catch (error) {
        logger.error('Error in chat-dialogue-get-by-topic-paginated:', error)
        throw error
      }
    }
  )

  ipcMain.handle(
    'chat-dialogue-add',
    async (_event, dialogue: Omit<ChatDialogueRow, 'id' | 'created_at'>) => {
      try {
        return await addDialogue(dialogue)
      } catch (error) {
        logger.error('Error in chat-dialogue-add:', error)
        throw error
      }
    }
  )

  ipcMain.handle('chat-dialogue-delete-by-topic', async (_event, topicId: number) => {
    try {
      return await deleteDialoguesByTopicId(topicId)
    } catch (error) {
      logger.error('Error in chat-dialogue-delete-by-topic:', error)
      throw error
    }
  })

  ipcMain.handle('chat-dialogue-delete', async (_event, id: number) => {
    try {
      return await deleteDialogueById(id)
    } catch (error) {
      logger.error('Error in chat-dialogue-delete:', error)
      throw error
    }
  })
}
