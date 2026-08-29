import type { StructuredToolInterface } from '@langchain/core/tools'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage } from '@langchain/core/messages'
import logger from 'electron-log'
import * as fs from 'fs'
import * as path from 'path'
import { ChatOptions, StructuredMessage, SubAgentConfig, HistoryCompaction } from '../types'
import { Runtime } from '../runtime/runtime'
import { getMnemonComponent } from '../mnemon-singleton'
import { summarizeDialogues } from '../runtime/compaction'
import {
  getCompactionByTopic,
  upsertCompaction
} from '../../database/mapper/compaction'
import type { HistoryDialogue, LoadHistoryFn } from './history'
import { extractStructuredMessages, convertDialoguesToMessages } from './history'
import { buildHumanMessage } from './message-builder'
import type { UploadedFileRef } from './message-builder'
import { runStream } from './stream-handler'

class ChatService {
  private readonly model: BaseChatModel
  private readonly tools: StructuredToolInterface[]
  private readonly subAgents: SubAgentConfig[]
  private readonly loadHistory?: LoadHistoryFn
  private readonly skillsPath?: string
  private readonly enabledSkills?: string[]
  private readonly workspacePath?: string
  private readonly memoryPath?: string
  private readonly workspaceId: number

  /**
   * @param model 已创建的 BaseChatModel 实例（由外部 ProviderService 提供）
   * @param tools 工具列表
   * @param subAgents 智能体定义列表
   * @param loadHistory 从数据库加载历史对话的回调（由主进程注入，避免循环依赖）
   * @param skillsPath 技能存储目录（含 SKILL.md 的子目录即技能），空表示不启用
   * @param enabledSkills 启用的技能 ID 列表，undefined 表示全部启用
   * @param workspacePath AI 工作区目录，挂载为虚拟 /
   * @param memoryPath 记忆存储根目录，空表示不启用（其下按工作区 ID 分隔，每个工作区一套独立记忆）
   * @param workspaceId 当前工作区 ID，用于按工作区隔离记忆目录
   */
  constructor(
    model: BaseChatModel,
    tools: StructuredToolInterface[] = [],
    subAgents: SubAgentConfig[] = [],
    loadHistory?: LoadHistoryFn,
    skillsPath?: string,
    enabledSkills?: string[],
    workspacePath?: string,
    memoryPath?: string,
    workspaceId = 0
  ) {
    this.model = model
    this.tools = tools
    this.subAgents = subAgents
    this.loadHistory = loadHistory
    this.skillsPath = skillsPath
    this.enabledSkills = enabledSkills
    this.workspacePath = workspacePath
    this.memoryPath = memoryPath
    this.workspaceId = workspaceId
    logger.info(
      `ChatService initialized with LangChain Runtime (skillsPath=${this.skillsPath ?? 'disabled'}, workspacePath=${this.workspacePath ?? 'disabled'}, memoryPath=${this.memoryPath ?? 'disabled'}, workspaceId=${this.workspaceId}, subAgents=${this.subAgents.length})`
    )
  }

  /**
   * 创建 LangChain/LangGraph 运行时（每次请求独立实例，隔离性好）。
   * Mnemon 记忆组件为进程级单例（跨请求共享，见 mnemon-singleton.ts）。
   */
  private createRuntime(): Runtime {
    return new Runtime({
      model: this.model,
      tools: this.tools,
      subAgents: this.subAgents,
      skillsPath: this.skillsPath,
      enabledSkills: this.enabledSkills,
      workspacePath: this.workspacePath,
      // 记忆按工作区隔离：Runtime 的 /memories/ 挂载与 Mnemon 存储根
      // 均位于 <memoryPath>/workspace-<workspaceId>/ 下（见 mnemon-singleton.ts）
      memoryPath: this.workspaceMemoryPath,
      workspaceId: this.workspaceId,
      mnemon: getMnemonComponent(this.memoryPath, this.workspaceId)
    })
  }

  /** 工作区级记忆目录（记忆根 + 工作区 ID 定位） */
  private get workspaceMemoryPath(): string | undefined {
    if (!this.memoryPath) return undefined
    return path.join(this.memoryPath, `workspace-${this.workspaceId}`)
  }

  /**
   * 将用户上传的文件复制到 agent 工作区 /uploads/ 目录，
   * 返回 agent 文件系统中的虚拟路径引用。
   *
   * 不直接将文件内容嵌入消息，而是让 agent 通过 read_file 工具按需读取，
   * 大文件读取结果在工具层截断（20K 字符），避免上下文膨胀。
   */
  private async copyUploadedFiles(
    docs?: { fileName: string; filePath: string }[]
  ): Promise<UploadedFileRef[] | undefined> {
    if (!docs || docs.length === 0 || !this.workspacePath) return undefined

    const uploadsDir = path.join(this.workspacePath, 'uploads')
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true })
    }

    const refs: UploadedFileRef[] = []
    for (const doc of docs) {
      try {
        const destPath = path.join(uploadsDir, doc.fileName)
        fs.copyFileSync(doc.filePath, destPath)
        refs.push({
          fileName: doc.fileName,
          virtualPath: `/uploads/${doc.fileName}`
        })
      } catch (err) {
        logger.warn(`Failed to copy uploaded file ${doc.fileName}:`, err)
        // 复制失败时仍告知 agent，让其尝试直接从原始路径读取
        refs.push({
          fileName: doc.fileName,
          virtualPath: doc.filePath
        })
      }
    }

    return refs.length > 0 ? refs : undefined
  }

  /**
   * 从数据库加载历史消息上下文
   * @param topicId 话题 ID
   * @param onCompactionStart 摘要压缩开始时回调（LLM 调用前触发，前端展示「压缩中」）
   * @param contextBudget 历史上下文字符预算（由模型上下文窗口换算，缺省用默认下限）
   * @returns 转换后的 LangChain BaseMessage 数组及本轮发生的摘要压缩信息
   */
  private async loadContextMessages(
    topicId: number,
    onCompactionStart?: () => void,
    contextBudget?: number
  ): Promise<{ messages: BaseMessage[]; compaction?: HistoryCompaction }> {
    if (!this.loadHistory) {
      logger.warn('[Chat] loadHistory callback not provided, skipping history')
      return { messages: [] }
    }
    if (topicId <= 0) {
      logger.warn(`[Chat] Invalid topicId=${topicId}, skipping history`)
      return { messages: [] }
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
        return { messages: [] }
      }

      const context = await convertDialoguesToMessages(historyDialogues, {
        // 摘要压缩：压力达标时把最老对话压缩为 checkpoint（持久化复用，增量合并），
        // 失败回退字符截断。checkpoint 存于 topic_compactions 表：
        // 压缩一次后后续轮次直接复用，仅边界推进（又超预算）时增量合并再落库。
        maxChars: contextBudget,
        summarizer: (transcript, priorSummary) =>
          summarizeDialogues(this.model, transcript, priorSummary),
        topicId,
        getCheckpoint: async (tid) => {
          const row = await getCompactionByTopic(tid)
          return row ? { boundaryId: row.boundary_id, summary: row.summary } : undefined
        },
        saveCheckpoint: async (tid, cp) => {
          await upsertCompaction({ topic_id: tid, boundary_id: cp.boundaryId, summary: cp.summary })
        },
        onCompactionStart
      })
      logger.info(`[Chat] Loaded ${context.messages.length} history messages for topic ${topicId}`)
      return { messages: context.messages, compaction: context.compaction }
    } catch (err) {
      logger.error('Failed to load chat history:', err)
      return { messages: [] }
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
      const runtime = this.createRuntime()

      // 将上传文件复制到 agent 可访问的工作区目录
      const uploadedRefs = await this.copyUploadedFiles(options?.documents)
      const userMessage = buildHumanMessage(message, options?.images, uploadedRefs)
      const context = options?.topicId
        ? await this.loadContextMessages(options.topicId, undefined, options?.contextBudget)
        : { messages: [] as BaseMessage[] }
      logger.info(
        `[Chat] Passing ${context.messages.length} context messages + 1 user message to runtime (topicId=${options?.topicId})`
      )
      const resultMessages = await runtime.invoke(
        [...context.messages, userMessage],
        options?.signal,
        options?.topicId,
        options?.turnMeta
      )

      const structured = extractStructuredMessages(resultMessages)
      // 非流式路径同样携带本轮热记忆注入与摘要压缩信息（前端据此显示卡片）
      const meta: StructuredMessage[] = []
      if (context.compaction) meta.push({ historyCompacted: context.compaction })
      const injection = runtime.memoryInjection
      if (injection) meta.push({ memoryInjected: injection })
      return meta.length > 0 ? [...meta, ...structured] : structured
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
        createRuntime: () => this.createRuntime(),
        loadContextMessages: (
          topicId: number,
          onCompactionStart?: () => void,
          contextBudget?: number
        ) => this.loadContextMessages(topicId, onCompactionStart, contextBudget),
        copyUploadedFiles: (docs) => this.copyUploadedFiles(docs)
      },
      message,
      options
    )
  }
}

export { ChatService }
export type { HistoryDialogue, LoadHistoryFn }
