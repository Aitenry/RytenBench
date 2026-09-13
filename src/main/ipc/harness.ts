import { BrowserWindow, dialog, ipcMain, type IpcMainEvent } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import logger from 'electron-log'
import { isSenderAlive, safeSend } from '../safe-send'
import { mainMessages } from '../i18n'
import { settingsStore, streamAbortControllers, activeHarnessStreams } from '../context'
import { HarnessService, buildTools } from '../harness'
import type {
  ToolCallDetail,
  SubAgentEvent,
  MemoryInjection,
  TurnMeta,
  HistoryCompaction
} from '../harness/types'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { getProviderService } from '../provider/service'
import { getSubAgentDefs } from '../harness/preload-cache'
import { todoStore } from '../harness/runtime/todo'
import { goalStore } from '../harness/runtime/goal'
import { jobsRegistry } from '../harness/runtime/jobs'
import { subagentSessions } from '../harness/runtime/subagent-sessions'
import { questionService } from '../harness/runtime/ask'
import { goalRoundDriver } from '../harness/goal-driver'
import { HarnessSettings } from '../types/settings'
import {
  createTopic,
  addDialogue,
  addDialogueUsage,
  getDialoguesByTopicId
} from '../database/mapper/harness'
import { getActiveWorkspaceId } from '../database/workspace-context'
import { sumUsage, type ModelUsageRecord } from '../harness/runtime/usage'

/** 单轮对话执行参数（用户轮与目标自动轮共用 runHarnessTurn 管线） */
interface RunHarnessTurnParams {
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
 * 写入本轮对话用量（harness_dialogue_usage）。
 *
 * - 只在模型**真的回传了 token 数字**时写：宁可没有行，也不写全 0 的假数据；
 * - token 是整轮累加（工具循环会有多次模型往返），每次调用的原始 usage_metadata
 *   以 JSON 数组存进 usage_metadata 列，保留 reasoning / cached 等各家明细；
 * - 供应商与模型存**快照**：供应商配置之后被删改也不影响这条账目。
 */
async function persistTurnUsage(params: {
  dialogueId: number
  topicId: number
  providerId?: number
  records: ModelUsageRecord[]
}): Promise<void> {
  const { dialogueId, topicId, providerId, records } = params
  if (records.length === 0) return
  const totals = sumUsage(records)
  if (!totals.hasTokens) {
    logger.info('[Harness] 模型未回传 usage_metadata，跳过用量落库')
    return
  }
  try {
    let providerMark: string | null = null
    let configuredModel: string | null = null
    try {
      const config = await getProviderService().getConfig(providerId)
      providerMark = config?.provider ?? null
      configuredModel = config?.model ?? null
    } catch (err) {
      logger.warn('[Harness] 读取供应商配置失败，用量行只记 token:', err)
    }
    await addDialogueUsage({
      workspace_id: getActiveWorkspaceId(),
      topic_id: topicId,
      dialogue_id: dialogueId,
      provider_id: providerId ?? null,
      provider: providerMark,
      // 响应里带的模型名优先（可能被用户临时切过模型），否则用当前配置
      model: records.find((r) => r.model)?.model ?? configuredModel,
      input_tokens: totals.inputTokens,
      output_tokens: totals.outputTokens,
      total_tokens: totals.totalTokens,
      calls: totals.calls,
      usage_metadata: JSON.stringify(
        records.map((r) => ({ model: r.model, subagent: r.subagent ?? false, usage: r.usage }))
      )
    })
    logger.info(
      `[Harness] 用量已落库 dialogue=${dialogueId} in/out/total=${totals.inputTokens}/${totals.outputTokens}/${totals.totalTokens} calls=${totals.calls}`
    )
  } catch (err) {
    logger.error('[Harness] 写入对话用量失败:', err)
  }
}

/**
 * 执行一轮完整对话：建模型 → 建话题 → 存用户消息 → 流式 → 存 AI 回复 → 通知前端。
 * 返回 { topicId, cancelled }（cancelled=true 表示用户点了停止）。
 */
async function runHarnessTurn(
  params: RunHarnessTurnParams
): Promise<{ topicId: number; cancelled: boolean }> {
  const { event, question, options } = params

  // 渲染进程已失效（崩溃/窗口关闭）时跳过本轮：不再创建模型、不保存消息、不向死帧发送
  if (!isSenderAlive(event.sender)) {
    logger.warn(`[Harness] 渲染进程已失效（senderId=${event.sender.id}），跳过本轮对话`)
    return { topicId: options?.topicId ?? 0, cancelled: true }
  }

  // 加载主智能体默认配置（electron-store）
  const mainAgentDefaults = settingsStore.get('mainAgent') as
    { tools?: string[]; skills?: string[] } | undefined
  const tools = buildTools(mainAgentDefaults?.tools ?? [])
  const harnessSettings = settingsStore.get('harness') as HarnessSettings | undefined
  logger.info(`[Harness] Creating model with providerId: ${options?.providerId ?? 'default'}`)

  // 1. 确保话题存在
  let topicId = options?.topicId
  if (!topicId) {
    const title = question.slice(0, 50)
    const workspaceId = harnessSettings?.activeWorkspaceId ?? 0
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
  // 记下返回的行 id：流式结束后随 harness-stream-done 回传，前端删这轮时才找得到用户那一行
  let userDialogueId: number | null = null
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
    userDialogueId = await addDialogue({
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
    logger.error('[Harness] 对话轮次失败:', error)
    safeSend(event.sender, 'harness-stream-error', { error: errMsg, topicId })
    safeSend(event.sender, 'harness-stream-done', { topicId })
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
  // 同时取出该模型的「工具调用轮数」上限，注入本轮运行时护栏
  let contextBudget: number | undefined
  let maxToolRounds: number | undefined
  try {
    const providerConfig = await getProviderService().getConfig(options?.providerId)
    const windowTokens =
      typeof providerConfig.metadata?.context_window === 'number'
        ? providerConfig.metadata.context_window
        : 0
    contextBudget = Math.max(20_000, windowTokens)
    maxToolRounds = providerConfig.max_tool_rounds
    logger.info(
      `[Harness] Model context window=${windowTokens} tokens → history budget=${contextBudget} chars, maxToolRounds=${maxToolRounds}`
    )
  } catch (err) {
    logger.warn('[Harness] 读取模型上下文窗口失败，使用默认历史预算 20000:', err)
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
    logger.warn(`[Harness] 渲染进程已失效（senderId=${event.sender.id}），中止流式输出`)
    abortController.abort()
  }
  event.sender.on('render-process-gone', onSenderGone)
  event.sender.once('destroyed', onSenderGone)

  // 2.5. 历史对话上下文由 HarnessService 内部从数据库加载（超长自动压缩）

  // 2.6. 目标自动续跑轮：流首先下发标记 chunk，前端据此挂载「自动续跑」用户消息 +
  // 助手占位并启动本轮流监听（普通用户轮由前端在发送时自行挂载）
  if (options?.turnMeta?.source === 'goal-round' && options.turnMeta.goalRound != null) {
    safeSend(event.sender, 'harness-stream-chunk', {
      __topicId: topicId,
      goalRound: {
        round: options.turnMeta.goalRound,
        objective: options.turnMeta.objective ?? ''
      }
    })
  }

  // 技能优先级：harnessSettings.enabledSkills > mainAgent.skills
  const effectiveSkills = harnessSettings?.enabledSkills ?? mainAgentDefaults?.skills

  let harnessService: HarnessService
  try {
    harnessService = new HarnessService(
      model,
      tools,
      await getSubAgentDefs(harnessSettings?.activeWorkspaceId ?? 0),
      getDialoguesByTopicId,
      harnessSettings?.skillsPath || undefined,
      effectiveSkills,
      harnessSettings?.workspacePath || undefined,
      harnessSettings?.memoryPath || undefined,
      harnessSettings?.activeWorkspaceId ?? 0,
      maxToolRounds
    )
  } catch (err) {
    // HarnessService 初始化（含子智能体定义加载）失败：清理本轮资源并通知前端，
    // 避免前端停留在「正在生成…」无任何反应
    logger.error('[Harness] HarnessService 初始化失败:', err)
    streamAbortControllers.delete(event.sender.id)
    event.sender.removeListener('render-process-gone', onSenderGone)
    event.sender.removeListener('destroyed', onSenderGone)
    return failTurn(err)
  }
  // 本轮模型真实用量（usage_metadata）：流结束时由 HarnessService 回调进来，助手消息落库后写入用量表
  let usageRecords: ModelUsageRecord[] = []
  const stream = harnessService.sendMessageStream(
    question,
    {
      ...options,
      topicId,
      signal: abortController.signal,
      contextBudget,
      // 摘要压缩开始：立即推送「压缩中」过渡 chunk（不落库，结果由流尾 historyCompacted 携带，
      // 渲染进程收到结果块后原地替换过渡块，形成「压缩中 → 压缩结果」的转变）
      onCompactionStart: () => {
        safeSend(event.sender, 'harness-stream-chunk', {
          historyCompacting: true,
          __topicId: topicId
        })
      },
      // 摘要压缩模型请求自动重试：推送「正在重试（第 N/2 次）」过渡 chunk（不落库），
      // 压缩模型失败与正文模型同款恢复——重试耗尽后经 ModelRecoveryModal 换模型在原位置继续压缩
      onCompactionRetry: (attempt, retries) => {
        safeSend(event.sender, 'harness-stream-chunk', {
          retrying: { attempt, retries },
          __topicId: topicId
        })
      }
    },
    (records) => {
      usageRecords = records
    }
  )
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
        logger.info('[Harness] Stream cancelled by user')
        break
      }
      // 部分输出后流失败：转发错误事件给前端，并标记跳过落库
      if (chunk.streamError) {
        streamFailed = true
        logger.error('[Harness] 流式执行失败（已有部分输出）:', chunk.streamError.message)
        safeSend(event.sender, 'harness-stream-error', {
          error: chunk.streamError.message,
          topicId
        })
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
            // 防御：部分 provider 首个工具块不携带工具名（以占位名 'tool' 登记）——
            // 未按名称匹配到 preparing 块时，并入最近的占位块并改名为真实工具名，
            // 避免「tool · 生成中…」幽灵块与真实工具块并存（与渲染端 applyChunkToMessages 一致）
            if (!merged) {
              for (let i = accumulatedBlocks.length - 1; i >= 0; i--) {
                const b = accumulatedBlocks[i]
                if (b.type === 'tool' && b.tool?.status === 'preparing' && b.tool.name === 'tool') {
                  b.tool.name = chunk.tool.name
                  b.tool.input = chunk.tool.input
                  b.tool.status = 'executing'
                  b.tool.id = b.tool.id ?? chunk.tool.id
                  merged = true
                  break
                }
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
        } else if (sa.status === 'dispatched') {
          // 后台派发轻量事件：块定格在「已派发」（名称+简述+会话 id），无子块/内容
          saBlock.subAgent!.status = 'dispatched'
          saBlock.subAgent!.taskDescription =
            saBlock.subAgent!.taskDescription || sa.taskDescription
          saBlock.subAgent!.subagentId = sa.subagentId ?? saBlock.subAgent!.subagentId
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
              // 防御：占位名 'tool' 兜底（同上方主代理累积块逻辑）
              if (!merged) {
                for (let i = saBlock.children.length - 1; i >= 0; i--) {
                  const c = saBlock.children[i]
                  if (
                    c.type === 'tool' &&
                    c.tool?.status === 'preparing' &&
                    c.tool.name === 'tool'
                  ) {
                    c.tool.name = sa.tool.name
                    c.tool.input = sa.tool.input
                    c.tool.status = 'executing'
                    c.tool.id = c.tool.id ?? sa.tool.id
                    merged = true
                    break
                  }
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
      if (!safeSend(event.sender, 'harness-stream-chunk', { ...chunk, __topicId: topicId })) {
        logger.warn('[Harness] Failed to send stream chunk (renderer disposed)')
        senderDead = true
        abortController.abort()
        break
      }
    }
  } catch (error) {
    if ((error as Error)?.name !== 'AbortError') {
      logger.error('Error in harness stream:', error)
      const errMsg = error instanceof Error ? error.message : String(error)
      safeSend(event.sender, 'harness-stream-error', { error: errMsg, topicId })
      // 流异常中断时不保存不完整的 AI 回复，直接跳到清理
      streamAbortControllers.delete(event.sender.id)
      safeSend(event.sender, 'harness-stream-done', { topicId })
      return { topicId, cancelled: false }
    }
  } finally {
    // 流结束（正常/取消/异常/渲染进程失效）后移除失效跟踪监听
    event.sender.removeListener('render-process-gone', onSenderGone)
    event.sender.removeListener('destroyed', onSenderGone)
  }

  // 4. 保存完整的 AI 回复（流执行失败时跳过：截断的不完整回复不应落库为完整消息）
  //    落库后把新对话行 id 回传前端：流式期间的消息用的是临时 id，只有拿到库里的行 id，
  //    前端才能把用量行（按 dialogue_id 关联）当场贴到这条消息上，不必重新加载会话
  let assistantDialogueId: number | null = null
  if (!streamFailed) {
    try {
      assistantDialogueId = await addDialogue({
        topic_id: topicId,
        role: 'assistant',
        content: fullContent,
        blocks: JSON.stringify(accumulatedBlocks)
      })
      // 真实用量落库（模型没回传 usage_metadata 时直接跳过，不写全 0 的假数据）
      await persistTurnUsage({
        dialogueId: assistantDialogueId,
        topicId,
        providerId: options?.providerId,
        records: usageRecords
      })
    } catch (err) {
      logger.error('Failed to save AI message:', err)
    }
  }

  // 5. 清理并通知渲染进程流式输出已完成
  streamAbortControllers.delete(event.sender.id)
  safeSend(event.sender, 'harness-stream-done', {
    topicId,
    // 本轮两条对话行的库内 id：前端据此把临时 id 换成真 id（删除这一轮、关联用量都要用）
    userDialogueId: userDialogueId ?? undefined,
    assistantDialogueId: assistantDialogueId ?? undefined
  })
  return { topicId, cancelled: abortController.signal.aborted }
}

/** 对话发送 / 流式输出 / 目录选择 / 技能列表 IPC */
export function registerHarnessIpc(): void {
  ipcMain.handle(
    'harness-send-message',
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
      logger.info(`[Harness] Creating model with providerId: ${options?.providerId ?? 'default'}`)
      const model = await getProviderService().createModel(options?.providerId)
      const harnessSettings = settingsStore.get('harness') as HarnessSettings | undefined

      // 技能优先级：harnessSettings.enabledSkills > mainAgent.skills
      const effectiveSkills = harnessSettings?.enabledSkills ?? mainAgentDefaults?.skills

      // 该模型的「工具调用轮数」上限（取不到则用工程默认值，由 HarnessService 兜底）
      let maxToolRounds: number | undefined
      try {
        maxToolRounds = (await getProviderService().getConfig(options?.providerId)).max_tool_rounds
      } catch (err) {
        logger.warn('[Harness] 读取模型工具调用轮数失败，使用默认值:', err)
      }

      const harnessService = new HarnessService(
        model,
        tools,
        await getSubAgentDefs(harnessSettings?.activeWorkspaceId ?? 0),
        getDialoguesByTopicId,
        harnessSettings?.skillsPath || undefined,
        effectiveSkills,
        harnessSettings?.workspacePath || undefined,
        harnessSettings?.memoryPath || undefined,
        harnessSettings?.activeWorkspaceId ?? 0,
        maxToolRounds
      )
      return await harnessService.sendMessage(question, options)
    }
  )

  ipcMain.on(
    'harness-start-stream',
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
      // 每个轮次（含目标驱动器派发的自动轮）都登记进 activeHarnessStreams，
      // 退出时 lifecycle 才能拦截并等待落库（修复：此前只跟踪首轮，自动轮运行中退出会丢回复）
      const trackTurn = (
        p: Promise<{ topicId: number; cancelled: boolean }>
      ): Promise<{ topicId: number; cancelled: boolean }> => {
        activeHarnessStreams.add(p)
        p.finally(() => activeHarnessStreams.delete(p))
        return p
      }
      const streamPromise = trackTurn(runHarnessTurn({ event, question, options }))
        .then(({ topicId, cancelled }) => {
          if (options?.turnMeta?.source !== 'goal-round') {
            if (cancelled) {
              // 用户停止本轮：disarm 目标并跳过自动续跑调度（修复：此前 cancelled 被丢弃，
              // 停止后立即白烧一轮自动轮；目标保持 active，用户要求「继续」时经 resume 重新武装）
              logger.info('[Harness] 本轮被用户取消，目标 disarm，跳过自动续跑调度')
              goalStore.disarm(topicId)
              return
            }
            void goalRoundDriver.maybeDrive(topicId, (p) =>
              trackTurn(
                runHarnessTurn({
                  event,
                  question: p.question,
                  options: { ...options, topicId: p.topicId, turnMeta: p.turnMeta }
                })
              )
            )
          }
        })
        .catch((err) => logger.error('[Harness] 轮次执行异常:', err))
      activeHarnessStreams.add(streamPromise)
      streamPromise.finally(() => activeHarnessStreams.delete(streamPromise))
    }
  )

  // 目标查询（渲染进程加载目标状态）
  ipcMain.handle('harness-goal-get', async (_event, topicId: number) => {
    return await goalStore.load(topicId)
  })

  // 目标变更 → 广播到所有窗口（GoalBar 实时刷新）
  goalStore.onChange = (topicId, goal) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) safeSend(win.webContents, 'harness-goal-updated', { topicId, goal })
    }
  }

  // 后台任务变更 → 广播到所有窗口（任务状态实时刷新）
  jobsRegistry.onChange = (topicId, jobs) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) safeSend(win.webContents, 'harness-jobs-updated', { topicId, jobs })
    }
  }

  // 后台子代理会话变更 → 广播（顶部栏代理列表实时刷新）
  subagentSessions.onChange = (topicId, rows) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) safeSend(win.webContents, 'harness-agents-updated', { topicId, rows })
    }
  }
  ipcMain.handle('harness-agents-list', (_event, topicId: number) => subagentSessions.list(topicId))
  ipcMain.handle('harness-agent-output', (_event, topicId: number, agentId: string) =>
    subagentSessions.readOutput(agentId, topicId)
  )

  // 后台子代理输出推送（弹窗监听后端，替代手动刷新/轮询）：
  // 仅在渲染端 watch 该 agent 时消费 onLiveOutput，并按 500ms 节流（防 token 级 IPC 风暴）
  const agentWatchSet = new Set<string>() // `${topicId}:${agentId}`
  const agentPushTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const agentLastPush = new Map<string, number>()
  const AGENT_OUTPUT_PUSH_MS = 500
  const pushAgentOutput = (topicId: number, agentId: string): void => {
    const output = subagentSessions.readOutput(agentId, topicId)
    if (!output) return
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        safeSend(win.webContents, 'harness-agent-output-updated', { topicId, agentId, output })
      }
    }
  }
  subagentSessions.onLiveOutput = (topicId, agentId) => {
    const key = `${topicId}:${agentId}`
    if (!agentWatchSet.has(key)) return
    const now = Date.now()
    const last = agentLastPush.get(key) ?? 0
    if (now - last >= AGENT_OUTPUT_PUSH_MS) {
      agentLastPush.set(key, now)
      pushAgentOutput(topicId, agentId)
    } else if (!agentPushTimers.has(key)) {
      agentPushTimers.set(
        key,
        setTimeout(() => {
          agentPushTimers.delete(key)
          agentLastPush.set(key, Date.now())
          pushAgentOutput(topicId, agentId)
        }, AGENT_OUTPUT_PUSH_MS)
      )
    }
  }
  ipcMain.on('harness-agent-watch', (_event, topicId: number, agentId: string, watch: boolean) => {
    const key = `${topicId}:${agentId}`
    if (watch) {
      agentWatchSet.add(key)
      pushAgentOutput(topicId, agentId) // 打开弹窗即推一次当前快照
    } else {
      agentWatchSet.delete(key)
      const timer = agentPushTimers.get(key)
      if (timer) clearTimeout(timer)
      agentPushTimers.delete(key)
    }
  })

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
      if (!win.isDestroyed()) safeSend(win.webContents, 'harness-question-asked', payload)
    }
  }
  ipcMain.handle('harness-question-answer', (_event, requestId: string, answers: unknown) => {
    return questionService.answer(
      requestId,
      (answers ?? []) as Array<{ id: string; selected: string[]; custom?: string }>
    )
  })
  ipcMain.handle('harness-question-get', (_event, topicId: number) => {
    return questionService.getPending(topicId)
  })

  // 取消流式输出（同时中止挂起的提问）
  ipcMain.on('harness-cancel-stream', (event) => {
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
      if (!win.isDestroyed()) safeSend(win.webContents, 'harness-todos-updated', { topicId, todos })
    }
  }

  // 读取当前话题的计划清单：卡片每次重新挂载（切页 / 切话题）都要主动拉一次，
  // 只靠写入选 broadcast 的话，切走再回来卡片会一直是空的直到模型下次写清单
  ipcMain.handle('harness-todos-get', async (_event, topicId: number) => todoStore.get(topicId))

  // 选择记忆（Memory）存储目录
  ipcMain.handle('harness-select-memory-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: mainMessages().dialog.selectMemoryDir
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 选择技能（Skills）存储目录
  ipcMain.handle('harness-select-skills-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: mainMessages().dialog.selectSkillsDir
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 选择 AI 工作区目录（FilesystemBackend 挂载根目录）
  ipcMain.handle('harness-select-workspace', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: mainMessages().dialog.selectWorkspaceDir
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 列出技能目录中的所有技能
  ipcMain.handle('harness-list-skills', async () => {
    try {
      const settings = settingsStore.store
      const skillsPath = (settings.harness as HarnessSettings)?.skillsPath
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
