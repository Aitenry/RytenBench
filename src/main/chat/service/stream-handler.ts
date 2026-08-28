import { BaseMessage } from '@langchain/core/messages'
import logger from 'electron-log'
import { ChatOptions, StructuredMessage } from '../types'
import { Runtime } from '../runtime/runtime'
import { buildHumanMessage } from './message-builder'
import type { UploadedFileRef } from './message-builder'
import { produceMessages, produceToolCalls, produceSubAgents } from './stream-producers'

/** 流式处理所需的 ChatService 依赖（避免循环引用） */
export interface StreamDeps {
  /** 创建运行时（LangChain/LangGraph） */
  createRuntime(): Runtime

  loadContextMessages(topicId: number): Promise<BaseMessage[]>

  /** 将上传文件复制到 agent 工作区，返回虚拟路径引用 */
  copyUploadedFiles(
    docs?: { fileName: string; filePath: string }[]
  ): Promise<UploadedFileRef[] | undefined>
}

/**
 * 发送消息并以流式方式返回内容
 * @param deps ChatService 的运行时和历史加载方法
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
    const runtime = deps.createRuntime()

    // 首个 chunk 下发本轮注入的热记忆内容，前端在 AI 消息顶部显示「注入记忆」
    const injection = runtime.memoryInjection
    if (injection) {
      yield { memoryInjected: injection }
    }

    const uploadedRefs = await deps.copyUploadedFiles(options?.documents)
    const userMessage = buildHumanMessage(message, options?.images, uploadedRefs)
    const contextMessages = options?.topicId ? await deps.loadContextMessages(options.topicId) : []
    logger.info(
      `[Chat] Passing ${contextMessages.length} context messages + 1 user message to runtime (topicId=${options?.topicId})`
    )
    if (contextMessages.length > 0) {
      logger.info(`[Chat] Context roles: ${contextMessages.map((m) => m._getType()).join(' → ')}`)
    }
    const run = runtime.stream(
      [...contextMessages, userMessage],
      signal,
      options?.topicId,
      options?.turnMeta
    )

    // 使用队列实现消息和工具调用的并发流式输出
    const queue: StructuredMessage[] = []
    let waiting: (() => void) | null = null
    let producersAlive = 3
    let emittedCount = 0

    const enqueue = (item: StructuredMessage): void => {
      emittedCount++
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

    // 完全无输出：图执行失败被静默吞掉时向前端透传错误，避免"没有任何内容"
    if (emittedCount === 0 && !signal?.aborted) {
      if (run.error) {
        logger.error('[Chat] 运行时执行失败，无任何输出:', run.error)
        yield { content: `Failed to get response: ${run.error.message}` }
      } else {
        logger.warn('[Chat] 运行时未产生任何输出（无错误信息）')
        yield { content: 'Failed to get response: 模型未返回任何内容，请查看日志或重试。' }
      }
    }
  } catch (error) {
    logger.error('Error in sendMessageStream:', error)
    yield {
      content: `Failed to get response: ${error}`
    }
  }
}
