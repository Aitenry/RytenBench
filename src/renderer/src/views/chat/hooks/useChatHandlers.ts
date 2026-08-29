import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import type { ChatTopicRow } from '../../../../../main/database/mapper/chat'
import { LlmProviderConfig } from '../../../../../main/database/mapper/provider'
import { Window, ToolInfo } from '../../../../resource/types/window'
import type { Message, Attachment, ToolCall, MessageBlock } from '@renderer/types/chat'
import type { StreamChunk } from '../../../../../main/chat/types'
import { useTypewriter, useCyclingTypewriter } from './useTypewriter'
import { isSameToolCall, computeTextDelta, pushBlock } from '../utils/chatHelpers'
import {
  getProviderDisplayName,
  isEmbeddingProvider,
  supportsCapability
} from '@renderer/utils/providerMeta'

const TOPICS_PAGE_SIZE = 20
const MESSAGES_PAGE_SIZE = 20 // 10对消息

const INPUT_HISTORY_STORAGE_KEY = 'rytenbench.chat.inputHistory'
const INPUT_HISTORY_MAX = 100
/** 全局输入历史缓存（localStorage 持久化，模块级单例，避免每次渲染解析存储） */
let inputHistoryCache: string[] | null = null
const loadInputHistory = (): string[] => {
  if (inputHistoryCache) return inputHistoryCache
  try {
    const raw = localStorage.getItem(INPUT_HISTORY_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    inputHistoryCache = Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string').slice(-INPUT_HISTORY_MAX)
      : []
  } catch {
    inputHistoryCache = []
  }
  return inputHistoryCache
}

/** 每个话题的会话缓存状态 */
interface SessionState {
  messages: Message[]
  inputValue: string
  attachments: Attachment[]
  sessionId: string | null
}

export interface UseChatHandlersReturn {
  messages: Message[]
  inputValue: string
  setInputValue: React.Dispatch<React.SetStateAction<string>>
  availableTools: ToolInfo[]
  copiedId: string | null
  currentTopicId: number | null
  topics: ChatTopicRow[]
  sidebarOpen: boolean
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>
  providers: LlmProviderConfig[]
  selectedProviderId: number | null
  setSelectedProviderId: React.Dispatch<React.SetStateAction<number | null>>
  attachments: Attachment[]
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>
  isLoading: boolean
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  textareaRef: React.RefObject<HTMLDivElement | null>
  /** 全局输入历史（↑/↓ 键切换浏览，handleSend 记录，localStorage 持久化，上限 100 条） */
  inputHistoryRef: { current: string[] }
  currentSessionIdRef: React.RefObject<string | null>
  currentTopicIdRef: React.RefObject<number | null>
  loadingTopicIds: Set<number>
  selectedProvider: LlmProviderConfig | null
  modelSupportsTools: boolean
  modelSupportsVision: boolean
  groupedProviderOptions: {
    label: string
    options: { value: number; label: string; providerType: string }[]
  }[]
  titleDisplayed: string
  titleDone: boolean
  subtitleDisplayed: string
  subtitleDone: boolean
  /** 话题分页 */
  topicsHasMore: boolean
  topicsLoading: boolean
  /** 消息分页（当前话题） */
  messagesHasMore: boolean
  messagesLoadingMore: boolean
  handleSelectTopic: (topic: ChatTopicRow) => Promise<void>
  handleDeleteTopic: (topicId: number, e?: React.MouseEvent) => Promise<void>
  handleCopy: (text: string, id: string) => Promise<void>
  handleSend: () => Promise<void>
  handleNewChat: () => void
  handleDeleteMessagePair: (msgIndex: number) => Promise<void>
  handleKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
  handleStop: () => void
  handleLoadMoreTopics: () => Promise<void>
  handleLoadMoreMessages: () => Promise<void>
  refreshTopics: () => Promise<void>
}

export const useChatHandlers = (): UseChatHandlersReturn => {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLDivElement>(null)
  /** 全局输入历史（↑/↓ 键切换浏览，handleSend 记录，localStorage 持久化，上限 100 条） */
  const inputHistoryRef = useRef<string[]>(loadInputHistory())
  const currentSessionIdRef = useRef<string | null>(null)

  /** 当前活跃的工作区 ID */
  const activeWorkspaceIdRef = useRef<number>(0)
  const getActiveWorkspaceId = useCallback(async (): Promise<number> => {
    try {
      const settings = await (window as unknown as Window).api.systemSettings.getAll()
      const id = settings.chat.activeWorkspaceId ?? 0
      activeWorkspaceIdRef.current = id
      return id
    } catch {
      return activeWorkspaceIdRef.current
    }
  }, [])

  /** 当前活跃的智能体 causeId 集合：用于把智能体事件路由到正确块 */
  const activeSubAgentCauseIdsRef = useRef<Map<number, Set<string>>>(new Map())
  const [currentTopicId, setCurrentTopicId] = useState<number | null>(null)
  const currentTopicIdRef = useRef<number | null>(null)
  /** messages React 状态实际属于哪个话题——用于检测 handleSelectTopic 异步间隙中的跨话题污染 */
  const messagesBelongToTopicRef = useRef<number | null>(null)
  const [topics, setTopics] = useState<ChatTopicRow[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [providers, setProviders] = useState<LlmProviderConfig[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingTopicIds, setLoadingTopicIds] = useState<Set<number>>(new Set())

  // ── 分页状态 ──
  const [topicsPage, setTopicsPage] = useState(0)
  const [topicsHasMore, setTopicsHasMore] = useState(true)
  const [topicsLoading, setTopicsLoading] = useState(false)
  const [messagesPage, setMessagesPage] = useState(0)
  const [messagesHasMore, setMessagesHasMore] = useState(true)
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false)

  // ── 多会话支持 ──
  /** 每个 topicId 的会话缓存（进行中的对话） */
  const sessionsRef = useRef<Map<number, SessionState>>(new Map())
  /** 每个 topicId 的加载状态 */
  const isLoadingMapRef = useRef<Map<number, boolean>>(new Map())
  /** 每个 topicId 的 stream chunk 清理函数 */
  const chunkCleanupsRef = useRef<Map<number, () => void>>(new Map())
  /** 每个 topicId 的 stream done 清理函数 */
  const doneCleanupsRef = useRef<Map<number, () => void>>(new Map())
  /** 每个 topicId 的 stream error 清理函数 */
  const errorCleanupsRef = useRef<Map<number, () => void>>(new Map())

  /** 同步 isLoadingMapRef 到 loadingTopicIds 状态 */
  const syncLoadingTopics = useCallback((): void => {
    setLoadingTopicIds(new Set(isLoadingMapRef.current.keys()))
  }, [])

  const titleText = '你好，我是 Rita～'
  const subtitleTexts = [
    '今天天气怎么样？要是还不错，我帮你把明天的日程也排了～',
    '我可以帮你分析文档，提取关键信息，理清它们之间的关系。',
    '有什么重要的事尽管说，我帮你记着，并形成代办事项。',
    '我可以帮你整理零散的文档，构建相应的知识库。'
  ]
  const { displayedText: titleDisplayed, isDone: titleDone } = useTypewriter(titleText, 100)
  const { displayedText: subtitleDisplayed, isDone: subtitleDone } = useCyclingTypewriter(
    subtitleTexts,
    60,
    40,
    2000,
    titleText.length * 100
  )

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === selectedProviderId) ?? null,
    [providers, selectedProviderId]
  )
  const modelSupportsTools = supportsCapability(
    selectedProvider?.metadata,
    'supports_function_calling'
  )
  const modelSupportsVision = supportsCapability(selectedProvider?.metadata, 'supports_image_input')

  useEffect(() => {
    ;(window as unknown as Window).api.chat.getTools().then(setAvailableTools).catch(console.error)
  }, [])

  useEffect(() => {
    const loadProviders = async (): Promise<void> => {
      try {
        const list = await (window as unknown as Window).api.providers.getEnabled()
        const chatModels = list.filter((p) => !isEmbeddingProvider(p))
        setProviders(chatModels)

        // 模型：优先使用默认 provider
        const defaultProvider = await (window as unknown as Window).api.providers.getDefault()
        if (defaultProvider && !isEmbeddingProvider(defaultProvider)) {
          setSelectedProviderId(defaultProvider.id)
        } else if (chatModels.length > 0) {
          setSelectedProviderId(chatModels[0].id)
        }
      } catch (err) {
        console.error('Failed to load providers:', err)
      }
    }
    loadProviders().then()
    const unsubscribe = (window as unknown as Window).api.providers.onChanged(() => {
      loadProviders().then()
    })
    return unsubscribe
  }, [])

  const refreshTopics = useCallback(async (): Promise<void> => {
    try {
      setTopicsLoading(true)
      setTopicsPage(0)
      const workspaceId = await getActiveWorkspaceId()
      const result = await (window as unknown as Window).api.chat.getAllTopicsPaginated(
        workspaceId,
        0,
        TOPICS_PAGE_SIZE
      )
      setTopics(result.items)
      setTopicsHasMore(result.hasMore)
    } catch (err) {
      console.error('Failed to load topics:', err)
    } finally {
      setTopicsLoading(false)
    }
  }, [getActiveWorkspaceId])

  const handleLoadMoreTopics = useCallback(async (): Promise<void> => {
    if (topicsLoading || !topicsHasMore) return
    try {
      setTopicsLoading(true)
      const nextPage = topicsPage + 1
      const workspaceId = await getActiveWorkspaceId()
      const result = await (window as unknown as Window).api.chat.getAllTopicsPaginated(
        workspaceId,
        nextPage,
        TOPICS_PAGE_SIZE
      )
      setTopicsPage(nextPage)
      setTopics((prev) => [...prev, ...result.items])
      setTopicsHasMore(result.hasMore)
    } catch (err) {
      console.error('Failed to load more topics:', err)
    } finally {
      setTopicsLoading(false)
    }
  }, [topicsPage, topicsHasMore, topicsLoading, getActiveWorkspaceId])

  useEffect(() => {
    refreshTopics().then()
  }, [])

  // 组件卸载时清理所有流监听器
  useEffect(() => {
    const chunkCleanups = chunkCleanupsRef.current
    const doneCleanups = doneCleanupsRef.current
    const errorCleanups = errorCleanupsRef.current
    return () => {
      for (const cleanup of chunkCleanups.values()) cleanup()
      for (const cleanup of doneCleanups.values()) cleanup()
      for (const cleanup of errorCleanups.values()) cleanup()
    }
  }, [])

  // ── 会话缓存管理 ──

  /** 保存当前对话窗口的状态到缓存 */
  const saveSessionToCache = useCallback((): void => {
    const topicId = currentTopicIdRef.current
    if (topicId == null) return
    sessionsRef.current.set(topicId, {
      messages: [...messages],
      inputValue,
      attachments: [...attachments],
      sessionId: currentSessionIdRef.current
    })
  }, [messages, inputValue, attachments])

  /** 从缓存恢复会话到当前对话窗口 */
  const restoreSessionFromCache = useCallback((topicId: number): boolean => {
    const cached = sessionsRef.current.get(topicId)
    if (!cached) return false
    setMessages(cached.messages)
    setInputValue(cached.inputValue)
    setAttachments(cached.attachments)
    currentSessionIdRef.current = cached.sessionId
    return true
  }, [])

  // ── 处理流式 chunk 的核心逻辑（主代理 + 智能体） ──

  /** 将 stream chunk 应用到消息上，返回更新后的 messages 浅拷贝 */
  const applyChunkToMessages = useCallback(
    (msgs: Message[], aiMessageId: string, chunk: StreamChunk, topicId: number): Message[] => {
      let activeCauseIds = activeSubAgentCauseIdsRef.current.get(topicId)
      if (!activeCauseIds) {
        activeCauseIds = new Set()
        activeSubAgentCauseIdsRef.current.set(topicId, activeCauseIds)
      }
      return msgs.map((msg) => {
        if (msg.id !== aiMessageId) return msg

        const updatedReasoning = chunk.reasoning_content
          ? msg.reasoning_content &&
            String(chunk.reasoning_content).startsWith(msg.reasoning_content)
            ? String(chunk.reasoning_content)
            : msg.reasoning_content &&
                msg.reasoning_content.endsWith(String(chunk.reasoning_content))
              ? msg.reasoning_content
              : (msg.reasoning_content || '') + chunk.reasoning_content
          : msg.reasoning_content

        const updatedContent = chunk.content
          ? msg.content && chunk.content.startsWith(msg.content)
            ? chunk.content
            : msg.content && msg.content.endsWith(chunk.content)
              ? msg.content
              : msg.content + chunk.content
          : msg.content

        let updatedToolCalls = msg.toolCalls || []
        if (chunk.tool) {
          const existingIndex = updatedToolCalls.findIndex((tc) =>
            isSameToolCall(tc, chunk.tool as ToolCall)
          )
          if (existingIndex >= 0) {
            updatedToolCalls = [
              ...updatedToolCalls.slice(0, existingIndex),
              chunk.tool as ToolCall,
              ...updatedToolCalls.slice(existingIndex + 1)
            ]
          } else {
            updatedToolCalls = [...updatedToolCalls, chunk.tool as ToolCall]
          }
        }
        const updatedBlocks = [...msg.blocks]

        // 本轮热记忆注入：置于消息块最顶部（首个 chunk 到达，仅插入一次）
        if (chunk.memoryInjected) {
          const exists = updatedBlocks.some((b) => b.type === 'memoryInjected')
          if (!exists) {
            updatedBlocks.unshift({
              type: 'memoryInjected',
              memory: {
                user: chunk.memoryInjected.user,
                memory: chunk.memoryInjected.memory,
                usage: chunk.memoryInjected.usage
              }
            })
          }
        }

        // 摘要压缩开始：插入「压缩中」过渡块（仅当前轮展示，不落库；
        // 结果块到达后在原位置替换，压缩失败时随消息结束隐藏）
        if (chunk.historyCompacting) {
          const exists = updatedBlocks.some(
            (b) => b.type === 'historyCompacting' || b.type === 'historyCompacted'
          )
          if (!exists) {
            updatedBlocks.push({ type: 'historyCompacting' })
          }
        }

        // 本轮早期对话摘要压缩：紧随记忆注入块（正文流开始前到达，仅插入一次）
        if (chunk.historyCompacted) {
          const compacted = {
            type: 'historyCompacted' as const,
            compaction: {
              compressedCount: chunk.historyCompacted.compressedCount,
              retainedCount: chunk.historyCompacted.retainedCount,
              boundaryId: chunk.historyCompacted.boundaryId
            }
          }
          // 原地替换「压缩中」过渡块（保持卡片位置稳定）
          const compactingIdx = updatedBlocks.findIndex((b) => b.type === 'historyCompacting')
          if (compactingIdx >= 0) {
            updatedBlocks[compactingIdx] = compacted
          } else if (!updatedBlocks.some((b) => b.type === 'historyCompacted')) {
            updatedBlocks.push(compacted)
          }
        }

        if (chunk.reasoning_content) {
          const reasoningDelta = computeTextDelta(
            String(chunk.reasoning_content),
            msg.reasoning_content || ''
          )
          if (reasoningDelta) {
            const lastBlock = updatedBlocks[updatedBlocks.length - 1]
            if (lastBlock?.type === 'reasoning') {
              updatedBlocks[updatedBlocks.length - 1] = {
                type: 'reasoning',
                reasoning: (lastBlock.reasoning || '') + reasoningDelta
              }
            } else {
              pushBlock(updatedBlocks, { type: 'reasoning', reasoning: reasoningDelta })
            }
          }
        }

        if (chunk.content) {
          const contentDelta = computeTextDelta(String(chunk.content), msg.content || '')
          if (contentDelta) {
            const lastBlock = updatedBlocks[updatedBlocks.length - 1]
            if (lastBlock?.type === 'text') {
              updatedBlocks[updatedBlocks.length - 1] = {
                type: 'text',
                text: (lastBlock.text || '') + contentDelta
              }
            } else {
              pushBlock(updatedBlocks, { type: 'text', text: contentDelta })
            }
          }
        }

        if (chunk.tool) {
          if (chunk.tool.name !== 'task') {
            if (chunk.tool.status === 'completed') {
              for (let i = updatedBlocks.length - 1; i >= 0; i--) {
                const b = updatedBlocks[i]
                if (
                  b.type === 'tool' &&
                  b.tool &&
                  b.tool.status !== 'completed' &&
                  isSameToolCall(b.tool, chunk.tool)
                ) {
                  updatedBlocks[i] = {
                    type: 'tool',
                    tool: {
                      ...b.tool,
                      output: chunk.tool.output,
                      status: chunk.tool.status,
                      card: chunk.tool.card
                    }
                  }
                  break
                }
              }
            } else if (chunk.tool.status === 'preparing') {
              const exists = updatedBlocks.some(
                (b) =>
                  b.type === 'tool' && isSameToolCall(b.tool as ToolCall, chunk.tool as ToolCall)
              )
              if (!exists) {
                const blockTool = {
                  name: chunk.tool.name,
                  input: {},
                  output: '',
                  status: 'preparing' as const,
                  id: chunk.tool.id
                }
                pushBlock(updatedBlocks, { type: 'tool', tool: blockTool })
              }
            } else {
              let merged = false
              for (let i = updatedBlocks.length - 1; i >= 0; i--) {
                const b = updatedBlocks[i]
                if (
                  b.type === 'tool' &&
                  b.tool?.status === 'preparing' &&
                  isSameToolCall(b.tool, chunk.tool)
                ) {
                  updatedBlocks[i] = {
                    type: 'tool',
                    tool: {
                      name: chunk.tool.name,
                      input: chunk.tool.input,
                      output: '',
                      status: 'executing',
                      id: b.tool.id ?? chunk.tool.id
                    }
                  }
                  merged = true
                  break
                }
              }
              if (!merged) {
                const blockTool = {
                  name: chunk.tool.name,
                  input: chunk.tool.input,
                  output: chunk.tool.output,
                  status: (chunk.tool.status || 'executing') as ToolCall['status'],
                  id: chunk.tool.id
                }
                pushBlock(updatedBlocks, { type: 'tool', tool: blockTool })
              }
            }
          }
        }

        if (chunk.subAgent) {
          const sa = chunk.subAgent

          const findSaBlock = (): number => {
            for (let i = updatedBlocks.length - 1; i >= 0; i--) {
              const block = updatedBlocks[i]
              if (block.type !== 'subAgent' || !block.subAgent) continue
              if (sa.causeId && block.subAgent.causeId && block.subAgent.causeId === sa.causeId) {
                return i
              }
              if (block.subAgent.name === sa.name && (!sa.causeId || !block.subAgent.causeId)) {
                return i
              }
            }
            return -1
          }

          if (sa.status === 'started') {
            const idx = findSaBlock()
            if (idx < 0) {
              pushBlock(updatedBlocks, {
                type: 'subAgent',
                subAgent: {
                  name: sa.name,
                  causeId: sa.causeId,
                  status: 'started',
                  taskDescription: sa.taskDescription
                },
                children: []
              })
            } else {
              const existing = updatedBlocks[idx].subAgent!
              existing.status = 'started'
              existing.taskDescription = existing.taskDescription || sa.taskDescription
            }
            if (sa.causeId) {
              activeCauseIds.add(sa.causeId)
            }
          } else if (sa.status === 'completed' || sa.status === 'error') {
            const idx = findSaBlock()
            if (idx >= 0) {
              const existing = updatedBlocks[idx].subAgent!
              existing.status = sa.status
              existing.output = sa.output
              existing.error = sa.error
              existing.taskDescription = existing.taskDescription || sa.taskDescription
            }
            if (sa.causeId) {
              activeCauseIds.delete(sa.causeId)
            }
          } else if (sa.content || sa.reasoning_content || sa.tool) {
            const idx = findSaBlock()
            let block: MessageBlock
            if (idx >= 0) {
              block = updatedBlocks[idx]
            } else {
              block = {
                type: 'subAgent',
                subAgent: {
                  name: sa.name,
                  causeId: sa.causeId,
                  status: 'running',
                  taskDescription: sa.taskDescription
                },
                children: []
              }
              pushBlock(updatedBlocks, block)
            }
            if (block.subAgent!.status !== 'completed' && block.subAgent!.status !== 'error') {
              block.subAgent!.status = 'running'
            }
            block.subAgent!.taskDescription = block.subAgent!.taskDescription || sa.taskDescription
            if (!block.children) block.children = []

            if (sa.reasoning_content) {
              const totalPrevReasoning = block.children
                .filter((c) => c.type === 'reasoning')
                .map((c) => c.reasoning || '')
                .join('')
              const reasoningDelta = computeTextDelta(
                String(sa.reasoning_content),
                totalPrevReasoning
              )
              if (reasoningDelta) {
                const lastChild = block.children[block.children.length - 1]
                if (lastChild?.type === 'reasoning') {
                  block.children[block.children.length - 1] = {
                    type: 'reasoning',
                    reasoning: (lastChild.reasoning || '') + reasoningDelta
                  }
                } else {
                  pushBlock(block.children, { type: 'reasoning', reasoning: reasoningDelta })
                }
              }
            }

            if (sa.content) {
              const totalPrevText = block.children
                .filter((c) => c.type === 'text')
                .map((c) => c.text || '')
                .join('')
              const contentDelta = computeTextDelta(String(sa.content), totalPrevText)
              if (contentDelta) {
                const lastChild = block.children[block.children.length - 1]
                if (lastChild?.type === 'text') {
                  block.children[block.children.length - 1] = {
                    type: 'text',
                    text: (lastChild.text || '') + contentDelta
                  }
                } else {
                  pushBlock(block.children, { type: 'text', text: contentDelta })
                }
              }
            }

            if (sa.tool) {
              if (sa.tool.name !== 'task') {
                if (sa.tool.status === 'completed') {
                  for (let i = block.children.length - 1; i >= 0; i--) {
                    const c = block.children[i]
                    if (
                      c.type === 'tool' &&
                      c.tool &&
                      c.tool.status !== 'completed' &&
                      isSameToolCall(c.tool, sa.tool)
                    ) {
                      block.children[i] = {
                        type: 'tool',
                        tool: {
                          ...c.tool,
                          output: sa.tool.output,
                          status: sa.tool.status,
                          card: sa.tool.card
                        }
                      }
                      break
                    }
                  }
                } else if (sa.tool.status === 'preparing') {
                  const exists = block.children.some(
                    (c) =>
                      c.type === 'tool' && isSameToolCall(c.tool as ToolCall, sa.tool as ToolCall)
                  )
                  if (!exists) {
                    pushBlock(block.children, {
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
                  for (let i = block.children.length - 1; i >= 0; i--) {
                    const c = block.children[i]
                    if (
                      c.type === 'tool' &&
                      c.tool?.status === 'preparing' &&
                      isSameToolCall(c.tool, sa.tool)
                    ) {
                      block.children[i] = {
                        type: 'tool',
                        tool: {
                          name: sa.tool.name,
                          input: sa.tool.input,
                          output: '',
                          status: 'executing',
                          id: c.tool.id ?? sa.tool.id
                        }
                      }
                      merged = true
                      break
                    }
                  }
                  if (!merged) {
                    pushBlock(block.children, {
                      type: 'tool',
                      tool: {
                        name: sa.tool.name,
                        input: sa.tool.input,
                        output: sa.tool.output,
                        status: (sa.tool.status || 'executing') as ToolCall['status'],
                        id: sa.tool.id
                      }
                    })
                  }
                }
              }
            }
          }
        }

        return {
          ...msg,
          content: updatedContent,
          blocks: updatedBlocks,
          toolCalls: updatedToolCalls.length > 0 ? updatedToolCalls : undefined,
          reasoning_content: updatedReasoning
        }
      })
    },
    []
  )

  // ── 开始流式监听（每个 topic 独立） ──

  const startStreamListener = useCallback(
    (topicId: number, aiMessageId: string): void => {
      // 清理旧的监听器
      chunkCleanupsRef.current.get(topicId)?.()
      doneCleanupsRef.current.get(topicId)?.()
      errorCleanupsRef.current.get(topicId)?.()

      const chunkCleanup = (window as unknown as Window).api.chat.onStreamChunk(
        (chunk: StreamChunk) => {
          // topicId 守卫：只处理属于本话题的 chunk（Set 分发机制会使所有 handler 收到所有 chunk）
          if (chunk.__topicId !== topicId) return
          const session = sessionsRef.current.get(topicId)
          if (session) {
            const updatedMessages = applyChunkToMessages(
              session.messages,
              aiMessageId,
              chunk,
              topicId
            )
            sessionsRef.current.set(topicId, {
              ...session,
              messages: updatedMessages
            })

            // 复用 session cache 的结果直接更新 React state
            // 避免 setMessages(prev => ...) 中 updater 被 StrictMode 双重调用导致重复块
            if (currentTopicIdRef.current === topicId) {
              setMessages(updatedMessages)
            }
          }
        }
      )
      chunkCleanupsRef.current.set(topicId, chunkCleanup)

      const doneCleanup = (window as unknown as Window).api.chat.onStreamDone(
        ({ topicId: doneTopicId }) => {
          // 守卫：只处理本 topic 的完成事件（Set 分发可能导致旧 handler 收到其他 topic 的事件）
          if (doneTopicId !== topicId) return

          // 清理对应 topic 的加载状态
          isLoadingMapRef.current.delete(doneTopicId)
          syncLoadingTopics()

          // 完成后清除缓存（后续切换回来直接读数据库）
          sessionsRef.current.delete(doneTopicId)

          // 清理智能体追踪
          activeSubAgentCauseIdsRef.current.delete(doneTopicId)

          // 清理流监听器（doneCleanup 自身由 startStreamListener L575-576 在下一次同 topic 启动时清理）
          chunkCleanupsRef.current.get(doneTopicId)?.()
          chunkCleanupsRef.current.delete(doneTopicId)
          doneCleanupsRef.current.delete(doneTopicId)
          errorCleanupsRef.current.get(doneTopicId)?.()
          errorCleanupsRef.current.delete(doneTopicId)

          // 刷新话题列表
          refreshTopics().then()

          // 如果是当前显示的话题，更新 UI
          if (currentTopicIdRef.current === doneTopicId) {
            setIsLoading(false)
            setMessages((prev) =>
              prev.map((msg) => (msg.loading ? { ...msg, loading: false } : msg))
            )
          }
        }
      )
      doneCleanupsRef.current.set(topicId, doneCleanup)

      // 注册流错误监听：模型不存在 / 被禁用等启动阶段的错误
      const errorCleanup = (window as unknown as Window).api.chat.onStreamError(
        ({ error: errMsg, topicId: errorTopicId }) => {
          // 守卫：只处理本 topic 的错误
          if (errorTopicId !== topicId) return

          console.error(`[Stream] Error for topic ${topicId}: ${errMsg}`)

          // 更新会话缓存中的 AI 消息为错误信息
          const session = sessionsRef.current.get(topicId)
          if (session) {
            const updatedMessages = session.messages.map((msg) =>
              msg.id === aiMessageId ? { ...msg, content: errMsg, blocks: [], loading: false } : msg
            )
            sessionsRef.current.set(topicId, {
              ...session,
              messages: updatedMessages
            })
          }

          // 如果当前正在显示此 topic，同步更新 React 状态
          if (currentTopicIdRef.current === topicId) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? { ...msg, content: errMsg, blocks: [], loading: false }
                  : msg
              )
            )
          }
        }
      )
      errorCleanupsRef.current.set(topicId, errorCleanup)
    },
    [applyChunkToMessages, syncLoadingTopics]
  )

  // ── 目标自动续跑轮监听（常驻，不随普通轮的 done 清理）──
  // 目标轮次驱动器在主进程发起新轮时先下发 goalRound 标记 chunk：
  // 挂载「自动续跑」用户消息 + 助手占位，并为本轮注册流监听（普通用户轮由 handleSend 挂载）。
  useEffect(() => {
    const cleanup = (window as unknown as Window).api.chat.onStreamChunk((chunk: StreamChunk) => {
      if (!chunk.goalRound) return
      const topicId = chunk.__topicId ?? 0
      if (!topicId) return
      const { round, objective } = chunk.goalRound

      const userMessage: Message = {
        id: `goal-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        content: objective,
        blocks: [{ type: 'goalRound', round }],
        timestamp: Date.now()
      }
      const aiMessageId = `goal-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const initialAiMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        blocks: [],
        timestamp: Date.now(),
        toolCalls: [],
        loading: true
      }

      // 标记加载状态（停止按钮可用、侧边栏转圈）
      isLoadingMapRef.current.set(topicId, true)
      syncLoadingTopics()
      if (currentTopicIdRef.current === topicId) {
        setIsLoading(true)
        setMessages((prev) => [...prev, userMessage, initialAiMessage])
      }

      // 更新会话缓存并启动本轮监听（后续 chunk 由本轮监听器处理）
      const session = sessionsRef.current.get(topicId)
      const base = session?.messages ?? []
      sessionsRef.current.set(topicId, {
        messages: [...base, userMessage, initialAiMessage],
        inputValue: session?.inputValue ?? '',
        attachments: session?.attachments ?? [],
        sessionId: aiMessageId
      })
      currentSessionIdRef.current = aiMessageId
      startStreamListener(topicId, aiMessageId)
    })
    return cleanup
  }, [startStreamListener, syncLoadingTopics])

  // ── Handlers ──

  const handleNewChat = useCallback((): void => {
    saveSessionToCache()
    setMessages([])
    setCurrentTopicId(null)
    currentTopicIdRef.current = null
    messagesBelongToTopicRef.current = null
    setInputValue('')
    setAttachments([])
    setIsLoading(false)
  }, [saveSessionToCache])

  const handleSelectTopic = useCallback(
    async (topic: ChatTopicRow): Promise<void> => {
      // 不在加载时禁止切换，允许自由切换

      // 保存当前话题状态到缓存
      saveSessionToCache()

      currentTopicIdRef.current = topic.id
      setCurrentTopicId(topic.id)

      // 先尝试从缓存恢复（进行中的会话）
      const restored = restoreSessionFromCache(topic.id)
      if (restored) {
        // 从缓存恢复，同步 loading 状态
        setIsLoading(isLoadingMapRef.current.get(topic.id) ?? false)
        messagesBelongToTopicRef.current = topic.id
        return
      }

      // 缓存未命中：从数据库分页加载第一页
      currentSessionIdRef.current = null
      setIsLoading(false)
      setMessagesPage(0)
      setMessagesHasMore(true)

      try {
        const result = await (window as unknown as Window).api.chat.getDialoguesByTopicPaginated(
          topic.id,
          0,
          MESSAGES_PAGE_SIZE
        )
        const loadedMessages: Message[] = result.items.map((d) => ({
          id: String(d.id),
          role: d.role,
          content: d.content,
          blocks: d.blocks ? JSON.parse(d.blocks) : [],
          timestamp: new Date(d.created_at).getTime(),
          loading: false
        }))
        setMessages(loadedMessages)
        setMessagesHasMore(result.hasMore)
      } catch (err) {
        console.error('Failed to load dialogues:', err)
        setMessages([])
      }

      messagesBelongToTopicRef.current = topic.id

      setInputValue('')
      setAttachments([])
    },
    [saveSessionToCache, restoreSessionFromCache]
  )

  const handleDeleteTopic = useCallback(
    async (topicId: number, e?: React.MouseEvent): Promise<void> => {
      e?.stopPropagation()
      try {
        // 如果删除的是正在流式输出的话题，先取消后端流
        if (isLoadingMapRef.current.has(topicId)) {
          ;(window as unknown as Window).api.chat.cancelStream()
        }

        await (window as unknown as Window).api.chat.deleteTopic(topicId)

        // 清理该话题的所有缓存和监听器
        sessionsRef.current.delete(topicId)
        isLoadingMapRef.current.delete(topicId)
        syncLoadingTopics()
        chunkCleanupsRef.current.get(topicId)?.()
        chunkCleanupsRef.current.delete(topicId)
        doneCleanupsRef.current.get(topicId)?.()
        doneCleanupsRef.current.delete(topicId)
        errorCleanupsRef.current.get(topicId)?.()
        errorCleanupsRef.current.delete(topicId)
        activeSubAgentCauseIdsRef.current.delete(topicId)

        if (currentTopicIdRef.current === topicId) {
          handleNewChat()
        }
        await refreshTopics()
      } catch (err) {
        console.error('Failed to delete topic:', err)
      }
    },
    [handleNewChat, syncLoadingTopics]
  )

  const handleLoadMoreMessages = useCallback(async (): Promise<void> => {
    if (messagesLoadingMore || !messagesHasMore || currentTopicIdRef.current == null) return
    try {
      setMessagesLoadingMore(true)
      const nextPage = messagesPage + 1
      const result = await (window as unknown as Window).api.chat.getDialoguesByTopicPaginated(
        currentTopicIdRef.current,
        nextPage,
        MESSAGES_PAGE_SIZE
      )
      setMessagesPage(nextPage)
      // 更旧的消息插入到列表头部
      const olderMessages: Message[] = result.items.map((d) => ({
        id: String(d.id),
        role: d.role,
        content: d.content,
        blocks: d.blocks ? JSON.parse(d.blocks) : [],
        timestamp: new Date(d.created_at).getTime(),
        loading: false
      }))
      setMessages((prev) => [...olderMessages, ...prev])
      setMessagesHasMore(result.hasMore)
    } catch (err) {
      console.error('Failed to load more messages:', err)
    } finally {
      setMessagesLoadingMore(false)
    }
  }, [messagesPage, messagesHasMore, messagesLoadingMore])

  const handleCopy = useCallback(async (text: string, id: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }, [])

  const handleSend = useCallback(async (): Promise<void> => {
    if (!inputValue.trim()) return

    // 新一轮问答开始：清空输入框上方的进行中任务卡片（等待模型重新规划）
    window.dispatchEvent(new CustomEvent('chat-send-started'))

    const currentAttachments = [...attachments]
    setAttachments([])

    const currentImages = currentAttachments.filter((a) => a.isImage).map((a) => a.dataUrl)
    const currentDocuments = currentAttachments
      .filter((a) => !a.isImage)
      .map((a) => ({ fileName: a.fileName, filePath: a.dataUrl }))

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      blocks: currentAttachments.map((a) =>
        a.isImage
          ? { type: 'image' as const, image_url: a.dataUrl }
          : { type: 'document' as const, fileName: a.fileName }
      ),
      timestamp: Date.now()
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')

    const aiMessageId = `${Date.now()}_${currentTopicIdRef.current ?? 'new'}_${Math.random().toString(36).slice(2, 8)}`

    const initialAiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      blocks: [],
      timestamp: Date.now(),
      toolCalls: [],
      loading: true
    }

    setMessages((prev) => [...prev, initialAiMessage])

    try {
      // 如果还没有 topic，先创建（让话题立即出现在侧边栏）
      let topicId = currentTopicIdRef.current
      if (!topicId) {
        const title = userMessage.content.slice(0, 50)
        const workspaceId = await getActiveWorkspaceId()
        topicId = await (window as unknown as Window).api.chat.createTopic(workspaceId, title)
        currentTopicIdRef.current = topicId
        setCurrentTopicId(topicId)
        refreshTopics().then()
      }

      // 记录本轮输入到全局输入历史（输入框 ↑/↓ 键切换用，localStorage 持久化，上限 100 条）
      const sentText = inputValue.trim()
      const inputHistory = inputHistoryRef.current
      if (inputHistory[inputHistory.length - 1] !== sentText) {
        inputHistory.push(sentText)
        if (inputHistory.length > INPUT_HISTORY_MAX) {
          inputHistory.splice(0, inputHistory.length - INPUT_HISTORY_MAX)
        }
        try {
          localStorage.setItem(INPUT_HISTORY_STORAGE_KEY, JSON.stringify(inputHistory))
        } catch {
          // 存储失败不影响发送流程
        }
      }

      currentSessionIdRef.current = aiMessageId

      // 标记加载状态
      isLoadingMapRef.current.set(topicId, true)
      syncLoadingTopics()
      setIsLoading(true)

      // 启动流监听（独立于当前对话窗口，持续更新缓存）
      startStreamListener(topicId, aiMessageId)

      // 缓存当前会话——使用 messagesBelongToTopicRef 防止跨话题污染：
      // 如果 handleSelectTopic 的异步 DB 加载尚未完成，messages 仍属于旧话题，
      // 此时应丢弃旧消息，从新对话开始（否则会把 A 的历史混入 B 的会话缓存）
      const sameTopic = messagesBelongToTopicRef.current === topicId
      const baseMessages = sameTopic ? messages : ([] as Message[])
      const currentMessages: Message[] = [...baseMessages, userMessage, initialAiMessage]
      sessionsRef.current.set(topicId, {
        messages: currentMessages,
        inputValue: '',
        attachments: [],
        sessionId: aiMessageId
      })
      messagesBelongToTopicRef.current = topicId

      // 同步 React 状态
      setMessages(currentMessages)

      ;(window as unknown as Window).api.chat.startMessageStream(userMessage.content, {
        images: currentImages.length > 0 ? currentImages : undefined,
        documents: currentDocuments.length > 0 ? currentDocuments : undefined,
        topicId,
        providerId: selectedProviderId ?? undefined
      })
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        content: '抱歉，发生了错误，请稍后重试。',
        blocks: [],
        timestamp: Date.now(),
        loading: false
      }
      setMessages((prev) => prev.map((msg) => (msg.id === aiMessageId ? errorMessage : msg)))

      // 清理加载状态
      const topicId = currentTopicIdRef.current
      if (topicId != null) {
        isLoadingMapRef.current.delete(topicId)
        syncLoadingTopics()
        setIsLoading(false)
      }
    }
  }, [
    messages,
    inputValue,
    attachments,
    selectedProviderId,
    startStreamListener,
    syncLoadingTopics
  ])

  const handleDeleteMessagePair = useCallback(
    async (msgIndex: number): Promise<void> => {
      const msgs = [...messages]
      const current = msgs[msgIndex]
      if (!current) return

      const indicesToDelete: number[] = []

      if (current.role === 'user') {
        indicesToDelete.push(msgIndex)
        if (msgIndex + 1 < msgs.length && msgs[msgIndex + 1].role === 'assistant') {
          indicesToDelete.push(msgIndex + 1)
        }
      } else if (current.role === 'assistant') {
        if (msgIndex - 1 >= 0 && msgs[msgIndex - 1].role === 'user') {
          indicesToDelete.push(msgIndex - 1)
        }
        indicesToDelete.push(msgIndex)
      }

      try {
        for (const idx of indicesToDelete) {
          const msg = msgs[idx]
          if (msg.id && !isNaN(Number(msg.id))) {
            await (window as unknown as Window).api.chat.deleteDialogue(Number(msg.id))
          }
        }
      } catch (err) {
        console.error('Failed to delete dialogue:', err)
      }

      const toDelete = new Set(indicesToDelete)
      const newMsgs = msgs.filter((_, i) => !toDelete.has(i))
      setMessages(newMsgs)

      if (newMsgs.length === 0) {
        const deletedTopicId = currentTopicIdRef.current
        currentTopicIdRef.current = null
        messagesBelongToTopicRef.current = null
        setCurrentTopicId(null)
        if (deletedTopicId != null) {
          sessionsRef.current.delete(deletedTopicId)
          isLoadingMapRef.current.delete(deletedTopicId)
          syncLoadingTopics()
        }
      }
    },
    [messages, syncLoadingTopics]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend().then()
      }
    },
    [handleSend]
  )

  const handleStop = useCallback((): void => {
    ;(window as unknown as Window).api.chat.cancelStream()

    const topicId = currentTopicIdRef.current
    if (topicId != null) {
      isLoadingMapRef.current.delete(topicId)
      syncLoadingTopics()
      setIsLoading(false)

      // 清理流监听器
      chunkCleanupsRef.current.get(topicId)?.()
      chunkCleanupsRef.current.delete(topicId)
      doneCleanupsRef.current.get(topicId)?.()
      doneCleanupsRef.current.delete(topicId)
      errorCleanupsRef.current.get(topicId)?.()
      errorCleanupsRef.current.delete(topicId)
    }

    setMessages((prev) => prev.map((msg) => (msg.loading ? { ...msg, loading: false } : msg)))
  }, [syncLoadingTopics])

  const groupedProviderOptions = useMemo(() => {
    const grouped = new Map<string, { value: number; displayName: string; model: string }[]>()
    for (const p of providers) {
      if (!grouped.has(p.provider)) {
        grouped.set(p.provider, [])
      }
      grouped
        .get(p.provider)!
        .push({ value: p.id, displayName: getProviderDisplayName(p), model: p.model })
    }
    return Array.from(grouped.entries()).map(([provider, opts]) => ({
      label: provider.charAt(0).toUpperCase() + provider.slice(1),
      options: opts.map((o) => ({
        value: o.value,
        label: o.displayName,
        providerType: provider
      }))
    }))
  }, [providers])

  return {
    // state
    messages,
    inputValue,
    setInputValue,
    availableTools,
    copiedId,
    currentTopicId,
    topics,
    sidebarOpen,
    setSidebarOpen,
    providers,
    selectedProviderId,
    setSelectedProviderId,
    attachments,
    setAttachments,
    isLoading,
    loadingTopicIds,
    // refs
    messagesEndRef,
    textareaRef,
    inputHistoryRef,
    currentSessionIdRef,
    currentTopicIdRef,
    // computed
    selectedProvider,
    modelSupportsTools,
    modelSupportsVision,
    groupedProviderOptions,
    // title
    titleDisplayed,
    titleDone,
    subtitleDisplayed,
    subtitleDone,
    // pagination
    topicsHasMore,
    topicsLoading,
    messagesHasMore,
    messagesLoadingMore,
    // handlers
    handleSelectTopic,
    handleDeleteTopic,
    handleCopy,
    handleSend,
    handleNewChat,
    handleDeleteMessagePair,
    handleKeyDown,
    handleStop,
    handleLoadMoreTopics,
    handleLoadMoreMessages,
    refreshTopics
  }
}
