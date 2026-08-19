import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { GraphRecursionError } from '@langchain/langgraph'
import logger from 'electron-log'
import type { SubAgentRecord } from './types'
import { buildAgentGraph, pushMessageRecords, type QueueRef, type StreamMessageLike } from './agent'
import type { SubAgentConfig } from '../types'

/**
 * 子代理（task 工具）— 替代 deepagents subagents + task 分派
 *
 * 机制：
 * - task 工具 schema 保持 deepagents 兼容（subagent_type / description / prompt）；
 * - 每次调用动态编译子代理子图（独立模型/工具/系统提示词 + 专属记忆）；
 * - causeId 通过 config.configurable.toolCallId 注入（由工具节点写入）；
 * - 子图 token 级事件转发为 sub_* 记录，驱动前端子代理活动块；
 * - 模型按 'provider:model' 解析，失败回退主模型（依赖缺失 = 降级而非报错）。
 */

/** 子代理运行时上下文 */
export interface SubAgentRuntimeContext {
  /** 子代理定义列表 */
  subAgents: SubAgentConfig[]
  /** 主代理模型（回退目标） */
  mainModel: BaseChatModel
  /** 按 'provider:model' 创建模型的回调（由 Runtime 注入） */
  resolveModel: (spec: string | undefined) => Promise<BaseChatModel | undefined>
  workspaceId: number
  /** 业务工具构建（按子代理声明的工具名） */
  buildTools: (subAgent: SubAgentConfig) => StructuredToolInterface[]
  /** 记录队列引用（流式时注入） */
  queue: QueueRef
  /** 子代理图递归上限（由主运行时工程常量推导） */
  recursionLimit: number
}

/** 解析子代理图输入（systemPrompt + 任务消息） */
function buildSubAgentMessages(
  systemPrompt: string,
  prompt: string
): (SystemMessage | HumanMessage)[] {
  return [new SystemMessage(systemPrompt), new HumanMessage(prompt)]
}

/** 子代理执行器：编译子图 → 流式执行 → 转发记录 → 返回最终文本 */
export function createTaskTool(ctx: SubAgentRuntimeContext): StructuredToolInterface {
  const taskSchema = z.object({
    subagent_type: z.string().describe('要委托的子智能体类型名称'),
    description: z.string().optional().describe('任务的简短描述（展示用）'),
    prompt: z.string().describe('要交给子智能体的完整任务指令')
  })

  return tool(
    async ({ subagent_type, description, prompt }, config) => {
      const sa = ctx.subAgents.find((s) => s.name === subagent_type)
      if (!sa) {
        return `子智能体 "${subagent_type}" 不存在。可用子智能体：${ctx.subAgents.map((s) => s.name).join(', ') || '（无）'}`
      }

      const causeId =
        ((config?.configurable as Record<string, unknown> | undefined)?.toolCallId as
          string | undefined) ?? 'unknown'
      const queue = ctx.queue
      const push = (record: SubAgentRecord): void => queue.current?.push(record)

      // sub_start：前端子代理活动块（started 由 toolCalls 流的 task 记录发出，此处供内容流标记）
      push({ kind: 'sub_start', name: sa.name, causeId, description } satisfies SubAgentRecord)

      try {
        // 模型解析（provider:model → 模型；失败回退主模型）
        const model = (await ctx.resolveModel(sa.model)) ?? ctx.mainModel

        // 工具：子代理声明的业务工具
        const tools = ctx.buildTools(sa)
        const systemPrompt = sa.systemPrompt

        // 编译子代理子图（记录经 subagentCtx 包装为 sub_* 记录）
        const graph = buildAgentGraph({
          model,
          tools,
          systemPrompt,
          queue,
          subagentCtx: { name: sa.name, causeId }
        })

        // 流式执行：转发 token / 推理 / 工具块为 sub_* 记录，并累积最终文本。
        // 注意：messages 模式会把工具节点的 ToolMessage 也发出来，累积前必须过滤，
        // 否则子代理最终输出会混入工具结果文本。
        const seenIndexes = new Set<number>()
        let fullText = ''
        try {
          const stream = await graph.stream(
            { messages: buildSubAgentMessages(systemPrompt, prompt) },
            {
              streamMode: ['messages'] as const,
              recursionLimit: ctx.recursionLimit,
              signal: config?.signal
            }
          )
          for await (const item of stream) {
            if (config?.signal?.aborted) break
            // 迭代元素为 [mode, [message, metadata]] 元组
            const [, payload] = item as readonly [string, [StreamMessageLike, unknown]]
            const chunk = payload[0]
            const chunkType = chunk._getType?.()
            if (chunkType && chunkType !== 'ai') continue
            if (typeof chunk.content === 'string') fullText += chunk.content
            pushMessageRecords(chunk, { push: (r) => push(r as SubAgentRecord) }, seenIndexes, {
              name: sa.name,
              causeId
            })
          }

          const output = fullText.trim() || '（子智能体无文本输出）'
          push({ kind: 'sub_end', name: sa.name, causeId, output } satisfies SubAgentRecord)
          return output
        } catch (err) {
          // 工具调用轮次耗尽：返回已生成的部分内容 + 收尾提示（而非「执行失败」）
          const isRecursion =
            err instanceof GraphRecursionError || (err as Error)?.name === 'GraphRecursionError'
          if (isRecursion) {
            logger.warn(`[SubAgent] ${sa.name} 工具调用轮次已达上限，自动停止`)
            const output = fullText.trim()
              ? `${fullText.trim()}\n（子智能体已达到工具调用轮次上限，自动停止）`
              : '（子智能体已达到工具调用轮次上限，未能完成任务）'
            push({ kind: 'sub_end', name: sa.name, causeId, output } satisfies SubAgentRecord)
            return output
          }
          const message = err instanceof Error ? err.message : String(err)
          logger.warn(`[SubAgent] ${sa.name} 执行失败:`, err)
          const output = `子智能体执行失败: ${message}`
          push({ kind: 'sub_end', name: sa.name, causeId, output } satisfies SubAgentRecord)
          return output
        }
      } catch (err) {
        // 模型解析 / 建图等前置步骤失败（流式执行阶段的错误已由内层 catch 处理）
        const message = err instanceof Error ? err.message : String(err)
        logger.warn(`[SubAgent] ${sa.name} 初始化失败:`, err)
        const output = `子智能体执行失败: ${message}`
        push({ kind: 'sub_end', name: sa.name, causeId, output } satisfies SubAgentRecord)
        return output
      }
    },
    {
      name: 'task',
      description:
        '将复杂任务委托给专门的子智能体执行。子智能体拥有独立的系统提示词与工具集，适合需要专注处理的子任务。',
      schema: taskSchema
    }
  )
}
