import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages'
import { GraphRecursionError } from '@langchain/langgraph'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import logger from 'electron-log'
import type { SubAgentConfig } from '../types'
import { buildAgentGraph, type StreamMessageLike } from './agent'
import { jobsRegistry } from './jobs'
import type { RuntimeRecord } from './types'
import type { SpillStore } from './spill'

/**
 * 子代理续接会话（continuable subagent sessions）— 对应 deepseek-harness 的
 * dsh-subagent / dsh-subagent-spawn-in-process / dsh-tool-subagent-control 体系
 *
 * 机制（参考 DSH，适配 RytenBench 按 topicId 组织的对话）：
 * - task(background=true) 启动一个「可续接」的子代理会话：持久消息历史 + 收件箱队列，
 *   跨主代理轮次存续（进程内；重启丢失，v1 不做冷恢复）；
 * - send_message 向会话投递下一轮消息：运行中则排队（FIFO 收件箱），空闲则唤醒；
 *   只返回投递确认 {messageId}，不等待子代理回复（父经 job_output/job_list 观察）；
 * - interrupt_agent 取消当前运行（keepInbox 语义：排队消息保留，可 send_message 唤醒）；
 * - list_agents 列出全部会话与状态（running=当前轮运行中 / idle=空闲待命；
 *   v1 进程内注册表，无 ready 冷存态）；
 * - 每次会话运行都注册为同名后台任务（job id = 会话 id），job_output/job_kill 复用；
 * - 权限：控制工具只注入主代理，且仅能操作本话题的会话（owner 按 topicId 隔离）。
 */

/** 会话状态行（list_agents 输出） */
export interface SubagentSessionRow {
  id: string
  name: string
  label: string
  status: 'running' | 'idle'
  queuedMessages: number
  createdAt: number
  lastRunAt?: number
}

interface SessionRecord {
  id: string
  topicId: number
  config: SubAgentConfig
  label: string
  /** 会话消息历史（systemPrompt 不入历史；入图时动态注入） */
  messages: BaseMessage[]
  /** 收件箱队列（运行中投递的消息排队） */
  inbox: string[]
  status: 'running' | 'idle'
  createdAt: number
  lastRunAt?: number
  /** 当前运行的取消控制器（interrupt 用） */
  currentAbort?: AbortController
  /** 话题删除后置位：禁止投递与收件箱续跑（防僵尸会话继续执行） */
  dead?: boolean
}

export type SubagentSessionsListener = (topicId: number, rows: SubagentSessionRow[]) => void

/** 启动子代理会话所需的运行上下文（复用主运行时组件） */
export interface SubagentSessionRuntime {
  mainModel: BaseChatModel
  resolveModel: (spec: string | undefined) => Promise<BaseChatModel | undefined>
  buildTools: (subAgent: SubAgentConfig) => StructuredToolInterface[]
  recursionLimit: number
  spillRef?: { current?: SpillStore }
  /** 子代理系统提示词扩展（专属记忆/技能），与 task 工具同源 */
  extendSystemPrompt: (sa: SubAgentConfig) => string
}

/** 子代理续接会话注册表（进程级单例，按 topicId 隔离） */
export class SubagentSessionRegistry {
  private readonly sessions = new Map<string, SessionRecord>()
  private counter = 0

  onChange?: SubagentSessionsListener

  /** 启动新会话（spawn 语义：全新上下文），首条消息立即开始运行 */
  start(
    topicId: number,
    config: SubAgentConfig,
    firstMessage: string,
    rt: SubagentSessionRuntime
  ): SubagentSessionRow {
    this.counter += 1
    const id = `subagent-${this.counter}`
    const displayName = config.rename && config.rename !== config.name ? config.rename : config.name
    const record: SessionRecord = {
      id,
      topicId,
      config,
      label: `${displayName}：${firstMessage.slice(0, 40)}`,
      messages: [],
      inbox: [],
      status: 'running',
      createdAt: Date.now()
    }
    this.sessions.set(id, record)
    void this.run(record, firstMessage, rt)
    return this.row(record)
  }

  /** 投递消息：空闲立即运行；运行中入队（FIFO）。返回投递确认 */
  send(id: string, topicId: number, message: string): { messageId: string } {
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const record = this.sessions.get(id)
    if (!record || record.topicId !== topicId) {
      throw new Error(`子代理会话 ${id} 不存在或不属于当前话题。`)
    }
    if (record.dead) {
      throw new Error(`子代理会话 ${id} 已随话题删除。`)
    }
    record.inbox.push(message)
    if (record.status === 'idle') {
      const next = record.inbox.shift()!
      void this.run(record, next, this.lastRuntime(record)!)
    }
    return { messageId }
  }

  /** 取消当前运行（keepInbox：排队消息保留）。缺席/已空闲 = no-op 接受 */
  interrupt(id: string, topicId: number): { accepted: boolean } {
    const record = this.sessions.get(id)
    if (!record || record.topicId !== topicId) return { accepted: true } // 缺席/已结束 = no-op
    if (record.status === 'running') {
      record.currentAbort?.abort()
    }
    return { accepted: true }
  }

  /** 全部会话行（按创建顺序） */
  list(topicId: number): SubagentSessionRow[] {
    return [...this.sessions.values()]
      .filter((s) => s.topicId === topicId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s) => this.row(s))
  }

  /** 话题删除时清理（先中断全部会话，并置 dead 阻止在途闭包续跑收件箱） */
  clearTopic(topicId: number): void {
    for (const [id, record] of this.sessions) {
      if (record.topicId !== topicId) continue
      record.dead = true
      record.inbox.length = 0
      record.currentAbort?.abort()
      this.sessions.delete(id)
    }
  }

  private row(record: SessionRecord): SubagentSessionRow {
    return {
      id: record.id,
      name: record.config.name,
      label: record.label,
      status: record.status,
      queuedMessages: record.inbox.length,
      createdAt: record.createdAt,
      lastRunAt: record.lastRunAt
    }
  }

  private broadcast(topicId: number): void {
    this.onChange?.(topicId, this.list(topicId))
  }

  /** 会话运行一次的 runtime 引用缓存（send 唤醒时复用；start 时注入） */
  private runtimes = new WeakMap<SessionRecord, SubagentSessionRuntime>()

  private lastRuntime(record: SessionRecord): SubagentSessionRuntime | undefined {
    return this.runtimes.get(record)
  }

  /**
   * 执行一轮会话运行：以会话历史为前缀 + 新消息，子图流式执行；
   * 输出增量写入同名后台任务（job_output 可读）；结束后结算任务，
   * 若有排队消息继续下一轮（FIFO）。
   */
  private async run(
    record: SessionRecord,
    message: string,
    rt: SubagentSessionRuntime
  ): Promise<void> {
    if (record.status === 'running') {
      // 理论不可达（send 只在 idle 时唤醒）；防御性入队
      record.inbox.unshift(message)
      return
    }
    record.status = 'running'
    record.currentAbort = new AbortController()
    this.runtimes.set(record, rt)
    this.broadcast(record.topicId)

    // 注册同名后台任务（job id = 会话 id；settlement first-wins）
    const job = jobsRegistry.start(record.topicId, 'subagent', record.label, record.id)
    jobsRegistry.attachCancel(record.id, () => record.currentAbort?.abort())
    const abortSignal = record.currentAbort.signal

    let fullText = ''
    try {
      const sa = record.config
      const model = (await rt.resolveModel(sa.model)) ?? rt.mainModel
      const tools = rt.buildTools(sa)
      const systemPrompt = rt.extendSystemPrompt(sa)

      // 路由到任务帧（父模型经 job_output 观察）
      const queueRef = {
        current: {
          push: (rec: RuntimeRecord): void => {
            if (rec.kind === 'text' || rec.kind === 'reasoning') {
              if (rec.text) job.appendOutput(rec.text)
            } else if (rec.kind === 'tool_call') {
              const inputText = JSON.stringify(rec.input ?? {}).slice(0, 200)
              job.appendOutput(`[工具] ${rec.name}（参数：${inputText}）`)
            }
          }
        }
      }
      const graph = buildAgentGraph({
        model,
        tools,
        systemPrompt,
        queue: queueRef,
        spill: rt.spillRef?.current
      })

      // 会话输入：历史 + 本轮消息
      const input = [...record.messages, new HumanMessage(message)]
      const stream = await graph.stream(
        { messages: input },
        {
          streamMode: ['messages'] as const,
          recursionLimit: rt.recursionLimit,
          signal: abortSignal
        }
      )
      for await (const item of stream) {
        if (abortSignal.aborted) break
        const [, payload] = item as readonly [string, [StreamMessageLike, unknown]]
        const chunk = payload[0]
        const chunkType = chunk._getType?.()
        if (chunkType && chunkType !== 'ai') continue
        if (typeof chunk.content === 'string') fullText += chunk.content
      }

      if (abortSignal.aborted) {
        const partial = fullText.trim()
        record.messages.push(new HumanMessage(message))
        if (partial) record.messages.push(new AIMessage({ content: partial }))
        job.settle(
          'killed',
          partial ? `${partial}\n（本轮已被中断）` : '（本轮已被中断）',
          'interrupted'
        )
        return
      }
      const output = fullText.trim() || '（子智能体无文本输出）'
      record.messages.push(new HumanMessage(message))
      record.messages.push(new AIMessage({ content: output }))
      job.settle('completed', output)
    } catch (err) {
      // 中断（interrupt_agent/job_kill）在流式中途会以 AbortError 抛出——结算为 killed
      // 而非 failed（修复：此前落入 failed 分支，英文中止错误文案混进历史且状态语义错误）
      if (abortSignal.aborted) {
        const partial = fullText.trim()
        record.messages.push(new HumanMessage(message))
        if (partial) record.messages.push(new AIMessage({ content: partial }))
        job.settle(
          'killed',
          partial ? `${partial}\n（本轮已被中断）` : '（本轮已被中断）',
          'interrupted'
        )
        return
      }
      const isRecursion =
        err instanceof GraphRecursionError || (err as Error)?.name === 'GraphRecursionError'
      const messageText = isRecursion
        ? '子智能体达到工具调用轮次上限'
        : err instanceof Error
          ? err.message
          : String(err)
      logger.warn(`[SubagentSession] ${record.id} 运行失败:`, err)
      const partial = fullText.trim()
      record.messages.push(new HumanMessage(message))
      if (partial) record.messages.push(new AIMessage({ content: partial }))
      job.settle(
        'failed',
        partial ? `${partial}\n（运行失败：${messageText}）` : `（运行失败：${messageText}）`,
        messageText
      )
    } finally {
      record.lastRunAt = Date.now()
      record.currentAbort = undefined
      record.status = 'idle'
      this.broadcast(record.topicId)

      // 话题已删除（clearTopic 置位 dead）：不再续跑收件箱（修复：此前僵尸会话闭包
      // 仍逐条跑完收件箱，并在已删除话题下注册不可管理的幽灵任务）
      if (!record.dead) {
        // 收件箱非空 → 继续下一轮（FIFO）
        const next = record.inbox.shift()
        if (next) {
          void this.run(record, next, rt)
        }
      }
    }
  }
}

/** 进程级单例 */
export const subagentSessions = new SubagentSessionRegistry()

/** 构建子代理续接控制工具（仅注入主代理；owner 按 topicId 隔离） */
export function buildSubagentControlTools(
  registry: SubagentSessionRegistry,
  topicId: number
): StructuredToolInterface[] {
  return [
    tool(
      async ({ subagent_id, message }) => {
        try {
          const { messageId } = registry.send(subagent_id, topicId, message)
          return JSON.stringify({ messageId })
        } catch (err) {
          return `发送失败: ${(err as Error).message}`
        }
      },
      {
        name: 'send_message',
        description:
          '向一个后台子智能体会话发送下一条消息，让它继续工作（延续同一段对话与上下文）。若该会话当前正在运行，消息会排队在其当前轮结束后自动执行。只返回投递确认（messageId），子代理的回复用 job_output(job_id) 轮询读取。',
        schema: z.object({
          subagent_id: z
            .string()
            .describe('子智能体会话 ID（task 后台模式启动时返回，如 subagent-1）'),
          message: z.string().describe('发送给子智能体的消息内容')
        })
      }
    ),
    tool(
      async ({ agent_id }) => {
        const { accepted } = registry.interrupt(agent_id, topicId)
        return JSON.stringify({ accepted })
      },
      {
        name: 'interrupt_agent',
        description:
          '中断一个后台子智能体会话当前正在运行的一轮（已排队但未开始的消息保留，稍后可 send_message 继续）。会话不存在或已空闲时为无害操作。',
        schema: z.object({
          agent_id: z.string().describe('要中断的子智能体会话 ID')
        })
      }
    ),
    tool(
      async ({ scope }) => {
        void scope
        return JSON.stringify({ agents: registry.list(topicId) })
      },
      {
        name: 'list_agents',
        description:
          '列出当前话题的全部后台子智能体会话及其状态（running=当前轮运行中 / idle=空闲待命）与排队消息数。',
        schema: z.object({
          scope: z
            .enum(['children', 'descendants'])
            .optional()
            .describe('范围（当前实现均为平铺的子智能体列表）')
        })
      }
    )
  ]
}
