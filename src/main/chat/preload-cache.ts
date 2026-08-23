import logger from 'electron-log'
import { settingsStore } from '../context'
import { ChatSettings } from '../types/settings'
import { LlmProviderConfig } from '../database/mapper/provider'
import { getAllTopicsPaginated } from '../database/mapper/chat'
import { getEnabledProviders, getDefaultProvider } from '../database/mapper/provider'
import { loadSubAgentDefinitions } from './tools/builders'
import { SubAgentConfig } from './types'

// ── 预加载缓存：loading 阶段预取 ChatProvider 所需数据 ──
let cachedEnabledProviders: LlmProviderConfig[] | null = null
let cachedDefaultProvider: LlmProviderConfig | null = null
let cachedSubAgentDefs: Map<number, SubAgentConfig[]> | null = null

export function clearProviderCache(): void {
  cachedEnabledProviders = null
  cachedDefaultProvider = null
}

export function clearAgentCache(): void {
  cachedSubAgentDefs = null
}

export function getCachedEnabledProviders(): LlmProviderConfig[] | null {
  return cachedEnabledProviders
}

export function setCachedEnabledProviders(providers: LlmProviderConfig[] | null): void {
  cachedEnabledProviders = providers
}

export function getCachedDefaultProvider(): LlmProviderConfig | null {
  return cachedDefaultProvider
}

export function setCachedDefaultProvider(provider: LlmProviderConfig | null): void {
  cachedDefaultProvider = provider
}

export async function getSubAgentDefs(workspaceId: number): Promise<SubAgentConfig[]> {
  if (!cachedSubAgentDefs) cachedSubAgentDefs = new Map()
  if (cachedSubAgentDefs.has(workspaceId)) return cachedSubAgentDefs.get(workspaceId)!
  const defs = await loadSubAgentDefinitions(workspaceId)
  cachedSubAgentDefs.set(workspaceId, defs)
  return defs
}

export function clearTopicCache(): void {
  // 话题数据不再全量缓存，前端使用分页查询
}

export async function preloadChatData(): Promise<void> {
  try {
    const chatSettings = settingsStore.get('chat') as ChatSettings | undefined
    const workspaceId = chatSettings?.activeWorkspaceId ?? 0
    const [enabled, defaultProvider, topicsResult, subAgents] = await Promise.all([
      getEnabledProviders(),
      getDefaultProvider(),
      getAllTopicsPaginated(workspaceId, 0, 20),
      loadSubAgentDefinitions(workspaceId)
    ])
    cachedEnabledProviders = enabled
    cachedDefaultProvider = defaultProvider
    if (!cachedSubAgentDefs) cachedSubAgentDefs = new Map()
    cachedSubAgentDefs.set(workspaceId, subAgents)
    logger.info('[Preload] Chat data preloaded:', {
      providers: enabled.length,
      topics: topicsResult.items.length,
      topicsTotal: topicsResult.total,
      subAgents: subAgents.length
    })
  } catch (err) {
    logger.error('[Preload] Failed to preload chat data:', err)
  }
}
