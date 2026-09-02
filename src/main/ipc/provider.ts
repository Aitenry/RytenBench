import { BrowserWindow, ipcMain } from 'electron'
import * as fs from 'fs'
import { join } from 'path'
import logger from 'electron-log'
import { safeSend } from '../safe-send'
import { settingsStore } from '../context'
import { getProviderService } from '../provider/service'
import { type FetchedModelInfo, findModelProfile, geminiModelId } from '../provider/model-tags'
import { ChatSettings } from '../types/settings'
import {
  clearProviderCache,
  clearAgentCache,
  getCachedEnabledProviders,
  setCachedEnabledProviders,
  getCachedDefaultProvider,
  setCachedDefaultProvider
} from '../chat/preload-cache'
import {
  getAllProviderList,
  getProviderById,
  getDefaultProvider,
  getEnabledProviders,
  createProvider,
  createProviders,
  updateProvider,
  deleteProvider,
  deleteProviders,
  setDefaultProvider,
  LlmProviderConfig,
  LlmProviderInput
} from '../database/mapper/provider'
import {
  getAllAgents,
  getAgentsPaginated,
  getAgentById,
  createAgent,
  updateAgent,
  deleteAgent,
  AgentConfigInput
} from '../database/mapper/agent'

/** 通知所有窗口供应商列表已变更 */
function broadcastProvidersChanged(): void {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) safeSend(w.webContents, 'providers-changed')
  })
}

/**
 * 渲染进程展示用配置：剥离解密后的 api_key。
 * 密钥只在主进程运行时（ProviderService / 拉取调用）解密使用，绝不发送到渲染进程；
 * 前端需要修改密钥时由用户在编辑表单重新输入，空值表示保持原密钥。
 */
function stripApiKey(config: LlmProviderConfig | null): LlmProviderConfig | null {
  if (!config) return null
  return { ...config, api_key: null }
}

function stripApiKeys(list: LlmProviderConfig[]): LlmProviderConfig[] {
  return list.map((c) => ({ ...c, api_key: null }))
}

/** 模型供应商 + 智能体 + 主智能体配置 IPC */
export function registerProviderIpc(): void {
  ipcMain.handle('provider-get-all', async () => {
    try {
      // 列表视图：mapper 层已保证不解密 api_key
      return await getAllProviderList()
    } catch (error) {
      logger.error('Error in provider-get-all:', error)
      throw error
    }
  })

  ipcMain.handle('provider-get-by-id', async (_event, id: number) => {
    try {
      return stripApiKey(await getProviderById(id))
    } catch (error) {
      logger.error('Error in provider-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle('provider-get-default', async () => {
    try {
      if (getCachedDefaultProvider()) return stripApiKey(getCachedDefaultProvider())
      const provider = await getDefaultProvider()
      setCachedDefaultProvider(provider)
      return stripApiKey(provider)
    } catch (error) {
      logger.error('Error in provider-get-default:', error)
      throw error
    }
  })

  ipcMain.handle('provider-get-enabled', async () => {
    try {
      const cached = getCachedEnabledProviders()
      if (cached) return stripApiKeys(cached)
      const providers = await getEnabledProviders()
      setCachedEnabledProviders(providers)
      return stripApiKeys(providers)
    } catch (error) {
      logger.error('Error in provider-get-enabled:', error)
      throw error
    }
  })

  ipcMain.handle('provider-create', async (_event, input: LlmProviderInput) => {
    try {
      const id = await createProvider(input)
      clearProviderCache()
      getProviderService().clearCache()
      broadcastProvidersChanged()
      return id
    } catch (error) {
      logger.error('Error in provider-create:', error)
      throw error
    }
  })

  /**
   * 批量创建供应商（一键添加拉取到的多个模型）。
   * 单事务插入 + 只广播一次变更，避免 29 次逐个创建导致渲染进程反复全量刷新而卡死。
   */
  ipcMain.handle('provider-create-batch', async (_event, inputs: LlmProviderInput[]) => {
    try {
      const result = await createProviders(inputs)
      clearProviderCache()
      getProviderService().clearCache()
      broadcastProvidersChanged()
      return result
    } catch (error) {
      logger.error('Error in provider-create-batch:', error)
      throw error
    }
  })

  ipcMain.handle(
    'provider-update',
    async (_event, id: number, updates: Partial<LlmProviderInput>) => {
      try {
        const result = await updateProvider(id, updates)
        clearProviderCache()
        getProviderService().clearCache()
        broadcastProvidersChanged()
        return result
      } catch (error) {
        logger.error('Error in provider-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('provider-delete', async (_event, id: number) => {
    try {
      const result = await deleteProvider(id)
      clearProviderCache()
      getProviderService().clearCache()
      broadcastProvidersChanged()
      return result
    } catch (error) {
      logger.error('Error in provider-delete:', error)
      throw error
    }
  })

  /**
   * 批量删除供应商（勾选多个模型后删除）。
   * 单事务删除 + 只广播一次变更，与 provider-create-batch 同理避免刷新风暴。
   */
  ipcMain.handle('provider-delete-batch', async (_event, ids: number[]) => {
    try {
      const count = await deleteProviders(ids)
      clearProviderCache()
      getProviderService().clearCache()
      broadcastProvidersChanged()
      return count
    } catch (error) {
      logger.error('Error in provider-delete-batch:', error)
      throw error
    }
  })

  ipcMain.handle('provider-set-default', async (_event, id: number) => {
    try {
      const result = await setDefaultProvider(id)
      clearProviderCache()
      getProviderService().clearCache()
      broadcastProvidersChanged()
      return result
    } catch (error) {
      logger.error('Error in provider-set-default:', error)
      throw error
    }
  })

  // --- Agent (智能体) IPC handlers ---

  ipcMain.handle('agent-get-all', async (_event, workspaceId: number) => {
    try {
      return await getAllAgents(workspaceId)
    } catch (error) {
      logger.error('Error in agent-get-all:', error)
      throw error
    }
  })

  ipcMain.handle(
    'agent-get-paginated',
    async (_event, workspaceId: number, page: number, pageSize: number) => {
      try {
        return await getAgentsPaginated(workspaceId, page, pageSize)
      } catch (error) {
        logger.error('Error in agent-get-paginated:', error)
        throw error
      }
    }
  )

  ipcMain.handle('agent-get-by-id', async (_event, workspaceId: number, id: number) => {
    try {
      return await getAgentById(workspaceId, id)
    } catch (error) {
      logger.error('Error in agent-get-by-id:', error)
      throw error
    }
  })

  ipcMain.handle('agent-create', async (_event, input: AgentConfigInput) => {
    try {
      const id = await createAgent(input)
      clearAgentCache()
      return id
    } catch (error) {
      logger.error('Error in agent-create:', error)
      throw error
    }
  })

  ipcMain.handle(
    'agent-update',
    async (_event, workspaceId: number, id: number, updates: Partial<AgentConfigInput>) => {
      try {
        const result = await updateAgent(workspaceId, id, updates)
        clearAgentCache()
        return result
      } catch (error) {
        logger.error('Error in agent-update:', error)
        throw error
      }
    }
  )

  ipcMain.handle('agent-delete', async (_event, workspaceId: number, id: number) => {
    try {
      // 先获取 agent 信息（需要 name 来删除记忆目录）
      const agent = await getAgentById(workspaceId, id)
      await deleteAgent(workspaceId, id)
      clearAgentCache()
      // 自动删除子Agent记忆目录
      if (agent) {
        const settings = settingsStore.store
        const memoryPath = (settings.chat as ChatSettings)?.memoryPath
        if (memoryPath) {
          try {
            const agentDir = join(memoryPath, `workspace-${workspaceId}`, 'sub-agents', agent.name)
            if (fs.existsSync(agentDir)) {
              fs.rmSync(agentDir, { recursive: true, force: true })
              logger.info(`Auto-removed memory directories for sub-agent: ${agent.name}`)
            }
          } catch (memErr) {
            logger.warn('Failed to auto-remove sub-agent memory directories:', memErr)
          }
        }
      }
      return true
    } catch (error) {
      logger.error('Error in agent-delete:', error)
      throw error
    }
  })

  // 主智能体配置（electron-store）
  ipcMain.handle('main-agent-get', async () => {
    return (settingsStore.get('mainAgent') as Record<string, unknown>) ?? { tools: [], skills: [] }
  })

  ipcMain.handle('main-agent-update', async (_event, config: Record<string, unknown>) => {
    settingsStore.set('mainAgent', config)
    return true
  })

  // 拉取供应商的模型列表（元数据直接来自 models-profile.json 档案，不做名称/接口能力推导；
  // 档案中不存在的模型返回 metadata = null，由用户在设置界面自行填写）
  ipcMain.handle(
    'provider-fetch-models',
    async (_event, providerType: string, baseUrl?: string, apiKey?: string) => {
      try {
        const models: FetchedModelInfo[] = []

        if (providerType === 'ollama') {
          const url = (baseUrl || 'http://localhost:11434').replace(/\/+$/, '') + '/api/tags'
          logger.info(`[FetchModels] Ollama: ${url}`)
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)
          const res = await fetch(url, { signal: controller.signal })
          clearTimeout(timeout)
          if (!res.ok) {
            throw new Error(`Ollama 返回 HTTP ${res.status}`)
          }
          const data = (await res.json()) as { models?: Record<string, unknown>[] }
          for (const m of data.models || []) {
            const id = typeof m.name === 'string' ? m.name : ''
            if (!id) continue
            models.push({ id, metadata: findModelProfile(id) })
          }
        } else if (providerType === 'google-genai') {
          // Gemini 原生接口: GET /v1beta/models?key=...
          const base = (baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '')
          const url = `${base}/v1beta/models` + (apiKey ? `?key=${encodeURIComponent(apiKey)}` : '')
          // 脱敏（修复：此前把含 API key 的完整 URL 写进日志,密钥落盘）
          logger.info(`[FetchModels] Gemini: ${base}/v1beta/models${apiKey ? '?key=***' : ''}`)
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)
          const res = await fetch(url, { signal: controller.signal })
          clearTimeout(timeout)
          if (!res.ok) {
            throw new Error(`Gemini 返回 HTTP ${res.status}`)
          }
          const data = (await res.json()) as { models?: Record<string, unknown>[] }
          for (const m of data.models || []) {
            const id = geminiModelId(m)
            if (!id) continue
            models.push({ id, metadata: findModelProfile(id) })
          }
        } else {
          // OpenAI 兼容协议: GET /v1/models
          const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
          const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`
          logger.info(`[FetchModels] OpenAI-compatible: ${url}`)
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)
          const res = await fetch(url, { headers, signal: controller.signal })
          clearTimeout(timeout)
          if (!res.ok) {
            throw new Error(`API 返回 HTTP ${res.status}`)
          }
          const data = (await res.json()) as { data?: Record<string, unknown>[] }
          for (const m of data.data || []) {
            const id = typeof m.id === 'string' ? m.id : ''
            if (!id) continue
            models.push({ id, metadata: findModelProfile(id) })
          }
        }

        logger.info(`[FetchModels] Got ${models.length} models for ${providerType}`)
        return models
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        logger.error(`[FetchModels] Failed for ${providerType}:`, errMsg)
        throw new Error(`拉取模型列表失败：${errMsg}`)
      }
    }
  )
}
