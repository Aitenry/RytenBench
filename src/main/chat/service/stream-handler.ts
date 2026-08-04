import { BaseMessage } from '@langchain/core/messages'
import { createDeepAgent } from 'deepagents'
import logger from 'electron-log'
import { ChatOptions, StructuredMessage } from '../types'
import { buildHumanMessage } from './message-builder'
import {
  produceMessages,
  produceToolCalls,
  produceSubAgents,
  type StreamRun
} from './stream-producers'

/** 流式处理所需的 ChatService 依赖（避免循环引用） */
export interface StreamDeps {
  createAgent(): ReturnType<typeof createDeepAgent>

  loadContextMessages(topicId: number): Promise<BaseMessage[]>
}

/**
 * 发送消息并以流式方式返回内容
 * @param deps ChatService 的 agent 和历史加载方法
 * @param message 用户输入
 * @param options 可选配置（含 topicId 用于加载历史）
 * @returns 异步生成器，返回 StructuredMessage
 */
export async function* runStream(
  deps: StreamDeps,
  message: string,
  options?: ChatOptions
): AsyncGenerator<StructuredMessage> {
  logger.info(`options: ${JSON.stringify(options)}`)
  const signal = options?.signal

  try {
    const agent = deps.createAgent()

    const userMessage = buildHumanMessage(message, options?.images, options?.documents)
    const contextMessages = options?.topicId ? await deps.loadContextMessages(options.topicId) : []
    logger.info(
      `[Chat] Passing ${contextMessages.length} context messages + 1 user message to deepagent (topicId=${options?.topicId})`
    )
    if (contextMessages.length > 0) {
      logger.info(`[Chat] Context roles: ${contextMessages.map((m) => m._getType()).join(' → ')}`)
    }
    const run = (await agent.streamEvents(
      { messages: [...contextMessages, userMessage] },
      { version: 'v3', signal }
    )) as StreamRun

    // 使用队列实现消息和工具调用的并发流式输出
    const queue: StructuredMessage[] = []
    let waiting: (() => void) | null = null
    let producersAlive = 3

    const enqueue = (item: StructuredMessage): void => {
      queue.push(item)
      if (waiting) {
        waiting()
        waiting = null
      }
    }

    const markDone = (): void => {
      producersAlive--
      if (waiting) {
        waiting()
        waiting = null
      }
    }

    /** 安全获取 tool call output，捕获 abort 触发的 rejection */
    const safeGetOutput = async (call: { output: unknown }): Promise<unknown> => {
      try {
        return await call.output
      } catch (err) {
        if (signal?.aborted) {
          const abortErr = new Error('Tool call aborted')
          abortErr.name = 'AbortError'
          throw abortErr
        }
        throw err
      }
    }

    // 启动三个生产者
    const msgProducer = produceMessages(run, signal, enqueue, markDone).catch(() => {})
    const toolProducer = produceToolCalls(run, signal, enqueue, markDone, safeGetOutput).catch(
      () => {}
    )
    const subAgentProducer = produceSubAgents(run, signal, enqueue, markDone, safeGetOutput).catch(
      () => {}
    )

    // 主消费者循环：从队列中取出并 yield
    while (producersAlive > 0 || queue.length > 0) {
      if (signal?.aborted) {
        break
      }
      if (queue.length > 0) {
        yield queue.shift()!
      } else if (producersAlive > 0) {
        await new Promise<void>((resolve) => {
          waiting = resolve
        })
      }
    }

    // 等待所有生产者完成（捕获潜在错误）
    await Promise.allSettled([msgProducer, toolProducer, subAgentProducer])
  } catch (error) {
    logger.error('Error in sendMessageStream:', error)
    yield {
      content: `Failed to get response: ${error}`
    }
  }
}
