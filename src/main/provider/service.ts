import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ChatOpenAI } from '@langchain/openai'
import { ChatAnthropic } from '@langchain/anthropic'
import { ChatDeepSeek } from '@langchain/deepseek'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatVertexAI } from '@langchain/google-vertexai'
import { ChatMistralAI } from '@langchain/mistralai'
import { ChatOllama } from '@langchain/ollama'
import { ChatOpenRouter } from '@langchain/openrouter'
import { ChatXAI } from '@langchain/xai'
import { ChatBedrockConverse } from '@langchain/aws'
import { ChatCloudflareWorkersAI } from '@langchain/cloudflare'
import logger from 'electron-log'
import { getDefaultProvider, getProviderById, LlmProviderConfig } from '../database/mapper/provider'

/**
 * 大模型供应商服务
 * 从数据库读取供应商配置，根据 provider 类型创建对应的 LangChain ChatModel 实例
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
   * 根据供应商 ID 创建 ChatModel 实例。
   * 不再回退到默认供应商——要求前端显式传入 providerId。
   */
  async createModel(providerId?: number): Promise<BaseChatModel> {
    if (providerId == null) {
      throw new Error('目标模型不存在：请先在聊天界面顶部选择一个可用的 AI 模型。')
    }

    const config = await this.resolveConfig(providerId)

    if (!config) {
      throw new Error(
        `目标模型不存在：未找到 ID 为 ${providerId} 的供应商配置，或该供应商已被禁用。`
      )
    }

    if (!config.model || config.model.trim() === '') {
      throw new Error(
        `目标模型不存在：供应商 "${config.name}" 未指定模型名称，请在设置中配置模型。`
      )
    }

    return this.buildModel(config)
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
    if (providerId != null) {
      if (this.providerCache.has(providerId)) {
        const cached = this.providerCache.get(providerId)!
        // 缓存命中时也校验 is_enabled，防止使用已禁用的供应商
        if (!cached.is_enabled) return null
        return cached
      }
      const config = await getProviderById(providerId)
      if (config) {
        this.providerCache.set(providerId, config)
        // 指定 ID 查询时也需要检查是否已启用
        if (!config.is_enabled) return null
      }
      return config
    }

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
   * 根据供应商类型创建对应的 ChatModel 实例
   */
  private buildModel(config: LlmProviderConfig): BaseChatModel {
    const provider = config.provider.toLowerCase()
    const extra = (config.extra_config as Record<string, unknown>) ?? {}

    logger.info(
      `Creating model instance: provider="${provider}", name="${config.name}", model="${config.model}"`
    )

    switch (provider) {
      case 'openai':
        return this.buildOpenAI(config, extra)

      case 'anthropic':
        return this.buildAnthropic(config, extra)

      case 'deepseek':
        return this.buildDeepSeek(config, extra)

      case 'google':
      case 'google-genai':
        return this.buildGoogleGenerativeAI(config, extra)

      case 'vertexai':
      case 'google-vertexai':
        return this.buildVertexAI(config, extra)

      case 'mistral':
      case 'mistralai':
        return this.buildMistralAI(config, extra)

      case 'ollama':
        return this.buildOllama(config, extra)

      case 'openrouter':
        return this.buildOpenRouter(config, extra)

      case 'xai':
        return this.buildXAI(config, extra)

      case 'aws':
      case 'bedrock':
        return this.buildBedrockConverse(config, extra)

      case 'cloudflare':
        return this.buildCloudflareWorkersAI(config, extra)

      case 'custom':
        // 自定义服务商：按 extra_config.api_format 选兼容协议调用
        // （缺省 OpenAI 兼容；Anthropic 兼容走 ChatAnthropic + 自定义端点）
        if (String(extra.api_format ?? 'openai').toLowerCase() === 'anthropic') {
          return this.buildAnthropic(config, extra)
        }
        return this.buildOpenAI(config, extra)

      default:
        // 未知供应商回退为 OpenAI 兼容模式
        logger.warn(`Unknown provider "${provider}", falling back to ChatOpenAI`)
        return this.buildOpenAI(config, extra)
    }
  }

  // --- 各供应商工厂方法 ---

  private buildOpenAI(config: LlmProviderConfig, extra: Record<string, unknown>): ChatOpenAI {
    const fields: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature,
      // 统一开启流式：invoke() 内部走流式请求，逐 token（含工具参数增量）触发回调，
      // 长参数构建期间前端才能收到 preparing →「生成中」；LangGraph messages 模式
      // 自带聚合去重（emittedChatModelRunIds + dedupe），不会重复下发最终消息
      streaming: true,
      ...extra
    }
    if (config.max_tokens) fields.maxTokens = config.max_tokens
    if (config.api_key) fields.apiKey = config.api_key
    if (config.base_url) fields.configuration = { baseURL: config.base_url }
    return new ChatOpenAI(fields)
  }

  private buildAnthropic(config: LlmProviderConfig, extra: Record<string, unknown>): ChatAnthropic {
    const fields: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature,
      // 统一开启流式：invoke() 内部走流式请求，逐 token（含工具参数增量）触发回调，
      // 长参数构建期间前端才能收到 preparing →「生成中」；LangGraph messages 模式
      // 自带聚合去重（emittedChatModelRunIds + dedupe），不会重复下发最终消息
      streaming: true,
      ...extra
    }
    if (config.max_tokens) fields.maxTokens = config.max_tokens
    if (config.api_key) fields.apiKey = config.api_key
    if (config.base_url) fields.anthropicApiUrl = config.base_url
    return new ChatAnthropic(fields)
  }

  private buildDeepSeek(config: LlmProviderConfig, extra: Record<string, unknown>): ChatDeepSeek {
    const fields: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature,
      // 统一开启流式：invoke() 内部走流式请求，逐 token（含工具参数增量）触发回调，
      // 长参数构建期间前端才能收到 preparing →「生成中」；LangGraph messages 模式
      // 自带聚合去重（emittedChatModelRunIds + dedupe），不会重复下发最终消息
      streaming: true,
      ...extra
    }
    if (config.max_tokens) fields.maxTokens = config.max_tokens
    if (config.api_key) fields.apiKey = config.api_key
    if (config.base_url) fields.configuration = { baseURL: config.base_url }
    return new ChatDeepSeek(fields)
  }

  private buildGoogleGenerativeAI(
    config: LlmProviderConfig,
    extra: Record<string, unknown>
  ): ChatGoogleGenerativeAI {
    const fields: Record<string, unknown> = {
      temperature: config.temperature,
      streaming: true,
      ...extra
    }
    if (config.max_tokens) fields.maxOutputTokens = config.max_tokens
    if (config.api_key) fields.apiKey = config.api_key
    if (config.base_url) fields.baseUrl = config.base_url
    return new ChatGoogleGenerativeAI(config.model, fields)
  }

  private buildVertexAI(config: LlmProviderConfig, extra: Record<string, unknown>): ChatVertexAI {
    const fields: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature,
      // 统一开启流式：invoke() 内部走流式请求，逐 token（含工具参数增量）触发回调，
      // 长参数构建期间前端才能收到 preparing →「生成中」；LangGraph messages 模式
      // 自带聚合去重（emittedChatModelRunIds + dedupe），不会重复下发最终消息
      streaming: true,
      ...extra
    }
    if (config.max_tokens) fields.maxOutputTokens = config.max_tokens
    if (config.api_key) fields.apiKey = config.api_key
    return new ChatVertexAI(fields)
  }

  private buildMistralAI(config: LlmProviderConfig, extra: Record<string, unknown>): ChatMistralAI {
    const fields: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature,
      // 统一开启流式：invoke() 内部走流式请求，逐 token（含工具参数增量）触发回调，
      // 长参数构建期间前端才能收到 preparing →「生成中」；LangGraph messages 模式
      // 自带聚合去重（emittedChatModelRunIds + dedupe），不会重复下发最终消息
      streaming: true,
      ...extra
    }
    if (config.max_tokens) fields.maxTokens = config.max_tokens
    if (config.api_key) fields.apiKey = config.api_key
    if (config.base_url) fields.serverURL = config.base_url
    return new ChatMistralAI(fields)
  }

  private buildOllama(config: LlmProviderConfig, extra: Record<string, unknown>): ChatOllama {
    const fields: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature,
      // 统一开启流式：invoke() 内部走流式请求，逐 token（含工具参数增量）触发回调，
      // 长参数构建期间前端才能收到 preparing →「生成中」；LangGraph messages 模式
      // 自带聚合去重（emittedChatModelRunIds + dedupe），不会重复下发最终消息
      streaming: true,
      ...extra
    }
    if (config.max_tokens) fields.numPredict = config.max_tokens
    if (config.api_key) fields.apiKey = config.api_key
    if (config.base_url) fields.baseUrl = config.base_url
    return new ChatOllama(fields)
  }

  private buildOpenRouter(
    config: LlmProviderConfig,
    extra: Record<string, unknown>
  ): ChatOpenRouter {
    const fields: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature,
      // 统一开启流式：invoke() 内部走流式请求，逐 token（含工具参数增量）触发回调，
      // 长参数构建期间前端才能收到 preparing →「生成中」；LangGraph messages 模式
      // 自带聚合去重（emittedChatModelRunIds + dedupe），不会重复下发最终消息
      streaming: true,
      ...extra
    }
    if (config.max_tokens) fields.maxTokens = config.max_tokens
    if (config.api_key) fields.apiKey = config.api_key
    if (config.base_url) fields.configuration = { baseURL: config.base_url }
    return new ChatOpenRouter(fields)
  }

  private buildXAI(config: LlmProviderConfig, extra: Record<string, unknown>): ChatXAI {
    // xAI API 兼容 OpenAI 格式
    const fields: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature,
      // 统一开启流式：invoke() 内部走流式请求，逐 token（含工具参数增量）触发回调，
      // 长参数构建期间前端才能收到 preparing →「生成中」；LangGraph messages 模式
      // 自带聚合去重（emittedChatModelRunIds + dedupe），不会重复下发最终消息
      streaming: true,
      ...extra
    }
    if (config.max_tokens) fields.maxTokens = config.max_tokens
    if (config.api_key) fields.apiKey = config.api_key
    if (config.base_url) fields.configuration = { baseURL: config.base_url }
    return new ChatXAI(fields)
  }

  private buildBedrockConverse(
    config: LlmProviderConfig,
    extra: Record<string, unknown>
  ): ChatBedrockConverse {
    const fields: Record<string, unknown> = {
      model: config.model,
      temperature: config.temperature,
      // 统一开启流式：invoke() 内部走流式请求，逐 token（含工具参数增量）触发回调，
      // 长参数构建期间前端才能收到 preparing →「生成中」；LangGraph messages 模式
      // 自带聚合去重（emittedChatModelRunIds + dedupe），不会重复下发最终消息
      streaming: true,
      ...extra
    }
    if (config.max_tokens) fields.maxTokens = config.max_tokens
    if (config.api_key) {
      // Bedrock 使用 AWS credentials，API key 不走常规路径
      // 支持通过 extra_config 传入 credentials
    }
    if (config.base_url) {
      // Bedrock 通过 region 指定端点
      if (!fields.region) fields.region = 'us-east-1'
    }
    return new ChatBedrockConverse(fields)
  }

  private buildCloudflareWorkersAI(
    config: LlmProviderConfig,
    extra: Record<string, unknown>
  ): ChatCloudflareWorkersAI {
    const fields: Record<string, unknown> = {
      model: config.model,
      streaming: true,
      ...extra
    }
    if (config.api_key) fields.cloudflareApiToken = config.api_key
    return new ChatCloudflareWorkersAI(fields)
  }
}

/** 获取单例 */
function getProviderService(): ProviderService {
  return ProviderService.getInstance()
}

export { ProviderService, getProviderService }
