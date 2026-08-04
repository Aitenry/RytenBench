import type { StructuredToolInterface } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage } from '@langchain/core/messages'
import { createDeepAgent } from 'deepagents'
import type { SubAgent } from 'deepagents'
import logger from 'electron-log'
import { ChatOptions, StructuredMessage, SubAgentConfig } from '../types'
import { buildSubAgentTools } from '../tools/builders'
import { SafeFilesystemBackend } from './safe-backend'
import type { HistoryDialogue, LoadHistoryFn } from './history'
import { extractStructuredMessages, convertDialoguesToMessages } from './history'
import { buildHumanMessage } from './message-builder'
import { runStream } from './stream-handler'

class ChatService {
  private readonly model: BaseChatModel
  private readonly tools: StructuredToolInterface[]
  private readonly subAgents: SubAgentConfig[]
  private readonly _maxIterations: number
  private readonly loadHistory?: LoadHistoryFn
  private readonly historyWindowSize: number
  private readonly skillsPath?: string
  private readonly enabledSkills?: string[]
  private readonly workspacePath?: string

  /**
   * @param model 已创建的 BaseChatModel 实例（由外部 ProviderService 提供）
   * @param tools 工具列表
   * @param subAgents 智能体定义列表
   * @param maxIterations 工具调用最大轮次（保留兼容性，deepAgents 内部自动管理）
   * @param loadHistory 从数据库加载历史对话的回调（由主进程注入，避免循环依赖）
   * @param historyWindowSize 历史对话轮次上限（0 = 不限制），默认 10
   * @param skillsPath 技能存储目录（deepAgents skills），空表示不启用
   * @param enabledSkills 启用的技能 ID 列表，undefined 表示全部启用
   * @param workspacePath AI 工作区目录，挂载为 FilesystemBackend 根目录（虚拟 /）
   */
  constructor(
    model: BaseChatModel,
    tools: StructuredToolInterface[] = [],
    subAgents: SubAgentConfig[] = [],
    maxIterations = 5,
    loadHistory?: LoadHistoryFn,
    historyWindowSize = 10,
    skillsPath?: string,
    enabledSkills?: string[],
    workspacePath?: string
  ) {
    this.model = model
    this.tools = tools
    this.subAgents = subAgents
    this._maxIterations = maxIterations
    this.loadHistory = loadHistory
    this.historyWindowSize = historyWindowSize
    this.skillsPath = skillsPath
    this.enabledSkills = enabledSkills
    this.workspacePath = workspacePath
    logger.info(
      `ChatService initialized with DeepAgents (maxIterations=${this._maxIterations}, historyWindow=${this.historyWindowSize}, skillsPath=${this.skillsPath ?? 'disabled'}, workspacePath=${this.workspacePath ?? 'disabled'}, subAgents=${this.subAgents.length})`
    )
  }

  /**
   * 创建 DeepAgent 实例；配置工作区目录时挂载 FilesystemBackend，配置技能目录时启用 skills 加载。
   * 路径需转换为 POSIX 正斜杠（deepAgents 内部使用 path.resolve，Windows 反斜杠会被误解析）。
   * 智能体将工具组合为专用智能体，主代理通过 task() 工具委托任务。
   */
  private createAgent(): ReturnType<typeof createDeepAgent> {
    // 构建 deepAgents SubAgent 字典，解析工具名称为实际工具实例
    const deepSubAgents: SubAgent[] = this.subAgents.map((sa) => ({
      name: sa.name,
      description: sa.description,
      systemPrompt: sa.systemPrompt,
      model: sa.model,
      tools: buildSubAgentTools(sa) as SubAgent['tools']
    }))

    const baseConfig = {
      model: this.model,
      tools: this.tools,
      systemPrompt: `Your name is Rita. You are a helpful assistant.

You are in a continuous conversation with the user. All messages in the chat history are genuine prior exchanges between you and this same user — treat them as real conversation context.
- When the user asks about "previous" or "last time", refer to the conversation history provided.
- Do NOT claim you cannot see or remember earlier messages. You have full access to the chat history.
- Keep your responses concise and natural in Chinese unless the user writes in another language.`,
      subagents: deepSubAgents.length > 0 ? deepSubAgents : undefined
    }

    // 确定 FilesystemBackend 的根目录：优先 workspacePath，回退到 skillsPath
    const backendRoot = this.workspacePath || this.skillsPath
    const config: Record<string, unknown> = { ...baseConfig }

    if (backendRoot) {
      const posixPath = backendRoot.replace(/\\/g, '/')
      config.backend = new SafeFilesystemBackend({ rootDir: posixPath, virtualMode: true })
    }

    if (this.skillsPath) {
      const skillPaths = this.enabledSkills ? this.enabledSkills.map((s) => '/' + s) : ['/']
      if (skillPaths.length > 0) {
        config.skills = skillPaths
      }
    }

    return createDeepAgent(config as Parameters<typeof createDeepAgent>[0])
  }

  /**
   * 从数据库加载历史消息上下文
   * @param topicId 话题 ID
   * @returns 转换后的 LangChain BaseMessage 数组
   */
  private async loadContextMessages(topicId: number): Promise<BaseMessage[]> {
    if (!this.loadHistory) {
      logger.warn('[Chat] loadHistory callback not provided, skipping history')
      return []
    }
    if (topicId <= 0) {
      logger.warn(`[Chat] Invalid topicId=${topicId}, skipping history`)
      return []
    }

    try {
      const dialogues = await this.loadHistory(topicId)
      logger.info(`[Chat] Fetched ${dialogues.length} dialogues for topic ${topicId}`)
      // 排除最后一条（当前用户消息），只取之前的对话
      const historyDialogues = dialogues.slice(0, -1)
      if (historyDialogues.length === 0) {
        logger.info(
          `[Chat] No prior dialogues for topic ${topicId} after excluding current message`
        )
        return []
      }

      const messages = convertDialoguesToMessages(historyDialogues, this.historyWindowSize)
      logger.info(`[Chat] Loaded ${messages.length} history messages for topic ${topicId}`)
      return messages
    } catch (err) {
      logger.error('Failed to load chat history:', err)
      return []
    }
  }

  /**
   * 发送消息并返回结构化的消息列表
   * @param message 用户输入
   * @param options 可选配置（含 topicId 用于加载历史）
   * @returns 结构化消息数组，每个元素包含工具调用信息或文本内容
   */
  async sendMessage(message: string, options?: ChatOptions): Promise<StructuredMessage[]> {
    try {
      const agent = this.createAgent()

      const userMessage = buildHumanMessage(message, options?.images, options?.documents)
      const contextMessages = options?.topicId
        ? await this.loadContextMessages(options.topicId)
        : []
      logger.info(
        `[Chat] Passing ${contextMessages.length} context messages + 1 user message to deepagent (topicId=${options?.topicId})`
      )
      const result = await agent.invoke({ messages: [...contextMessages, userMessage] })

      return extractStructuredMessages(result.messages || [])
    } catch (error) {
      logger.error('Error in sendMessage:', error)
      return [
        {
          content: `Failed to get response: ${error}`
        }
      ]
    }
  }

  /**
   * 发送消息并以流式方式返回内容
   * @param message 用户输入
   * @param options 可选配置（含 topicId 用于加载历史）
   * @returns 异步生成器，返回 StructuredMessage
   */
  async *sendMessageStream(
    message: string,
    options?: ChatOptions
  ): AsyncGenerator<StructuredMessage> {
    yield* runStream(
      {
        createAgent: () => this.createAgent(),
        loadContextMessages: (topicId: number) => this.loadContextMessages(topicId)
      },
      message,
      options
    )
  }
}

export { ChatService }
export type { HistoryDialogue, LoadHistoryFn }
