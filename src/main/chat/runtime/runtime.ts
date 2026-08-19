import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import logger from 'electron-log'
import type { SubAgentConfig } from '../types'
import { buildAgentGraph, buildGraphInput, MAX_TOOL_CALLS, type QueueRef } from './agent'
import { buildFsTools } from './fs-backend'
import { buildTodoTools, todoStore } from './todo'
import { buildSkillsPromptSection, loadSkills } from './skills'
import { createTaskTool } from './subagent'
import { RecordQueue, startGraphStream, invokeGraph, type GraphRunOptions } from './graph'
import type { MnemonComponent } from './mnemon'
import type { RuntimeStream } from './types'

/**
 * AgentRuntime — 声明式组件组装入口（对应论文 §5.2 声明式配置 + 协调）
 *
 * 组件依赖声明（inject）：
 * - 文件工具集 ← workspacePath / memoryPath（无挂载则不激活）
 * - 记忆 ← memoryPath + workspaceId（未配置则不注入）
 * - 技能 ← skillsPath + enabledSkills（未配置则不注入）
 * - 子代理 ← subAgents + 模型解析器（无子代理则不挂 task 工具）
 *
 * 每个请求一个 Runtime 实例（与旧 ChatService 每次构建 agent 一致），隔离性好。
 */

/** Rita 基础人设（与旧版保持一致） */
const RITA_BASE_PROMPT = `Your name is Rita. You are a helpful assistant.

You are in a continuous conversation with the user. All messages in the chat history are genuine prior exchanges between you and this same user — treat them as real conversation context.
- When the user asks about "previous" or "last time", refer to the conversation history provided.
- Do NOT claim you cannot see or remember earlier messages. You have full access to the chat history.
- Keep your responses concise and natural in Chinese unless the user writes in another language.`

export interface AgentRuntimeOptions {
  /** 已创建的 BaseChatModel 实例（由 ProviderService 提供） */
  model: BaseChatModel
  /** 业务工具列表（8 个内置 AI 工具） */
  tools: StructuredToolInterface[]
  /** 智能体定义列表 */
  subAgents: SubAgentConfig[]
  /** 技能目录（含 SKILL.md 的子目录即技能），空表示不启用 */
  skillsPath?: string
  /** 启用的技能 ID 列表，undefined 表示全部启用 */
  enabledSkills?: string[]
  /** AI 工作区目录（挂载为虚拟 /） */
  workspacePath?: string
  /** 记忆存储根目录，空表示不启用 */
  memoryPath?: string
  /** 当前工作区 ID */
  workspaceId: number
  /** Mnemon 记忆组件（进程级单例，由 ChatService 注入） */
  mnemon?: MnemonComponent
}

export class Runtime {
  private readonly opts: AgentRuntimeOptions
  private readonly fsTools: StructuredToolInterface[]
  private readonly queueRef: QueueRef = {}
  private readonly taskTool?: StructuredToolInterface
  private readonly systemPrompt: string
  private readonly mnemon?: MnemonComponent
  /** 图递归上限：远宽于 MAX_TOOL_CALLS 护栏（每轮约 2 个节点步 + 收尾余量），
   *  工具护栏先触发；即使触顶也有 graph.ts 的优雅收尾兜底（不报错）。 */
  private readonly recursionLimit: number

  constructor(opts: AgentRuntimeOptions) {
    this.opts = opts
    this.recursionLimit = MAX_TOOL_CALLS * 2 + 20
    this.mnemon = opts.mnemon
    this.fsTools = buildFsTools({
      workspacePath: opts.workspacePath,
      memoryPath: opts.memoryPath
    })
    this.systemPrompt = this.buildSystemPrompt()

    if (opts.subAgents.length > 0) {
      this.taskTool = createTaskTool({
        subAgents: opts.subAgents,
        mainModel: opts.model,
        resolveModel: (spec) => this.resolveSubAgentModel(spec),
        workspaceId: opts.workspaceId,
        buildTools: (sa) => this.buildSubAgentTools(sa),
        queue: this.queueRef,
        recursionLimit: this.recursionLimit
      })
    }

    logger.info(
      `[Runtime] initialized (recursionLimit=${this.recursionLimit}, maxToolCalls=${MAX_TOOL_CALLS}, fsTools=${this.fsTools.length}, subAgents=${opts.subAgents.length}, taskTool=${this.taskTool ? 'yes' : 'no'}, mnemon=${this.mnemon ? `yes(${this.mnemon.tools.length} tools)` : 'no'}, workspacePath=${opts.workspacePath ?? 'disabled'}, memoryPath=${opts.memoryPath ?? 'disabled'}, skillsPath=${opts.skillsPath ?? 'disabled'})`
    )
  }

  /** 组装主代理工具集（业务工具 + 文件工具 + 待办 + Mnemon + task） */
  private buildAllTools(topicId: number): StructuredToolInterface[] {
    return [
      ...this.opts.tools,
      ...this.fsTools,
      ...buildTodoTools(todoStore, topicId),
      ...(this.mnemon ? this.mnemon.tools : []),
      ...(this.taskTool ? [this.taskTool] : [])
    ]
  }

  /** 子代理工具（按声明的工具名从业务工具中选取） */
  private buildSubAgentTools(subAgent: SubAgentConfig): StructuredToolInterface[] {
    const names = subAgent.tools || []
    return this.opts.tools.filter((t) => names.includes(t.name))
  }

  /** 解析 'provider:model' → 模型实例；失败返回 undefined（回退主模型） */
  private async resolveSubAgentModel(spec: string | undefined): Promise<BaseChatModel | undefined> {
    if (!spec) return undefined
    const [type, modelName] = spec.split(':').map((s) => s.trim().toLowerCase())
    if (!type || !modelName) return undefined
    try {
      const { getEnabledProviders } = await import('../../database/mapper/provider')
      const providers = await getEnabledProviders()
      const match = providers.find(
        (p) => p.provider.toLowerCase() === type && p.model.toLowerCase() === modelName
      )
      if (!match) return undefined
      const { getProviderService } = await import('../../provider/service')
      return await getProviderService().createModel(match.id)
    } catch (err) {
      logger.warn(`[Runtime] 子代理模型解析失败 "${spec}"，回退主模型:`, err)
      return undefined
    }
  }

  /**
   * 构建系统提示词：Rita 人设 + 技能段 + Mnemon sections（热记忆由 Mnemon 统一注入）。
   */
  private buildSystemPrompt(): string {
    let prompt = RITA_BASE_PROMPT
    const skillsSection = buildSkillsPromptSection(
      loadSkills({ skillsPath: this.opts.skillsPath, enabledSkills: this.opts.enabledSkills })
    )
    if (skillsSection) {
      prompt += skillsSection
    }
    if (this.mnemon) {
      for (const section of this.mnemon.promptSections) {
        prompt += section
      }
    }
    return prompt
  }

  /** 图执行配置（递归上限触顶时由 graph 层优雅收尾，不再报错） */
  private graphOptions(signal?: AbortSignal): GraphRunOptions {
    return {
      recursionLimit: this.recursionLimit,
      signal
    }
  }

  /**
   * 流式执行：注入记录队列 → 构建主代理图 → 启动后台消费 → 返回三路流。
   *
   * topicId 用于把对话计划（write_todos 清单）归属到当前话题并广播到前端。
   * 清单跨请求/跨轮次保留（进程级单例），模型可在后续轮次继续维护；
   * 取消/结束时仅关闭记录队列，不清空清单（中断的任务可继续追问）。
   */
  stream(messages: BaseMessage[], signal?: AbortSignal, topicId = 0): RuntimeStream {
    const queue = new RecordQueue()
    this.queueRef.current = queue
    const graph = buildAgentGraph({
      model: this.opts.model,
      tools: this.buildAllTools(topicId),
      systemPrompt: this.systemPrompt,
      queue: this.queueRef
    })
    return startGraphStream(graph, buildGraphInput(messages), this.graphOptions(signal), queue)
  }

  /**
   * 非流式执行：返回最终消息列表。
   */
  async invoke(messages: BaseMessage[], signal?: AbortSignal, topicId = 0): Promise<BaseMessage[]> {
    this.queueRef.current = undefined
    const graph = buildAgentGraph({
      model: this.opts.model,
      tools: this.buildAllTools(topicId),
      systemPrompt: this.systemPrompt,
      queue: this.queueRef
    })
    return await invokeGraph(graph, buildGraphInput(messages), this.graphOptions(signal))
  }
}
