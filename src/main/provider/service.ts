import { ChatOpenAI } from '@langchain/openai'
import logger from 'electron-log'
import { getDefaultProvider, getProviderById, LlmProviderConfig } from '../database/mapper/provider'

/**
 * 大模型供应商服务
 * 从数据库读取供应商配置，创建 LangChain ChatModel 实例
 *
 * 当前实现：所有供应商统一使用 ChatOpenAI（兼容 OpenAI API 格式）
 * 未来可扩展支持其他 LangChain ChatModel（如 ChatAnthropic、ChatOllama 等）
 */
class ProviderService {
  private static instance: ProviderService | null = null
  private providerCache: Map<number, LlmProviderConfig> = new Map()

  static getInstance(): ProviderService {
    if (!ProviderService.instance) {
      ProviderService.instance = new ProviderService()
    }
    return ProviderService.instance
  }

  /**
   * 根据供应商 ID 创建 ChatOpenAI 实例
   */
  async createModel(providerId?: number): Promise<ChatOpenAI> {
    const config = await this.resolveConfig(providerId)

    if (!config) {
      throw new Error('No LLM provider configured. Please add a provider in settings.')
    }

    return this.buildChatOpenAI(config)
  }

  /**
   * 根据供应商 ID 获取解密后的配置（不创建实例）
   */
  async getConfig(providerId?: number): Promise<LlmProviderConfig> {
    const config = await this.resolveConfig(providerId)
    if (!config) {
      throw new Error('No LLM provider configured.')
    }
    return config
  }

  /**
   * 清除缓存（配置变更后调用）
   */
  clearCache(): void {
    this.providerCache.clear()
    logger.info('ProviderService cache cleared')
  }

  // --- 内部方法 ---

  private async resolveConfig(providerId?: number): Promise<LlmProviderConfig | null> {
    // 如果指定了ID，直接获取
    if (providerId) {
      if (this.providerCache.has(providerId)) {
        return this.providerCache.get(providerId)!
      }
      const config = await getProviderById(providerId)
      if (config) {
        this.providerCache.set(providerId, config)
      }
      return config
    }

    // 否则获取默认供应商
    return this.getDefaultConfig()
  }

  private async getDefaultConfig(): Promise<LlmProviderConfig | null> {
    const config = await getDefaultProvider()
    if (config) {
      this.providerCache.set(config.id, config)
    }
    return config
  }

  /**
   * 将数据库配置转为 ChatOpenAI 构造函数参数
   */
  private buildChatOpenAI(config: LlmProviderConfig): ChatOpenAI {
    const fields: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature
    }

    // baseURL 配置
    if (config.base_url) {
      fields.configuration = { baseURL: config.base_url }
    }

    // API Key
    if (config.api_key) {
      fields.apiKey = config.api_key
    }

    // maxTokens
    if (config.max_tokens) {
      fields.maxTokens = config.max_tokens
    }

    // 额外的自定义配置（如 topP, frequencyPenalty 等）
    if (config.extra_config) {
      Object.assign(fields, config.extra_config)
    }

    logger.info(`Creating ChatOpenAI instance: provider="${config.name}", model="${config.model}"`)

    return new ChatOpenAI(fields)
  }
}

/** 获取单例 */
function getProviderService(): ProviderService {
  return ProviderService.getInstance()
}

export { ProviderService, getProviderService }
