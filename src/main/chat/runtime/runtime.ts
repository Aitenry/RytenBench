import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { BaseMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import logger from 'electron-log'
import type { SubAgentConfig } from '../types'
import { buildAgentGraph, buildGraphInput, MAX_TOOL_CALLS, type QueueRef } from './agent'
import { buildFsTools } from './fs-backend'
import { buildTodoTools, todoStore } from './todo'
import { buildGoalTools, goalStore } from './goal'
import { buildJobTools, jobsRegistry } from './jobs'
import { buildAskUserTool } from './ask'
import { buildSubagentControlTools, subagentSessions } from './subagent-sessions'
import { buildWorkflowTool } from './workflow'
import { buildSkillsPromptSection, loadSkills } from './skills'
import { buildSubAgentTools as buildSubAgentToolsFromRegistry } from '../tools/builders'
import { createTaskTool } from './subagent'
import { RecordQueue, startGraphStream, invokeGraph, type GraphRunOptions } from './graph'
import { SpillStore } from './spill'
import type { MnemonComponent } from './mnemon'
import type { RuntimeStream } from './types'
import type { MemoryInjection, TurnMeta } from '../types'

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
  /** 溢出存储引用：stream/invoke 时按 topicId 创建（子代理图通过引用共享同一次请求的实例） */
  private readonly spillRef: { current?: SpillStore } = {}
  private readonly taskTool?: StructuredToolInterface
  private readonly workflowTool: StructuredToolInterface
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
        spillRef: this.spillRef,
        recursionLimit: this.recursionLimit,
        // 子代理专属记忆根（<memoryPath>/workspace-<wsId>/ 下 sub-agents/<name>/memories/AGENTS.md）
        memoryPath: opts.memoryPath,
        // 技能目录：子代理按声明的 skills 过滤注入
        skillsPath: opts.skillsPath
      })
    }

    // 工作流工具：脚本编排多代理 fan-out（子代理 = 业务工具 + 文件工具，防递归嵌套）
    this.workflowTool = buildWorkflowTool({
      mainModel: opts.model,
      resolveModel: (spec) => this.resolveSubAgentModel(spec),
      buildAgentTools: () => [...this.opts.tools, ...this.fsTools],
      recursionLimit: this.recursionLimit,
      spillRef: this.spillRef
    })

    logger.info(
      `[Runtime] initialized (recursionLimit=${this.recursionLimit}, maxToolCalls=${MAX_TOOL_CALLS}, fsTools=${this.fsTools.length}, subAgents=${opts.subAgents.length}, taskTool=${this.taskTool ? 'yes' : 'no'}, mnemon=${this.mnemon ? `yes(${this.mnemon.tools.length} tools)` : 'no'}, workspacePath=${opts.workspacePath ?? 'disabled'}, memoryPath=${opts.memoryPath ?? 'disabled'}, skillsPath=${opts.skillsPath ?? 'disabled'})`
    )
  }

  /**
   * 组装主代理工具集
   * （业务工具 + 文件工具 + 待办 + 目标 + 后台任务 + 提问 + 子代理续接控制 + 工作流 + Mnemon + task）
   */
  private buildAllTools(topicId: number): StructuredToolInterface[] {
    return [
      ...this.opts.tools,
      ...this.fsTools,
      ...buildTodoTools(todoStore, topicId),
      ...buildGoalTools(goalStore, topicId),
      ...buildJobTools(jobsRegistry, topicId),
      buildAskUserTool(topicId),
      ...buildSubagentControlTools(subagentSessions, topicId),
      this.workflowTool,
      ...(this.mnemon ? this.mnemon.tools : []),
      ...(this.taskTool ? [this.taskTool] : [])
    ]
  }

  /** 子代理工具（按声明的工具名从系统工具注册表独立构建，与主智能体工具配置无关） */
  private buildSubAgentTools(subAgent: SubAgentConfig): StructuredToolInterface[] {
    return buildSubAgentToolsFromRegistry(subAgent)
  }

  /** 解析 'provider:model' → 模型实例；失败返回 undefined（回退主模型） */
  private async resolveSubAgentModel(spec: string | undefined): Promise<BaseChatModel | undefined> {
    if (!spec) return undefined
    // 仅按第一个冒号分割（模型名可能本身含冒号，如 ollama 的 "qwen2.5:7b"）
    const sep = spec.indexOf(':')
    if (sep <= 0) return undefined
    const type = spec.slice(0, sep).trim().toLowerCase()
    const modelName = spec
      .slice(sep + 1)
      .trim()
      .toLowerCase()
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
   * 构建系统提示词：Rita 人设 + 子智能体引导 + 技能段 + Mnemon sections（热记忆由 Mnemon 统一注入）。
   */
  private buildSystemPrompt(): string {
    let prompt = RITA_BASE_PROMPT
    if (this.opts.subAgents.length > 0) {
      const list = this.opts.subAgents
        .map((sa) => {
          const display =
            sa.rename && sa.rename !== sa.name ? `${sa.rename}（${sa.name}）` : sa.name
          return `- ${display}: ${sa.description || '（无描述）'}`
        })
        .join('\n')
      prompt += `\n\n## 子智能体
你可以使用 task 工具将合适的任务委托给专门的子智能体执行（子智能体拥有独立的系统提示词、工具与模型）。当任务超出你当前处理范围、或属于某个子智能体的专长领域时，优先考虑委托。可用子智能体：
${list}
委托完成后，子智能体的完整输出会直接展示给用户，你的最终回答只需简短总结或直接收尾，不要复述子智能体已输出的详细内容。`
    }
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
  private graphOptions(signal?: AbortSignal, turnMeta?: TurnMeta, topicId = 0): GraphRunOptions {
    return {
      recursionLimit: this.recursionLimit,
      signal,
      // 本轮来源与话题归属：工具层经 config.configurable 读取
      //（目标工具 authority 校验、后台任务的 owner 隔离）
      configurable: {
        topicId,
        turnSource: turnMeta?.source ?? 'user',
        goalRound:
          turnMeta?.source === 'goal-round'
            ? {
                goalId: turnMeta.goalId,
                revision: turnMeta.goalRevision,
                round: turnMeta.goalRound
              }
            : undefined
      }
    }
  }

  /**
   * 本轮注入系统提示词的热记忆内容（USER / MEMORY 条目）。
   * Mnemon 未启用或热记忆为空时返回 null——前端据此决定是否显示「注入记忆」标识。
   */
  get memoryInjection(): MemoryInjection | null {
    if (!this.mnemon) return null
    const snapshot = this.mnemon.runtimeMemory.snapshot()
    const user = snapshot.entries.filter((e) => e.target === 'user').map((e) => e.content)
    const memory = snapshot.entries.filter((e) => e.target === 'memory').map((e) => e.content)
    if (user.length === 0 && memory.length === 0) return null
    return {
      user,
      memory,
      usage: {
        user: `${snapshot.targets.user.used}/${snapshot.targets.user.limit}`,
        memory: `${snapshot.targets.memory.used}/${snapshot.targets.memory.limit}`
      }
    }
  }

  /**
   * 流式执行：注入记录队列 → 构建主代理图 → 启动后台消费 → 返回三路流。
   *
   * topicId 用于把对话计划（write_todos 清单）归属到当前话题并广播到前端。
   * 清单跨请求/跨轮次保留（进程级单例），模型可在后续轮次继续维护；
   * 取消/结束时仅关闭记录队列，不清空清单（中断的任务可继续追问）。
   */
  stream(
    messages: BaseMessage[],
    signal?: AbortSignal,
    topicId = 0,
    turnMeta?: TurnMeta
  ): RuntimeStream {
    const queue = new RecordQueue()
    this.queueRef.current = queue
    // 按话题创建溢出存储（工作区 .spill 优先，其次记忆目录；均无则禁用溢出）
    this.spillRef.current = new SpillStore(this.opts.workspacePath, this.opts.memoryPath, topicId)
    const graph = buildAgentGraph({
      model: this.opts.model,
      tools: this.buildAllTools(topicId),
      systemPrompt: this.systemPrompt,
      queue: this.queueRef,
      spill: this.spillRef.current
    })
    return startGraphStream(
      graph,
      buildGraphInput(messages),
      this.graphOptions(signal, turnMeta, topicId),
      queue
    )
  }

  /**
   * 非流式执行：返回最终消息列表。
   */
  async invoke(
    messages: BaseMessage[],
    signal?: AbortSignal,
    topicId = 0,
    turnMeta?: TurnMeta
  ): Promise<BaseMessage[]> {
    this.queueRef.current = undefined
    this.spillRef.current = new SpillStore(this.opts.workspacePath, this.opts.memoryPath, topicId)
    const graph = buildAgentGraph({
      model: this.opts.model,
      tools: this.buildAllTools(topicId),
      systemPrompt: this.systemPrompt,
      queue: this.queueRef,
      spill: this.spillRef.current
    })
    return await invokeGraph(
      graph,
      buildGraphInput(messages),
      this.graphOptions(signal, turnMeta, topicId)
    )
  }
}
