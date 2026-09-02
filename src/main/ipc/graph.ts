import { ipcMain } from 'electron'
import logger from 'electron-log'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { safeSend } from '../safe-send'
import { settingsStore } from '../context'
import { getProviderService } from '../provider/service'
import { KnowledgeGraphService, BuildConfig } from '../graph'
import { GraphSettings } from '../types/settings'
import {
  getEntityById,
  searchEntities,
  updateEntity,
  deleteEntity,
  deleteRelation,
  getFullGraphData,
  getBuildJobByWikiId,
  getLatestBuildJob
} from '../database/mapper/graph'

/** 知识图谱 IPC（数据查询/构建/追加） */
export function registerGraphIpc(): void {
  ipcMain.handle(
    'graph-data-get',
    async (_event, wikiId: number, typeFilter?: string, docIds?: number[]) => {
      try {
        return await getFullGraphData(wikiId, typeFilter, docIds)
      } catch (error) {
        logger.error('Error in graph-data-get:', error)
        throw error
      }
    }
  )

  ipcMain.handle('graph-entity-get', async (_event, entityId: number) => {
    try {
      return await getEntityById(entityId)
    } catch (error) {
      logger.error('Error in graph-entity-get:', error)
      throw error
    }
  })

  ipcMain.handle('graph-entity-search', async (_event, wikiId: number, query: string) => {
    try {
      return await searchEntities(wikiId, query)
    } catch (error) {
      logger.error('Error in graph-entity-search:', error)
      throw error
    }
  })

  ipcMain.handle(
    'graph-entity-update',
    async (_event, id: number, updates: Record<string, unknown>) => {
      try {
        return await updateEntity(id, updates as Record<string, unknown>)
      } catch (error) {
        logger.error('Error in graph-entity-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('graph-entity-delete', async (_event, id: number) => {
    try {
      return await deleteEntity(id)
    } catch (error) {
      logger.error('Error in graph-entity-delete:', error)
      throw error
    }
  })

  ipcMain.handle('graph-relation-delete', async (_event, id: number) => {
    try {
      return await deleteRelation(id)
    } catch (error) {
      logger.error('Error in graph-relation-delete:', error)
      throw error
    }
  })

  ipcMain.handle('graph-build-status', async (_event, wikiId: number) => {
    try {
      return await getLatestBuildJob(wikiId)
    } catch (error) {
      logger.error('Error in graph-build-status:', error)
      throw error
    }
  })

  ipcMain.on(
    'graph-build-start',
    async (event, wikiId: number, config?: Record<string, unknown>) => {
      // 整段包 try（修复：ipcMain.on 的 async 回调返回的 promise 无人观察，
      // 构造/合并配置段抛错会成 unhandled rejection，渲染端收不到任何错误事件）
      try {
        // 未配置图谱构建模型时，不进入构建流程——通过错误事件通知渲染层弹出友好提醒
        let model: BaseChatModel
        try {
          const defaultModelId = settingsStore.get('defaultModelId') as number | undefined
          model = await getProviderService().createModel(defaultModelId)
        } catch (error) {
          logger.error('Error in graph-build-start (model):', error)
          safeSend(event.sender, 'graph-build-error', {
            wikiId,
            error: '未配置图谱构建模型：请先到「系统设置 → 图谱」中选择用于构建知识图谱的大模型。'
          })
          return
        }
        const graphService = new KnowledgeGraphService(model)
        // 从系统设置读取图谱构建默认值，用户传入的config可覆盖
        const graphSettings = settingsStore.get('graph') as GraphSettings | undefined
        const mergedConfig: BuildConfig = {
          maxConcurrency: (config?.maxConcurrency as number) ?? graphSettings?.maxConcurrency ?? 8,
          enableGleaning:
            (config?.enableGleaning as boolean) ?? graphSettings?.enableGleaning ?? true,
          gleaningThreshold:
            (config?.gleaningThreshold as number) ?? graphSettings?.gleaningThreshold ?? 50,
          maxChunkSize: (config?.maxChunkSize as number) ?? graphSettings?.maxChunkSize ?? 2000,
          force: config?.force as boolean | undefined
        }
        try {
          const result = await graphService.buildGraph(
            wikiId,
            (progress) => {
              safeSend(event.sender, 'graph-build-progress', progress)
            },
            mergedConfig
          )
          safeSend(event.sender, 'graph-build-complete', {
            wikiId,
            entityCount: result.entities.length,
            relationCount: result.relations.length
          })
        } catch (error) {
          logger.error('Error in graph-build-start:', error)
          safeSend(event.sender, 'graph-build-error', {
            wikiId,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      } catch (error) {
        logger.error('Error in graph-build-start (unexpected):', error)
        safeSend(event.sender, 'graph-build-error', {
          wikiId,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  )

  ipcMain.handle('graph-processed-docs-get', async (_event, wikiId: number) => {
    try {
      const job = await getBuildJobByWikiId(wikiId)
      if (job?.processed_note_ids) {
        return JSON.parse(job.processed_note_ids) as number[]
      }
      return []
    } catch (error) {
      logger.error('Error in graph-processed-docs-get:', error)
      throw error
    }
  })

  ipcMain.handle('graph-docs-append', async (event, wikiId: number, docIds: number[]) => {
    // 未配置图谱构建模型时，不进入追加流程——通过错误事件通知渲染层弹出友好提醒
    let model: BaseChatModel
    try {
      const defaultModelId = settingsStore.get('defaultModelId') as number | undefined
      model = await getProviderService().createModel(defaultModelId)
    } catch (error) {
      logger.error('Error in graph-docs-append (model):', error)
      safeSend(event.sender, 'graph-build-error', {
        wikiId,
        error: '未配置图谱构建模型：请先到「系统设置 → 图谱」中选择用于构建知识图谱的大模型。'
      })
      return { entitiesAdded: 0, relationsAdded: 0 }
    }
    const graphService = new KnowledgeGraphService(model)
    try {
      const result = await graphService.appendDocs(wikiId, docIds, (progress) => {
        safeSend(event.sender, 'graph-build-progress', progress)
      })
      safeSend(event.sender, 'graph-build-complete', {
        wikiId,
        entityCount: result.entitiesAdded,
        relationCount: result.relationsAdded
      })
      return result
    } catch (error) {
      logger.error('Error in graph-docs-append:', error)
      safeSend(event.sender, 'graph-build-error', {
        wikiId,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  })
}
