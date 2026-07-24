import React, { useState, useRef, useEffect, useMemo } from 'react'
import { theme, Button, Select } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { RiAddLine, RiSidebarFoldLine, RiSidebarUnfoldLine } from '@remixicon/react'
import { ChatDialogueRow, ChatTopicRow } from '../../../../main/database/mapper/chat'
import { LlmProviderConfig } from '../../../../main/database/mapper/provider'
import { Window, ToolInfo } from '../../../resource/types/window'
import { useTheme } from '@renderer/contexts/useTheme'
import type { Message, Attachment, ToolCall } from '@renderer/types/chat'
import ChatSidebar from './components/ChatSidebar'
import ChatInput from './components/ChatInput'
import UserMessage from './components/messages/UserMessage'
import AssistantMessage from './components/messages/AssistantMessage'

/** 判断工具块与工具事件是否为同一次调用：优先按 callId 精确匹配，缺 ID 时回退按名称 */
const isSameToolCall = (blockTool: ToolCall, incoming: { id?: string; name: string }): boolean => {
  if (blockTool.id && incoming.id) return blockTool.id === incoming.id
  return blockTool.name === incoming.name || blockTool.name === ''
}

const Index: React.FC = () => {
  const {
    token: {
      colorBgContainer,
      borderRadiusLG,
      colorBgLayout,
      colorFillAlter,
      colorText,
      colorTextSecondary,
      colorTextTertiary,
      colorBorder,
      colorBorderSecondary
    }
  } = theme.useToken()
  const { effectiveTheme } = useTheme()
  const isDarkMode = effectiveTheme === 'dark'

  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<TextAreaRef>(null)
  const currentSessionIdRef = useRef<string | null>(null)
  const currentTopicIdRef = useRef<number | null>(null)
  const [currentTopicId, setCurrentTopicId] = useState<number | null>(null)
  const [topics, setTopics] = useState<ChatTopicRow[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [providers, setProviders] = useState<LlmProviderConfig[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])

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
      ;(window as unknown as Window).api.chat.onStreamChunk(() => {})
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
      ;(window as unknown as Window).api.chat.onStreamChunk(() => {})
      ;(window as unknown as Window).api.chat.onStreamChunk((chunk) => {
        if (currentSessionIdRef.current !== aiMessageId) {
          return
        }

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) return msg

            const updatedReasoning = chunk.reasoning_content
              ? (msg.reasoning_content || '') + chunk.reasoning_content
              : msg.reasoning_content
            const updatedContent = chunk.content ? msg.content + chunk.content : msg.content
            const updatedToolCalls = chunk.tool
              ? [...(msg.toolCalls || []), chunk.tool]
              : msg.toolCalls || []
            const updatedBlocks = [...msg.blocks]

            if (chunk.reasoning_content) {
              const lastBlock = updatedBlocks[updatedBlocks.length - 1]
              if (lastBlock && lastBlock.type === 'reasoning') {
                updatedBlocks[updatedBlocks.length - 1] = {
                  type: 'reasoning',
                  reasoning: (lastBlock.reasoning || '') + chunk.reasoning_content
                }
              } else {
                updatedBlocks.push({ type: 'reasoning', reasoning: chunk.reasoning_content })
              }
            }

            if (chunk.content) {
              const lastBlock = updatedBlocks[updatedBlocks.length - 1]
              if (lastBlock && lastBlock.type === 'text') {
                updatedBlocks[updatedBlocks.length - 1] = {
                  type: 'text',
                  text: (lastBlock.text || '') + chunk.content
                }
              } else {
                updatedBlocks.push({ type: 'text', text: chunk.content })
              }
            }

            if (chunk.tool) {
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
                // 后续进度 chunk 仅用于保活，已存在对应 preparing 块则跳过
                const exists = updatedBlocks.some(
                  (b) =>
                    b.type === 'tool' &&
                    b.tool?.status === 'preparing' &&
                    isSameToolCall(b.tool, chunk.tool as ToolCall)
                )
                if (!exists) {
                  updatedBlocks.push({
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
                  updatedBlocks.push({
                    type: 'tool',
                    tool: {
                      name: chunk.tool.name,
                      input: chunk.tool.input,
                      output: chunk.tool.output,
                      status: chunk.tool.status || 'executing',
                      id: chunk.tool.id
                    }
                  })
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
        )
      })
      ;(window as unknown as Window).api.chat.onStreamDone(({ topicId }) => {
        if (currentSessionIdRef.current !== aiMessageId) return
        currentTopicIdRef.current = topicId
        setCurrentTopicId(topicId)
        refreshTopics()
        setMessages((prev) =>
          prev.map((msg) => (msg.id === aiMessageId ? { ...msg, loading: false } : msg))
        )
      })

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

  const handleNewChat = (): void => {
    setMessages([])
    setCurrentTopicId(null)
    currentTopicIdRef.current = null
    setInputValue('')
    setSelectedTools([])
    setAttachments([])
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
        label: `${o.name} : ${o.model}`,
        providerType: provider
      }))
    }))
  }, [providers])

  const scrollbarThumbColor = isDarkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
  const scrollbarThumbHoverColor = isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
  const inputScrollbarThumbColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const inputScrollbarThumbHoverColor = isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'

  return (
    <div className="h-full flex-1 flex">
      <style>{`
        .chat-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .chat-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .chat-scrollbar::-webkit-scrollbar-thumb {
          background: ${scrollbarThumbColor};
          border-radius: 4px;
          transition: background 0.2s;
        }
        .chat-scrollbar::-webkit-scrollbar-thumb:hover { background: ${scrollbarThumbHoverColor}; }
        .chat-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: ${scrollbarThumbColor} transparent;
        }
        .input-scrollbar textarea::-webkit-scrollbar { width: 4px; }
        .input-scrollbar textarea::-webkit-scrollbar-track { background: transparent; }
        .input-scrollbar textarea::-webkit-scrollbar-thumb {
          background: ${inputScrollbarThumbColor};
          border-radius: 2px;
          transition: background 0.2s;
        }
        .input-scrollbar textarea::-webkit-scrollbar-thumb:hover { background: ${inputScrollbarThumbHoverColor}; }
        .input-scrollbar textarea {
          scrollbar-width: thin;
          scrollbar-color: ${inputScrollbarThumbColor} transparent;
        }
        .history-scrollbar::-webkit-scrollbar { width: 4px; }
        .history-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .history-scrollbar::-webkit-scrollbar-thumb {
          background: ${inputScrollbarThumbColor};
          border-radius: 2px;
        }
        .history-scrollbar::-webkit-scrollbar-thumb:hover { background: ${inputScrollbarThumbHoverColor}; }
      `}</style>

      <ChatSidebar
        sidebarOpen={sidebarOpen}
        topics={topics}
        currentTopicId={currentTopicId}
        isDarkMode={isDarkMode}
        colorBgContainer={colorBgContainer}
        borderRadiusLG={borderRadiusLG}
        colorBorderSecondary={colorBorderSecondary}
        colorText={colorText}
        colorTextSecondary={colorTextSecondary}
        colorTextTertiary={colorTextTertiary}
        colorFillAlter={colorFillAlter}
        onSelectTopic={handleSelectTopic}
        onDeleteTopic={handleDeleteTopic}
      />

      <main
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      >
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderBottom: `1px solid ${colorBorderSecondary}` }}
        >
          <div className="flex items-center gap-2">
            <Button
              type="text"
              size="small"
              icon={
                sidebarOpen ? <RiSidebarFoldLine size={16} /> : <RiSidebarUnfoldLine size={16} />
              }
              onClick={() => setSidebarOpen(!sidebarOpen)}
            />
            <Select
              size="small"
              value={selectedProviderId}
              onChange={(value) => setSelectedProviderId(value)}
              style={{ minWidth: 100 }}
              placeholder="选择模型"
              showSearch={{
                filterOption: (input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
              }}
              popupMatchSelectWidth={false}
              popupStyle={{ minWidth: 260 }}
              options={groupedProviderOptions}
            />
          </div>
          <Button type="text" size="small" icon={<RiAddLine size={16} />} onClick={handleNewChat} />
        </div>
        <div className="flex-1 overflow-y-scroll my-1 mr-1 ml-3 px-16 py-8 chat-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <h1 className="text-2xl font-semibold mb-2" style={{ color: colorText }}>
                你好！
              </h1>
              <p className="text-center max-w-md" style={{ color: colorTextSecondary }}>
                我是 RytenBench AI 助手，有什么我可以帮你的吗？
              </p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {messages.map((message, idx) =>
                message.role === 'user' ? (
                  <UserMessage
                    key={message.id}
                    message={message}
                    isDarkMode={isDarkMode}
                    colorText={colorText}
                    colorBorderSecondary={colorBorderSecondary}
                  />
                ) : (
                  <AssistantMessage
                    key={message.id}
                    message={message}
                    index={idx}
                    isDarkMode={isDarkMode}
                    copiedId={copiedId}
                    colorText={colorText}
                    colorTextSecondary={colorTextSecondary}
                    colorTextTertiary={colorTextTertiary}
                    colorFillAlter={colorFillAlter}
                    colorBorderSecondary={colorBorderSecondary}
                    onCopy={handleCopy}
                    onDelete={handleDeleteMessagePair}
                  />
                )
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="px-16 pb-8">
          <div className="max-w-4xl mx-auto">
            <ChatInput
              inputValue={inputValue}
              onInputChange={setInputValue}
              textareaRef={textareaRef}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              isLoading={messages.some((msg) => msg.loading)}
              selectedTools={selectedTools}
              onSelectedToolsChange={setSelectedTools}
              availableTools={availableTools}
              modelSupportsTools={modelSupportsTools}
              modelSupportsVision={modelSupportsVision}
              isDarkMode={isDarkMode}
              colorBgLayout={colorBgLayout}
              colorBorder={colorBorder}
              colorText={colorText}
              colorBorderSecondary={colorBorderSecondary}
              onSend={handleSend}
              onStop={handleStop}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default Index
