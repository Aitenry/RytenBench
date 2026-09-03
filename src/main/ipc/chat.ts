import { BrowserWindow, dialog, ipcMain, type IpcMainEvent } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import logger from 'electron-log'
import { isSenderAlive, safeSend } from '../safe-send'
import { settingsStore, streamAbortControllers, activeChatStreams } from '../context'
import { ChatService, buildTools } from '../chat'
import type {
  ToolCallDetail,
  SubAgentEvent,
  MemoryInjection,
  TurnMeta,
  HistoryCompaction
} from '../chat/types'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { getProviderService } from '../provider/service'
import { getSubAgentDefs } from '../chat/preload-cache'
import { todoStore } from '../chat/runtime/todo'
import { goalStore } from '../chat/runtime/goal'
import { jobsRegistry } from '../chat/runtime/jobs'
import { questionService } from '../chat/runtime/ask'
import { goalRoundDriver } from '../chat/goal-driver'
import { ChatSettings } from '../types/settings'
import { createTopic, addDialogue, getDialoguesByTopicId } from '../database/mapper/chat'

/** 单轮对话执行参数（用户轮与目标自动轮共用 runChatTurn 管线） */
interface RunChatTurnParams {
  event: IpcMainEvent
  question: string
  options?: {
    topicId?: number
    providerId?: number
    images?: string[]
    documents?: { fileName: string; filePath: string }[]
    turnMeta?: TurnMeta
  }
}

/**
 * 执行一轮完整对话：建模型 → 建话题 → 存用户消息 → 流式 → 存 AI 回复 → 通知前端。
 * 返回 { topicId, cancelled }（cancelled=true 表示用户点了停止）。
 */
async function runChatTurn(
  params: RunChatTurnParams
): Promise<{ topicId: number; cancelled: boolean }> {
  const { event, question, options } = params

  // 渲染进程已失效（崩溃/窗口关闭）时跳过本轮：不再创建模型、不保存消息、不向死帧发送
  if (!isSenderAlive(event.sender)) {
    logger.warn(`[Chat] 渲染进程已失效（senderId=${event.sender.id}），跳过本轮对话`)
    return { topicId: options?.topicId ?? 0, cancelled: true }
  }

  // 加载主智能体默认配置（electron-store）
  const mainAgentDefaults = settingsStore.get('mainAgent') as
    { tools?: string[]; skills?: string[] } | undefined
  const tools = buildTools(mainAgentDefaults?.tools ?? [])
  const chatSettings = settingsStore.get('chat') as ChatSettings | undefined
  logger.info(`[Chat] Creating model with providerId: ${options?.providerId ?? 'default'}`)

  // 1. 确保话题存在
  let topicId = options?.topicId
  if (!topicId) {
    const title = question.slice(0, 50)
    const workspaceId = chatSettings?.activeWorkspaceId ?? 0
    try {
      topicId = await createTopic(
        workspaceId,
        title,
        undefined,
        mainAgentDefaults?.tools?.length ? JSON.stringify(mainAgentDefaults.tools) : undefined
      )
    } catch (err) {
      logger.error('Failed to create topic:', err)
      topicId = 0
    }
  }

  // 2. 保存用户消息（含图片、文档与目标自动续跑标记）。
  // 提前到模型创建之前（修复：模型创建失败时直接 return,用户消息不落库,重载后丢失）
  try {
    const userBlocks: { type: string; image_url?: string; fileName?: string; round?: number }[] = []
    if (options?.images?.length) {
      for (const img of options.images) {
        userBlocks.push({ type: 'image', image_url: img })
      }
    }
    if (options?.documents?.length) {
      for (const doc of options.documents) {
        userBlocks.push({ type: 'document', fileName: doc.fileName })
      }
    }
    if (options?.turnMeta?.source === 'goal-round') {
      userBlocks.push({ type: 'goalRound', round: options.turnMeta.goalRound })
    }
    await addDialogue({
      topic_id: topicId,
      role: 'user',
      content: question,
      blocks: JSON.stringify(userBlocks)
    })
  } catch (err) {
    logger.error('Failed to save user message:', err)
  }

  // 对话轮次失败统一收尾：通知前端错误并复位加载态（保证任何阶段失败前端都能停止反应）
  const failTurn = (error: unknown): { topicId: number; cancelled: boolean } => {
    const errMsg = error instanceof Error ? error.message : String(error)
    logger.error('[Chat] 对话轮次失败:', error)
    safeSend(event.sender, 'chat-stream-error', { error: errMsg, topicId })
    safeSend(event.sender, 'chat-stream-done', { topicId })
    return { topicId, cancelled: false }
  }

  // 模型创建可能因供应商不存在、被禁用、模型名称为空等原因失败，需要捕获并通知前端
  let model: BaseChatModel
  try {
    model = await getProviderService().createModel(options?.providerId)
  } catch (modelErr) {
    return failTurn(modelErr)
  }

  // 按模型上下文窗口换算历史上下文字符预算（默认 20,000 token；1 token ≈ 1 字符的保守换算）
  let contextBudget: number | undefined
  try {
    const providerConfig = await getProviderService().getConfig(options?.providerId)
    const windowTokens =
      typeof providerConfig.metadata?.context_window === 'number'
        ? providerConfig.metadata.context_window
        : 0
    contextBudget = Math.max(20_000, windowTokens)
    logger.info(
      `[Chat] Model context window=${windowTokens} tokens → history budget=${contextBudget} chars`
    )
  } catch (err) {
    logger.warn('[Chat] 读取模型上下文窗口失败，使用默认历史预算 20000:', err)
  }

  // 创建 AbortController 用于取消流式输出
  const abortController = new AbortController()
  streamAbortControllers.set(event.sender.id, abortController)

  // 渲染进程失效跟踪：崩溃/窗口关闭时「渲染帧」先于「WebContents 对象」销毁，
  // 此时 send 不抛异常（Electron 内部静默打印 "Error sending from webFrameMain ..."），
  // isDestroyed() 也为 false——必须靠 render-process-gone / destroyed 事件主动中止流，
  // 否则流式循环会持续向死帧发送 chunk，错误刷屏且白烧 token。
  let senderDead = false
  const onSenderGone = (): void => {
    if (senderDead) return
    senderDead = true
    logger.warn(`[Chat] 渲染进程已失效（senderId=${event.sender.id}），中止流式输出`)
    abortController.abort()
  }
  event.sender.on('render-process-gone', onSenderGone)
  event.sender.once('destroyed', onSenderGone)

  // 2.5. 历史对话上下文由 ChatService 内部从数据库加载（超长自动压缩）

  // 2.6. 目标自动续跑轮：流首先下发标记 chunk，前端据此挂载「自动续跑」用户消息 +
  // 助手占位并启动本轮流监听（普通用户轮由前端在发送时自行挂载）
  if (options?.turnMeta?.source === 'goal-round' && options.turnMeta.goalRound != null) {
    safeSend(event.sender, 'chat-stream-chunk', {
      __topicId: topicId,
      goalRound: {
        round: options.turnMeta.goalRound,
        objective: options.turnMeta.objective ?? ''
      }
    })
  }

  // 技能优先级：chatSettings.enabledSkills > mainAgent.skills
  const effectiveSkills = chatSettings?.enabledSkills ?? mainAgentDefaults?.skills

  let chatService: ChatService
  try {
    chatService = new ChatService(
      model,
      tools,
      await getSubAgentDefs(chatSettings?.activeWorkspaceId ?? 0),
      getDialoguesByTopicId,
      chatSettings?.skillsPath || undefined,
      effectiveSkills,
      chatSettings?.workspacePath || undefined,
      chatSettings?.memoryPath || undefined,
      chatSettings?.activeWorkspaceId ?? 0
    )
  } catch (err) {
    // ChatService 初始化（含子智能体定义加载）失败：清理本轮资源并通知前端，
    // 避免前端停留在「正在生成…」无任何反应
    logger.error('[Chat] ChatService 初始化失败:', err)
    streamAbortControllers.delete(event.sender.id)
    event.sender.removeListener('render-process-gone', onSenderGone)
    event.sender.removeListener('destroyed', onSenderGone)
    return failTurn(err)
  }
  const stream = chatService.sendMessageStream(question, {
    ...options,
    topicId,
    signal: abortController.signal,
    contextBudget,
    // 摘要压缩开始：立即推送「压缩中」过渡 chunk（不落库，结果由流尾 historyCompacted 携带，
    // 渲染进程收到结果块后原地替换过渡块，形成「压缩中 → 压缩结果」的转变）
    onCompactionStart: () => {
      safeSend(event.sender, 'chat-stream-chunk', { historyCompacting: true, __topicId: topicId })
    },
    // 摘要压缩模型请求自动重试：推送「正在重试（第 N/2 次）」过渡 chunk（不落库），
    // 压缩模型失败与正文模型同款恢复——重试耗尽后经 ModelRecoveryModal 换模型在原位置继续压缩
    onCompactionRetry: (attempt, retries) => {
      safeSend(event.sender, 'chat-stream-chunk', {
        retrying: { attempt, retries },
        __topicId: topicId
      })
    }
  })
  const accumulatedBlocks: {
    type: string
    text?: string
    tool?: ToolCallDetail
    reasoning?: string
    subAgent?: SubAgentEvent
    /** 本轮注入的热记忆（memoryInjected 类型；随 blocks 持久化，历史对话可恢复显示） */
    memory?: MemoryInjection
    /** 本轮早期对话摘要压缩（historyCompacted 类型；随 blocks 持久化） */
    compaction?: HistoryCompaction
    children?: {
      type: string
      text?: string
      tool?: ToolCallDetail
      reasoning?: string
    }[]
  }[] = []
  let fullContent = ''
  let lastReasoning = ''
  /** 流式执行失败（部分输出后图执行失败）：跳过把残缺回复落库 */
  let streamFailed = false

  try {
    for await (const chunk of stream) {
      // 渲染进程失效（崩溃/窗口关闭）时立即中止，不再向死帧发送 chunk
      if (!isSenderAlive(event.sender)) {
        senderDead = true
        abortController.abort()
        break
      }
      if (abortController.signal.aborted) {
        logger.info('[Chat] Stream cancelled by user')
        break
      }
      // 部分输出后流失败：转发错误事件给前端，并标记跳过落库
      if (chunk.streamError) {
        streamFailed = true
        logger.error('[Chat] 流式执行失败（已有部分输出）:', chunk.streamError.message)
        safeSend(event.sender, 'chat-stream-error', { error: chunk.streamError.message, topicId })
      }
      // 本轮热记忆注入：置于消息块最顶部（首个 chunk 到达，仅累积一次，随 blocks 持久化）
      if (chunk.memoryInjected) {
        const exists = accumulatedBlocks.some((b) => b.type === 'memoryInjected')
        if (!exists) {
          accumulatedBlocks.unshift({
            type: 'memoryInjected',
            memory: chunk.memoryInjected
          })
        }
      }
      // 本轮早期对话摘要压缩：紧随注入记忆块（正文流开始前到达，仅累积一次）
      if (chunk.historyCompacted) {
        const exists = accumulatedBlocks.some((b) => b.type === 'historyCompacted')
        if (!exists) {
          accumulatedBlocks.push({
            type: 'historyCompacted',
            compaction: chunk.historyCompacted
          })
        }
      }
      if (chunk.reasoning_content) {
        const rc = String(chunk.reasoning_content)
        // 兼容 provider 可能下发完整文本而非增量：新内容是已有内容的前缀时仅取新增后缀。
        // 不再做 endsWith 去重（修复）：主进程增量已按形态去重，此处收到的是真实增量，
        // 「增量恰好等于已累积尾部」往往是模型真实重复输出，误判会丢真实内容，
        // 且落库结果与渲染端显示不一致。
        if (lastReasoning && rc.startsWith(lastReasoning) && rc.length > lastReasoning.length) {
          const delta = rc.slice(lastReasoning.length)
          const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
          if (lastBlock && lastBlock.type === 'reasoning') {
            lastBlock.reasoning = (lastBlock.reasoning || '') + delta
          } else {
            accumulatedBlocks.push({ type: 'reasoning', reasoning: delta })
          }
          lastReasoning = rc
        } else {
          lastReasoning += rc
          const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
          if (lastBlock && lastBlock.type === 'reasoning') {
            lastBlock.reasoning = (lastBlock.reasoning || '') + rc
          } else {
            accumulatedBlocks.push({ type: 'reasoning', reasoning: rc })
          }
        }
      }
      if (chunk.content) {
        const c = String(chunk.content)
        // 同 reasoning 分支：只做 startsWith 后缀切片（完整形态防御），不做 endsWith 去重；
        // 累积形态下新建文本块时同样只存增量，避免与渲染端（存后缀）出现双重计数
        if (fullContent && c.startsWith(fullContent) && c.length > fullContent.length) {
          const delta = c.slice(fullContent.length)
          fullContent = c
          const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
          if (lastBlock && lastBlock.type === 'text') {
            lastBlock.text = (lastBlock.text || '') + delta
          } else {
            accumulatedBlocks.push({ type: 'text', text: delta })
          }
        } else {
          fullContent += c
          const lastBlock = accumulatedBlocks[accumulatedBlocks.length - 1]
          if (lastBlock && lastBlock.type === 'text') {
            lastBlock.text = (lastBlock.text || '') + c
          } else {
            accumulatedBlocks.push({ type: 'text', text: c })
          }
        }
      }
      if (chunk.tool) {
        if (chunk.tool.name === 'task') {
          // task 工具已由 service.ts 转换为 subAgent 事件下发，此处跳过
        } else {
          // 优先按 callId 精确匹配同一次调用；preparing 阶段没有 id 时按名称回退；
          // ID 来自不同来源可能不一致，同名未完成时也按名称回退
          const matchesTool = (t: ToolCallDetail): boolean => {
            if (chunk.tool!.id) {
              if (t.id === chunk.tool!.id) return true
              if (!t.id && t.status === 'preparing' && t.name === chunk.tool!.name) return true
              if (t.id && t.status && t.status !== 'completed' && t.name === chunk.tool!.name)
                return true
              return false
            }
            return t.name === chunk.tool!.name || t.name === ''
          }
          if (chunk.tool.status === 'completed') {
            // 匹配同一次调用的未完成工具块并更新
            for (let i = accumulatedBlocks.length - 1; i >= 0; i--) {
              const b = accumulatedBlocks[i]
              if (
                b.type === 'tool' &&
                b.tool &&
                b.tool.status !== 'completed' &&
                matchesTool(b.tool)
              ) {
                b.tool.output = chunk.tool.output
                b.tool.status = chunk.tool.status
                b.tool.card = chunk.tool.card
                break
              }
            }
          } else if (chunk.tool.status === 'preparing') {
            // 模型开始构建工具参数；后续进度 chunk 仅用于保活，已存在则跳过。
            // 若同一次调用已处于 executing/completed（事件乱序），也跳过，避免重复块。
            const exists = accumulatedBlocks.some(
              (b) => b.type === 'tool' && matchesTool(b.tool as ToolCallDetail)
            )
            if (!exists) {
              accumulatedBlocks.push({
                type: 'tool',
                tool: {
                  name: chunk.tool.name,
                  input: {},
                  output: '',
                  status: 'preparing',
                  id: chunk.tool.id
                }
              })
            }
          } else {
            // executing：优先合并到同一次调用的 preparing 块
            let merged = false
            for (let i = accumulatedBlocks.length - 1; i >= 0; i--) {
              const b = accumulatedBlocks[i]
              if (b.type === 'tool' && b.tool?.status === 'preparing' && matchesTool(b.tool)) {
                b.tool.name = chunk.tool.name
                b.tool.input = chunk.tool.input
                b.tool.status = 'executing'
                b.tool.id = b.tool.id ?? chunk.tool.id
                merged = true
                break
              }
            }
            if (!merged) {
              accumulatedBlocks.push({
                type: 'tool',
                tool: {
                  name: chunk.tool.name,
                  input: chunk.tool.input,
                  output: chunk.tool.output,
                  status: 'executing',
                  id: chunk.tool.id
                }
              })
            }
          }
        }
      }
      if (chunk.subAgent) {
        const sa = chunk.subAgent

        // 注意：不把子智能体输出拼入 fullContent（主消息 content）。
        // 子智能体详情已持久化在 blocks 的 subAgent 块（含 children），
        // 历史重载按 blocks 渲染即可；若再拼入 content，会导致：
        // ① 复制消息/上下文注入时子智能体全文重复出现在主智能体发言中；
        // ② 主模型下一轮看到重复文本，进一步放大复述行为。
        // 子智能体块匹配逻辑见下：

        // 匹配智能体累积块：优先 causeId，回退 name
        const matchesSa = (b: (typeof accumulatedBlocks)[number]): boolean => {
          if (b.type !== 'subAgent' || !b.subAgent) return false
          if (sa.causeId && b.subAgent.causeId) return b.subAgent.causeId === sa.causeId
          return b.subAgent.name === sa.name
        }

        // 查找或创建同名智能体累积块
        let saBlock = accumulatedBlocks.find(matchesSa)
        if (!saBlock) {
          saBlock = {
            type: 'subAgent',
            subAgent: {
              name: sa.name,
              causeId: sa.causeId,
              status: sa.status,
              taskDescription: sa.taskDescription
            },
            children: []
          }
          accumulatedBlocks.push(saBlock)
        }

        if (sa.status === 'started') {
          saBlock.subAgent!.status = sa.status
          saBlock.subAgent!.taskDescription =
            saBlock.subAgent!.taskDescription || sa.taskDescription
        } else if (sa.status === 'completed' || sa.status === 'error') {
          saBlock.subAgent!.status = sa.status
          saBlock.subAgent!.output = sa.output
          saBlock.subAgent!.error = sa.error
        } else if (sa.content || sa.reasoning_content || sa.tool) {
          if (saBlock.subAgent!.status !== 'completed' && saBlock.subAgent!.status !== 'error') {
            saBlock.subAgent!.status = 'running'
          }
          if (!saBlock.children) saBlock.children = []

          if (sa.reasoning_content) {
            const lastChild = saBlock.children[saBlock.children.length - 1]
            if (lastChild && lastChild.type === 'reasoning') {
              lastChild.reasoning = (lastChild.reasoning || '') + sa.reasoning_content
            } else {
              saBlock.children.push({ type: 'reasoning', reasoning: sa.reasoning_content })
            }
          }

          if (sa.content) {
            const lastChild = saBlock.children[saBlock.children.length - 1]
            if (lastChild && lastChild.type === 'text') {
              lastChild.text = (lastChild.text || '') + sa.content
            } else {
              saBlock.children.push({ type: 'text', text: sa.content })
            }
          }

          if (sa.tool) {
            // 优先按 callId 精确匹配同一次调用；preparing 阶段没有 id 时按名称回退；
            // ID 来自不同来源可能不一致，同名未完成时也按名称回退
            const matchesTool = (t: ToolCallDetail): boolean => {
              if (sa.tool!.id) {
                if (t.id === sa.tool!.id) return true
                if (!t.id && t.status === 'preparing' && t.name === sa.tool!.name) return true
                if (t.id && t.status && t.status !== 'completed' && t.name === sa.tool!.name)
                  return true
                return false
              }
              return t.name === sa.tool!.name || t.name === ''
            }
            if (sa.tool.status === 'completed') {
              for (let i = saBlock.children.length - 1; i >= 0; i--) {
                const c = saBlock.children[i]
                if (
                  c.type === 'tool' &&
                  c.tool &&
                  c.tool.status !== 'completed' &&
                  matchesTool(c.tool)
                ) {
                  c.tool.output = sa.tool.output
                  c.tool.status = 'completed'
                  c.tool.card = sa.tool.card
                  break
                }
              }
            } else if (sa.tool.status === 'preparing') {
              const exists = saBlock.children.some(
                (c) => c.type === 'tool' && c.tool?.status === 'preparing' && matchesTool(c.tool)
              )
              if (!exists) {
                saBlock.children.push({
                  type: 'tool',
                  tool: {
                    name: sa.tool.name,
                    input: {},
                    output: '',
                    status: 'preparing',
                    id: sa.tool.id
                  }
                })
              }
            } else {
              let merged = false
              for (let i = saBlock.children.length - 1; i >= 0; i--) {
                const c = saBlock.children[i]
                if (c.type === 'tool' && c.tool?.status === 'preparing' && matchesTool(c.tool)) {
                  c.tool.name = sa.tool.name
                  c.tool.input = sa.tool.input
                  c.tool.status = 'executing'
                  c.tool.id = c.tool.id ?? sa.tool.id
                  merged = true
                  break
                }
              }
              if (!merged) {
                saBlock.children.push({
                  type: 'tool',
                  tool: {
                    name: sa.tool.name,
                    input: sa.tool.input,
                    output: sa.tool.output || '',
                    status: 'executing',
                    id: sa.tool.id
                  }
                })
              }
            }
          }
        }
      }
      // 发送失败（渲染帧已失效）时中止流，避免持续向死帧发送。
      // 统一走 safeSend（修复：裸 send 在帧失效窗口期不抛异常、try/catch 是死代码，
      // 且违反项目「主进程推送统一走 safeSend」约定）
      if (!safeSend(event.sender, 'chat-stream-chunk', { ...chunk, __topicId: topicId })) {
        logger.warn('[Chat] Failed to send stream chunk (renderer disposed)')
        senderDead = true
        abortController.abort()
        break
      }
    }
  } catch (error) {
    if ((error as Error)?.name !== 'AbortError') {
      logger.error('Error in chat stream:', error)
      const errMsg = error instanceof Error ? error.message : String(error)
      safeSend(event.sender, 'chat-stream-error', { error: errMsg, topicId })
      // 流异常中断时不保存不完整的 AI 回复，直接跳到清理
      streamAbortControllers.delete(event.sender.id)
      safeSend(event.sender, 'chat-stream-done', { topicId })
      return { topicId, cancelled: false }
    }
  } finally {
    // 流结束（正常/取消/异常/渲染进程失效）后移除失效跟踪监听
    event.sender.removeListener('render-process-gone', onSenderGone)
    event.sender.removeListener('destroyed', onSenderGone)
  }

  // 4. 保存完整的 AI 回复（流执行失败时跳过：截断的不完整回复不应落库为完整消息）
  if (!streamFailed) {
    try {
      await addDialogue({
        topic_id: topicId,
        role: 'assistant',
        content: fullContent,
        blocks: JSON.stringify(accumulatedBlocks)
      })
    } catch (err) {
      logger.error('Failed to save AI message:', err)
    }
  }

  // 5. 清理并通知渲染进程流式输出已完成
  streamAbortControllers.delete(event.sender.id)
  safeSend(event.sender, 'chat-stream-done', { topicId })
  return { topicId, cancelled: abortController.signal.aborted }
}

/** 对话发送 / 流式输出 / 目录选择 / 技能列表 IPC */
export function registerChatIpc(): void {
  ipcMain.handle(
    'chat-send-message',
    async (
      _event,
      question: string,
      options?: {
        providerId?: number
        images?: string[]
        documents?: { fileName: string; filePath: string }[]
      }
    ) => {
      // 加载主智能体默认配置（electron-store）
      const mainAgentDefaults = settingsStore.get('mainAgent') as
        { tools?: string[]; skills?: string[] } | undefined
      const tools = buildTools(mainAgentDefaults?.tools ?? [])
      logger.info(`[Chat] Creating model with providerId: ${options?.providerId ?? 'default'}`)
      const model = await getProviderService().createModel(options?.providerId)
      const chatSettings = settingsStore.get('chat') as ChatSettings | undefined

      // 技能优先级：chatSettings.enabledSkills > mainAgent.skills
      const effectiveSkills = chatSettings?.enabledSkills ?? mainAgentDefaults?.skills

      const chatService = new ChatService(
        model,
        tools,
        await getSubAgentDefs(chatSettings?.activeWorkspaceId ?? 0),
        getDialoguesByTopicId,
        chatSettings?.skillsPath || undefined,
        effectiveSkills,
        chatSettings?.workspacePath || undefined,
        chatSettings?.memoryPath || undefined,
        chatSettings?.activeWorkspaceId ?? 0
      )
      return await chatService.sendMessage(question, options)
    }
  )

  ipcMain.on(
    'chat-start-stream',
    (
      event,
      question: string,
      options?: {
        topicId?: number
        providerId?: number
        images?: string[]
        documents?: { fileName: string; filePath: string }[]
        turnMeta?: TurnMeta
      }
    ) => {
      // 跟踪进行中的流：应用退出时统一中止并等待数据保存完成。
      // 用户轮次完成后触发目标轮次驱动器（自动续跑轮由驱动器内部递归调度）
      // 每个轮次（含目标驱动器派发的自动轮）都登记进 activeChatStreams，
      // 退出时 lifecycle 才能拦截并等待落库（修复：此前只跟踪首轮，自动轮运行中退出会丢回复）
      const trackTurn = (
        p: Promise<{ topicId: number; cancelled: boolean }>
      ): Promise<{ topicId: number; cancelled: boolean }> => {
        activeChatStreams.add(p)
        p.finally(() => activeChatStreams.delete(p))
        return p
      }
      const streamPromise = trackTurn(runChatTurn({ event, question, options }))
        .then(({ topicId, cancelled }) => {
          if (options?.turnMeta?.source !== 'goal-round') {
            if (cancelled) {
              // 用户停止本轮：disarm 目标并跳过自动续跑调度（修复：此前 cancelled 被丢弃，
              // 停止后立即白烧一轮自动轮；目标保持 active，用户要求「继续」时经 resume 重新武装）
              logger.info('[Chat] 本轮被用户取消，目标 disarm，跳过自动续跑调度')
              goalStore.disarm(topicId)
              return
            }
            void goalRoundDriver.maybeDrive(topicId, (p) =>
              trackTurn(
                runChatTurn({
                  event,
                  question: p.question,
                  options: { ...options, topicId: p.topicId, turnMeta: p.turnMeta }
                })
              )
            )
          }
        })
        .catch((err) => logger.error('[Chat] 轮次执行异常:', err))
      activeChatStreams.add(streamPromise)
      streamPromise.finally(() => activeChatStreams.delete(streamPromise))
    }
  )

  // 目标查询（渲染进程加载目标状态）
  ipcMain.handle('chat-goal-get', async (_event, topicId: number) => {
    return await goalStore.load(topicId)
  })

  // 目标变更 → 广播到所有窗口（GoalBar 实时刷新）
  goalStore.onChange = (topicId, goal) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) safeSend(win.webContents, 'chat-goal-updated', { topicId, goal })
    }
  }

  // 后台任务变更 → 广播到所有窗口（任务状态实时刷新）
  jobsRegistry.onChange = (topicId, jobs) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) safeSend(win.webContents, 'chat-jobs-updated', { topicId, jobs })
    }
  }

  // 提问系统：新提问 → 广播到所有窗口（前端弹窗）；回答/查询走 handle
  questionService.onAsk = (pending) => {
    // 只发送可序列化视图（topicId/requestId/questions 均为纯 JSON），
    // 严禁把含 resolve/reject/signal 的记录直接送过 IPC（Electron 会抛序列化错误）
    const payload = {
      topicId: pending.topicId,
      requestId: pending.requestId,
      questions: pending.questions
    }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) safeSend(win.webContents, 'chat-question-asked', payload)
    }
  }
  ipcMain.handle('chat-question-answer', (_event, requestId: string, answers: unknown) => {
    return questionService.answer(
      requestId,
      (answers ?? []) as Array<{ id: string; selected: string[]; custom?: string }>
    )
  })
  ipcMain.handle('chat-question-get', (_event, topicId: number) => {
    return questionService.getPending(topicId)
  })

  // 取消流式输出（同时中止挂起的提问）
  ipcMain.on('chat-cancel-stream', (event) => {
    const controller = streamAbortControllers.get(event.sender.id)
    if (controller) {
      controller.abort()
      streamAbortControllers.delete(event.sender.id)
    }
    questionService.abortAll()
  })

  // 对话计划清单（write_todos）变更 → 广播到渲染进程（输入框上方的进行中任务卡片）
  todoStore.onChange = (topicId, todos) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) safeSend(win.webContents, 'chat-todos-updated', { topicId, todos })
    }
  }

  // 选择记忆（Memory）存储目录
  ipcMain.handle('chat-select-memory-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择记忆存储目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 选择技能（Skills）存储目录
  ipcMain.handle('chat-select-skills-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择技能存储目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 选择 AI 工作区目录（FilesystemBackend 挂载根目录）
  ipcMain.handle('chat-select-workspace', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: '选择 AI 工作区目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 列出技能目录中的所有技能
  ipcMain.handle('chat-list-skills', async () => {
    try {
      const settings = settingsStore.store
      const skillsPath = (settings.chat as ChatSettings)?.skillsPath
      if (!skillsPath) return []

      const entries = fs.readdirSync(skillsPath, { withFileTypes: true })
      const skills: { id: string; name: string; description: string }[] = []

      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const skillMdPath = join(skillsPath, entry.name, 'SKILL.md')
        try {
          fs.accessSync(skillMdPath, fs.constants.R_OK)
          const content = fs.readFileSync(skillMdPath, 'utf-8')
          const fm = content.match(/^---\s*\n([\s\S]*?)\n---/)
          let name = entry.name
          let description = ''
          if (fm) {
            const n = fm[1].match(/^name:\s*(.+)$/m)
            const d = fm[1].match(/^description:\s*(.+)$/m)
            if (n) name = n[1].trim()
            if (d) description = d[1].trim()
          }
          skills.push({ id: entry.name, name, description })
        } catch {
          // 目录中没有 SKILL.md，跳过
        }
      }
      return skills
    } catch (error) {
      logger.error('Error listing skills:', error)
      return []
    }
  })
}
