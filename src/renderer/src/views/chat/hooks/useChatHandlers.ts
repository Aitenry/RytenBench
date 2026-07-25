import { useState, useRef, useEffect, useMemo } from 'react'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { ChatDialogueRow, ChatTopicRow } from '../../../../../main/database/mapper/chat'
import { LlmProviderConfig } from '../../../../../main/database/mapper/provider'
import { Window, ToolInfo } from '../../../../resource/types/window'
import type { Message, Attachment, ToolCall, MessageBlock } from '@renderer/types/chat'
import { useTypewriter, useCyclingTypewriter } from './useTypewriter'
import { isSameToolCall, computeTextDelta, pushBlock } from '../utils/chatHelpers'

export const useChatHandlers = () => {
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<TextAreaRef>(null)
  const currentSessionIdRef = useRef<string | null>(null)
  const currentTopicIdRef = useRef<number | null>(null)
  const cleanupChunkRef = useRef<(() => void) | null>(null)
  const cleanupDoneRef = useRef<(() => void) | null>(null)
  /** 当前活跃的子代理 causeId 集合：用于把子代理事件路由到正确块 */
  const activeSubAgentCauseIdsRef = useRef<Set<string>>(new Set())
  const [currentTopicId, setCurrentTopicId] = useState<number | null>(null)
  const [topics, setTopics] = useState<ChatTopicRow[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [providers, setProviders] = useState<LlmProviderConfig[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])

  const titleText = '你好，我是 Rita～'
  const subtitleTexts = [
    '今天天气怎么样？要是还不错，我帮你把明天的日程也排了～',
    '我可以帮你分析文档，提取关键信息，理清它们之间的关系。',
    '有什么重要的事尽管说，我帮你记着，排得妥妥的。',
    '我可以帮你整理零散的文档，构建成知识库~',
    '要不要放首歌？我顺便帮你把任务理一理。'
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
  const modelSupportsTools = selectedProvider?.tags?.includes('tools') ?? false
  const modelSupportsVision = selectedProvider?.tags?.includes('vision') ?? false

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    ;(window as unknown as Window).api.chat.getTools().then(setAvailableTools).catch(console.error)
  }, [])

  useEffect(() => {
    const loadProviders = async (): Promise<void> => {
      try {
        const list = await (window as unknown as Window).api.providers.getEnabled()
        const chatModels = list.filter((p) => !p.tags?.includes('embedding'))
        setProviders(chatModels)
        const defaultProvider = await (window as unknown as Window).api.providers.getDefault()
        if (defaultProvider && !defaultProvider.tags?.includes('embedding')) {
          setSelectedProviderId(defaultProvider.id)
        } else if (chatModels.length > 0) {
          setSelectedProviderId(chatModels[0].id)
        }
      } catch (err) {
        console.error('Failed to load providers:', err)
      }
    }
    loadProviders().then()
  }, [])

  const refreshTopics = async (): Promise<void> => {
    try {
      const list = await (window as unknown as Window).api.chat.getAllTopics()
      setTopics(list)
    } catch (err) {
      console.error('Failed to load topics:', err)
    }
  }

  useEffect(() => {
    refreshTopics().then()
  }, [])

  const handleNewChat = (): void => {
    setMessages([])
    setCurrentTopicId(null)
    currentTopicIdRef.current = null
    setInputValue('')
    setSelectedTools([])
    setAttachments([])
  }

  const handleSelectTopic = async (topic: ChatTopicRow): Promise<void> => {
    if (messages.some((msg) => msg.loading)) return

    currentTopicIdRef.current = topic.id
    setCurrentTopicId(topic.id)

    if (topic.selected_tools) {
      try {
        setSelectedTools(JSON.parse(topic.selected_tools))
      } catch {
        setSelectedTools([])
      }
    } else {
      setSelectedTools([])
    }

    try {
      const dialogues: ChatDialogueRow[] = await (
        window as unknown as Window
      ).api.chat.getDialoguesByTopic(topic.id)
      const loadedMessages: Message[] = dialogues.map((d) => ({
        id: String(d.id),
        role: d.role,
        content: d.content,
        blocks: d.blocks ? JSON.parse(d.blocks) : [],
        timestamp: new Date(d.created_at).getTime(),
        loading: false
      }))
      setMessages(loadedMessages)
    } catch (err) {
      console.error('Failed to load dialogues:', err)
    }
  }

  const handleDeleteTopic = async (topicId: number, e?: React.MouseEvent): Promise<void> => {
    e?.stopPropagation()
    try {
      await (window as unknown as Window).api.chat.deleteTopic(topicId)
      if (currentTopicIdRef.current === topicId) {
        handleNewChat()
      }
      await refreshTopics()
    } catch (err) {
      console.error('Failed to delete topic:', err)
    }
  }

  useEffect(() => {
    return () => {
      cleanupChunkRef.current?.()
      cleanupDoneRef.current?.()
    }
  }, [])

  const handleCopy = async (text: string, id: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleSend = async (): Promise<void> => {
    const hasLoadingMessage = messages.some((msg) => msg.loading)
    if (!inputValue.trim() || hasLoadingMessage) return

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

    const aiMessageId = (Date.now() + 1).toString()
    currentSessionIdRef.current = aiMessageId
    activeSubAgentCauseIdsRef.current = new Set()

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
      cleanupChunkRef.current?.()
      cleanupChunkRef.current = (window as unknown as Window).api.chat.onStreamChunk((chunk) => {
        if (currentSessionIdRef.current !== aiMessageId) {
          return
        }

        setMessages((prev) =>
          prev.map((msg) => {
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
            // 兼容 provider 可能下发完整文本而非增量：如果 chunk.content 是已有内容的前缀/后缀，则替换/忽略，避免重复拼接
            const updatedContent = chunk.content
              ? msg.content && chunk.content.startsWith(msg.content)
                ? chunk.content
                : msg.content && msg.content.endsWith(chunk.content)
                  ? msg.content
                  : msg.content + chunk.content
              : msg.content
            // 按 callId/name 更新已有工具调用状态，避免只追加导致状态不同步
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
              if (chunk.tool.name === 'task') {
                // task 工具已由 service.ts 转换为 subAgent 事件下发，此处跳过
              } else {
                if (chunk.tool.status === 'completed') {
                  // 匹配同一次调用的未完成工具块并更新（优先 callId，兼容同名工具重复调用）
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
                          status: chunk.tool.status
                        }
                      }
                      break
                    }
                  }
                } else if (chunk.tool.status === 'preparing') {
                  // 模型开始构建工具参数，立即给出反馈；
                  // 后续进度 chunk 仅用于保活，已存在对应 preparing 块则跳过。
                  //  additionally，若同一次调用已处于 executing/completed（事件乱序），也跳过，
                  //  避免屏幕上同时出现"执行中"和"生成中"两个同名工具块。
                  const exists = updatedBlocks.some(
                    (b) =>
                      b.type === 'tool' &&
                      isSameToolCall(b.tool as ToolCall, chunk.tool as ToolCall)
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
                  // executing：优先合并到同一次调用的 preparing 块
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

              // 查找子代理块：按 causeId 精确匹配（每次 task 调用唯一），回退按名称
              const findSaBlock = (): number => {
                for (let i = updatedBlocks.length - 1; i >= 0; i--) {
                  const block = updatedBlocks[i]
                  if (block.type !== 'subAgent' || !block.subAgent) continue
                  if (
                    sa.causeId &&
                    block.subAgent.causeId &&
                    block.subAgent.causeId === sa.causeId
                  ) {
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
                  activeSubAgentCauseIdsRef.current.add(sa.causeId)
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
                  activeSubAgentCauseIdsRef.current.delete(sa.causeId)
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
                block.subAgent!.taskDescription =
                  block.subAgent!.taskDescription || sa.taskDescription
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
                  if (sa.tool.name === 'task') {
                    // task 工具已由 service.ts 转换为 subAgent 事件下发，此处跳过
                  } else {
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
                              status: sa.tool.status
                            }
                          }
                          break
                        }
                      }
                    } else if (sa.tool.status === 'preparing') {
                      // 同主代理：若该子代理的同一次工具调用已存在任意状态块，跳过乱序的 preparing
                      const exists = block.children.some(
                        (c) =>
                          c.type === 'tool' &&
                          isSameToolCall(c.tool as ToolCall, sa.tool as ToolCall)
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
                      // executing
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
              // 纯 running 心跳：跳过
            }

            return {
              ...msg,
              content: updatedContent,
              blocks: updatedBlocks,
              toolCalls: updatedToolCalls.length > 0 ? updatedToolCalls : undefined,
              reasoning_content: updatedReasoning
            }
          })
        )
      })
      cleanupDoneRef.current?.()
      cleanupDoneRef.current = (window as unknown as Window).api.chat.onStreamDone(
        ({ topicId }) => {
          if (currentSessionIdRef.current !== aiMessageId) return
          currentTopicIdRef.current = topicId
          setCurrentTopicId(topicId)
          refreshTopics()
          setMessages((prev) =>
            prev.map((msg) => (msg.id === aiMessageId ? { ...msg, loading: false } : msg))
          )
        }
      )

      console.log('[Chat] Sending message with providerId:', selectedProviderId)
      ;(window as unknown as Window).api.chat.startMessageStream(userMessage.content, {
        tools: selectedTools,
        images: currentImages.length > 0 ? currentImages : undefined,
        documents: currentDocuments.length > 0 ? currentDocuments : undefined,
        topicId: currentTopicIdRef.current ?? undefined,
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
    }
  }

  const handleDeleteMessagePair = async (msgIndex: number): Promise<void> => {
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
      currentTopicIdRef.current = null
      setCurrentTopicId(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend().then()
    }
  }

  const handleStop = (): void => {
    ;(window as unknown as Window).api.chat.cancelStream()
  }

  const groupedProviderOptions = useMemo(() => {
    const grouped = new Map<string, { value: number; name: string; model: string }[]>()
    for (const p of providers) {
      if (!grouped.has(p.provider)) {
        grouped.set(p.provider, [])
      }
      grouped.get(p.provider)!.push({ value: p.id, name: p.name, model: p.model })
    }
    return Array.from(grouped.entries()).map(([provider, opts]) => ({
      label: provider.charAt(0).toUpperCase() + provider.slice(1),
      options: opts.map((o) => ({
        value: o.value,
        label: o.model,
        providerType: provider
      }))
    }))
  }, [providers])

  return {
    // state
    messages,
    inputValue,
    setInputValue,
    selectedTools,
    setSelectedTools,
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
    // refs
    messagesEndRef,
    textareaRef,
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
    // handlers
    handleSelectTopic,
    handleDeleteTopic,
    handleCopy,
    handleSend,
    handleNewChat,
    handleDeleteMessagePair,
    handleKeyDown,
    handleStop
  }
}
