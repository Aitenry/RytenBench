import React, { useState, useRef, useEffect, useMemo } from 'react'
import { theme, Input, Button, Tooltip, Select, Tag, Dropdown } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import {
  RiArrowUpLine,
  RiLoader4Line,
  RiFileCopyLine,
  RiCheckLine,
  RiThumbUpLine,
  RiThumbDownLine,
  RiRefreshLine,
  RiSunCloudyLine,
  RiTimeLine,
  RiAddLine,
  RiHistoryLine,
  RiDeleteBin6Line,
  RiSidebarFoldLine,
  RiSidebarUnfoldLine,
  RiAttachment2,
  RiCloseLine,
  RiMoreLine
} from '@remixicon/react'
import { ChatDialogueRow, ChatTopicRow } from '../../../../main/database/mapper/chat'
import { LlmProviderConfig } from '../../../../main/database/mapper/provider'
import MarkdownLoad from '@renderer/components/MarkdownLoad'
import { Window, ToolInfo } from '../../../resource/types/window'
import { Collapse } from 'antd'
import { useTheme } from '@renderer/contexts/ThemeContext'

const toolIconMap: Record<string, React.ReactNode> = {
  RiSunCloudyLine: <RiSunCloudyLine size={16} />,
  RiTimeLine: <RiTimeLine size={16} />
}

interface ToolCall {
  name: string
  input: object
  output: string
}

interface MessageBlock {
  type: 'text' | 'tool' | 'reasoning' | 'image' | 'document'
  text?: string
  tool?: ToolCall
  reasoning?: string
  image_url?: string
  fileName?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  blocks: MessageBlock[]
  timestamp: number
  toolCalls?: ToolCall[]
  loading?: boolean
  reasoning_content?: string
}

interface Attachment {
  dataUrl: string
  fileName: string
  isImage: boolean
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
  const streamTimeoutRef = useRef<NodeJS.Timeout | null>(null)
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
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current)
      }
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

    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current)
    }

    const resetTimeout = (): void => {
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current)
      }
      streamTimeoutRef.current = setTimeout(() => {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === aiMessageId ? { ...msg, loading: false } : msg))
        )
      }, 5000)
    }

    try {
      ;(window as unknown as Window).api.chat.onStreamChunk(() => {})
      ;(window as unknown as Window).api.chat.onStreamChunk((chunk) => {
        if (currentSessionIdRef.current !== aiMessageId) {
          return
        }
        resetTimeout()

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
              updatedBlocks.push({
                type: 'tool',
                tool: {
                  name: chunk.tool.name,
                  input: chunk.tool.input,
                  output: chunk.tool.output
                }
              })
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
        if (streamTimeoutRef.current) {
          clearTimeout(streamTimeoutRef.current)
        }
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

      resetTimeout()
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
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current)
      }
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend().then()
    }
  }

  const UserMessage = ({ message }: { message: Message }): React.ReactNode => {
    const imageBlocks = message.blocks.filter((b) => b.type === 'image' && b.image_url)
    const documentBlocks = message.blocks.filter((b) => b.type === 'document' && b.fileName)

    return (
      <div className="flex justify-end mb-6">
        <div className="max-w-[80%]">
          <div
            style={{
              background: isDarkMode ? '#1a3a5c' : '#edf3fe',
              color: colorText
            }}
            className="px-5 py-3 rounded-2xl rounded-br-sm"
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
          {imageBlocks.length > 0 && (
            <div className="flex gap-2 mt-2 justify-end flex-wrap">
              {imageBlocks.map((b, idx) => (
                <img
                  key={idx}
                  src={b.image_url}
                  alt={`user-img-${idx}`}
                  className="max-w-[200px] max-h-[200px] object-cover rounded-lg"
                  style={{ border: `1px solid ${colorBorderSecondary}` }}
                />
              ))}
            </div>
          )}
          {documentBlocks.length > 0 && (
            <div className="flex gap-2 mt-2 justify-end flex-wrap">
              {documentBlocks.map((b, idx) => (
                <Tag key={idx} color="blue" className="px-3 py-1 text-sm rounded-lg">
                  <div className="inline-flex items-center py-1 gap-1">
                    <RiAttachment2 size={14} /> <span>{b.fileName}</span>
                  </div>
                </Tag>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  const AssistantMessage = ({ message }: { message: Message }): React.ReactNode => {
    const isCopied = copiedId === message.id

    if (
      message.loading &&
      !message.content &&
      !message.reasoning_content &&
      (!message.toolCalls || message.toolCalls.length === 0)
    ) {
      return <LoadingMessage />
    }

    const codeBg = isDarkMode ? 'rgba(255,255,255,0.06)' : '#f3f4f6'
    const collapseBg = isDarkMode ? 'rgba(255,255,255,0.04)' : '#f9fafb'

    const renderBlocks = (): React.ReactNode => {
      if (message.blocks.length === 0) {
        if (message.content) {
          return (
            <div style={{ color: colorText }} className="mb-2">
              <MarkdownLoad content={message.content} isDarkMode={isDarkMode} />
            </div>
          )
        }
        return null
      }

      return message.blocks.map((block, index) => {
        if (block.type === 'reasoning' && block.reasoning) {
          const hasTextAfter = message.blocks.slice(index + 1).some((b) => b.type === 'text')
          const thinkingLabel = hasTextAfter ? '思考过程' : '思考中…'
          return (
            <Collapse
              key={`${index}-${hasTextAfter ? 'done' : 'thinking'}`}
              items={[
                {
                  key: index,
                  label: (
                    <span style={{ color: colorTextTertiary }} className="text-xs">
                      {thinkingLabel}
                    </span>
                  ),
                  children: (
                    <div
                      style={{ color: colorTextSecondary, borderColor: colorBorderSecondary }}
                      className="text-sm whitespace-pre-wrap border-l-2 pl-3"
                    >
                      {block.reasoning}
                    </div>
                  )
                }
              ]}
              defaultActiveKey={hasTextAfter ? [] : [index]}
              size="small"
              style={{ marginBottom: '6px', background: collapseBg }}
              className="rounded-lg border-0"
            />
          )
        }
        if (block.type === 'text' && block.text) {
          return (
            <div key={index} style={{ color: colorText }} className="mb-2">
              <MarkdownLoad content={block.text} isDarkMode={isDarkMode} />
            </div>
          )
        }
        if (block.type === 'tool' && block.tool) {
          return (
            <Collapse
              key={index}
              items={[
                {
                  key: index,
                  label: `${block.tool.name}`,
                  children: (
                    <div>
                      <div style={{ color: colorTextSecondary }} className="font-medium mb-1">
                        输入：
                      </div>
                      <pre
                        style={{ background: codeBg }}
                        className="p-2 rounded text-sm overflow-x-auto"
                      >
                        {JSON.stringify(block.tool.input, null, 2)}
                      </pre>
                      <div style={{ color: colorTextSecondary }} className="font-medium mt-2 mb-1">
                        输出：
                      </div>
                      <pre
                        style={{ background: codeBg }}
                        className="p-2 rounded text-sm overflow-x-auto whitespace-pre-wrap"
                      >
                        {block.tool.output}
                      </pre>
                    </div>
                  )
                }
              ]}
              defaultActiveKey={[]}
              size="small"
              style={{ marginBottom: '6px', background: collapseBg }}
              className="rounded-lg border-0"
            />
          )
        }
        return null
      })
    }

    return (
      <div className="flex mb-6">
        <div className="max-w-[85%] w-full">
          {renderBlocks()}
          <div className="flex items-center gap-2 mt-3">
            <Tooltip title={isCopied ? '已复制' : '复制'}>
              <button
                onClick={() => handleCopy(message.content, message.id)}
                className="p-1.5 rounded-lg transition-colors"
                style={{
                  color: colorTextTertiary,
                  background: 'transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colorFillAlter
                  e.currentTarget.style.color = colorTextSecondary
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = colorTextTertiary
                }}
              >
                {isCopied ? <RiCheckLine size={16} /> : <RiFileCopyLine size={16} />}
              </button>
            </Tooltip>
            <Tooltip title="点赞">
              <button
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: colorTextTertiary, background: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colorFillAlter
                  e.currentTarget.style.color = colorTextSecondary
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = colorTextTertiary
                }}
              >
                <RiThumbUpLine size={16} />
              </button>
            </Tooltip>
            <Tooltip title="不喜欢">
              <button
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: colorTextTertiary, background: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colorFillAlter
                  e.currentTarget.style.color = colorTextSecondary
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = colorTextTertiary
                }}
              >
                <RiThumbDownLine size={16} />
              </button>
            </Tooltip>
            <Tooltip title="重新生成">
              <button
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: colorTextTertiary, background: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colorFillAlter
                  e.currentTarget.style.color = colorTextSecondary
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = colorTextTertiary
                }}
              >
                <RiRefreshLine size={16} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    )
  }

  const LoadingMessage = (): React.ReactNode => (
    <div className="flex mb-6">
      <div className="max-w-[85%]">
        <div className="flex items-center gap-2" style={{ color: colorTextSecondary }}>
          <RiLoader4Line size={16} className="animate-spin" />
          <span>正在生成...</span>
        </div>
      </div>
    </div>
  )

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

  // 主题自适应滚动条颜色
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

      {/* 历史记录侧边栏 */}
      <div
        className="flex flex-col transition-all duration-200 overflow-hidden"
        style={{
          width: sidebarOpen ? 260 : 0,
          minWidth: sidebarOpen ? 260 : 0,
          background: colorBgContainer,
          borderRadius: borderRadiusLG,
          marginRight: sidebarOpen ? '6px' : '0',
          borderRight: `1px solid ${colorBorderSecondary}`
        }}
      >
        <div
          style={{ display: sidebarOpen ? 'flex' : 'none' }}
          className="items-center justify-between px-4 py-3"
        >
          <span className="text-sm font-medium" style={{ color: colorTextSecondary }}>
            历史记录
          </span>
        </div>
        <div
          style={{ display: sidebarOpen ? 'block' : 'none' }}
          className="flex-1 overflow-y-auto py-2 history-scrollbar"
        >
          {topics.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: colorTextTertiary }}>
              暂无历史记录
            </p>
          ) : (
            topics.map((topic) => (
              <div
                key={topic.id}
                onClick={() => handleSelectTopic(topic)}
                className="group flex items-center gap-2 px-4 py-2.5 mb-1 mx-2 rounded-lg cursor-pointer transition-colors"
                style={{
                  color: colorText,
                  background:
                    currentTopicId === topic.id
                      ? isDarkMode
                        ? '#1a2744'
                        : '#eff6ff'
                      : 'transparent'
                }}
                onMouseEnter={(e) => {
                  if (currentTopicId !== topic.id) e.currentTarget.style.background = colorFillAlter
                }}
                onMouseLeave={(e) => {
                  if (currentTopicId !== topic.id) e.currentTarget.style.background = 'transparent'
                }}
              >
                <RiHistoryLine
                  size={16}
                  className="shrink-0"
                  style={{ color: colorTextTertiary }}
                />
                <span className="flex-1 text-sm truncate">{topic.title}</span>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'delete',
                        label: '删除对话',
                        danger: true,
                        icon: <RiDeleteBin6Line size={14} />,
                        onClick: () => handleDeleteTopic(topic.id)
                      }
                    ]
                  }}
                  trigger={['click']}
                  placement="bottomRight"
                >
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all"
                    onMouseEnter={(e) => (e.currentTarget.style.background = colorFillAlter)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <RiMoreLine size={16} style={{ color: colorTextTertiary }} />
                  </button>
                </Dropdown>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 主聊天区域 */}
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
              showSearch
              popupMatchSelectWidth={false}
              popupStyle={{ minWidth: 260 }}
              filterOption={(input, option) =>
                (option?.label as string)?.toLowerCase().includes(input.toLowerCase()) ?? false
              }
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
              {messages.map((message) =>
                message.role === 'user' ? (
                  <UserMessage key={message.id} message={message} />
                ) : (
                  <AssistantMessage key={message.id} message={message} />
                )
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="px-16 pb-8">
          <div className="max-w-4xl mx-auto">
            <div
              className="rounded-2xl input-scrollbar"
              style={{
                background: colorBgLayout,
                border: `1px solid ${colorBorder}`
              }}
            >
              <div className="p-4">
                <Input.TextArea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="给 RytenBench 发送消息"
                  autoSize={{ minRows: 1, maxRows: 8 }}
                  disabled={messages.some((msg) => msg.loading)}
                  style={{ color: colorText }}
                  styles={{
                    textarea: {
                      backgroundColor: 'transparent',
                      border: 'none',
                      boxShadow: 'none',
                      padding: 0,
                      minHeight: '24px',
                      maxHeight: '200px'
                    }
                  }}
                />
              </div>
              {attachments.length > 0 && (
                <div className="flex gap-2 px-4 pb-3 flex-wrap">
                  {attachments.map((att, idx) =>
                    att.isImage ? (
                      <div key={idx} className="relative group">
                        <img
                          src={att.dataUrl}
                          alt={`upload-${idx}`}
                          className="w-16 h-16 object-cover rounded-lg"
                          style={{ border: `1px solid ${colorBorderSecondary}` }}
                        />
                        <button
                          onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <RiCloseLine size={12} />
                        </button>
                      </div>
                    ) : (
                      <div
                        key={idx}
                        className="relative group flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg"
                        style={{
                          background: isDarkMode ? '#1a2744' : '#eff6ff',
                          color: isDarkMode ? '#93c5fd' : '#1d4ed8',
                          border: isDarkMode ? '1px solid #1e3a5f' : '1px solid #bfdbfe'
                        }}
                      >
                        <span className="max-w-[120px] truncate">{att.fileName}</span>
                        <button
                          onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                          className="ml-1 hover:text-red-500"
                          style={{ color: isDarkMode ? '#60a5fa' : '#60a5fa' }}
                        >
                          <RiCloseLine size={14} />
                        </button>
                      </div>
                    )
                  )}
                </div>
              )}
              <div className="flex items-center justify-between px-4 pb-4">
                <div className="flex items-center gap-2">
                  <Tooltip
                    title={modelSupportsVision ? '上传附件（含图片）' : '上传附件（不含图片）'}
                  >
                    <Button
                      type="dashed"
                      shape="circle"
                      icon={<RiAttachment2 size={16} />}
                      onClick={async () => {
                        const result = await (window as unknown as Window).api.file.selectImageFile(
                          modelSupportsVision
                        )
                        if (result) {
                          setAttachments((prev) => [
                            ...prev,
                            {
                              dataUrl: result.dataUrl,
                              fileName: result.fileName,
                              isImage: result.isImage
                            }
                          ])
                        }
                      }}
                    />
                  </Tooltip>
                  <Tooltip
                    title={
                      modelSupportsTools
                        ? '选择工具'
                        : '当前模型不支持工具调用，请切换至支持 Tools 标签的模型'
                    }
                  >
                    <Select
                      mode="multiple"
                      placeholder="选择工具"
                      value={selectedTools}
                      onChange={setSelectedTools}
                      style={{ minWidth: 140, padding: '6px', borderRadius: '10px' }}
                      size="small"
                      allowClear
                      disabled={!modelSupportsTools}
                      maxTagCount={1}
                      maxTagPlaceholder={(omitted) => <span>+{omitted.length}</span>}
                      optionRender={(option) => {
                        const tool = availableTools.find((t) => t.name === option.value)
                        if (!tool) return option.label as React.ReactNode
                        return (
                          <div className="flex items-center gap-2">
                            <span style={{ color: tool.color }}>{toolIconMap[tool.icon]}</span>
                            <span>{tool.label}</span>
                          </div>
                        )
                      }}
                      tagRender={(props) => {
                        const tool = availableTools.find((t) => t.name === props.value)
                        const { label, closable, onClose } = props
                        return (
                          <Tag
                            closable={closable}
                            onClose={onClose}
                            style={{
                              marginInlineEnd: 4,
                              background: tool ? `${tool.color}12` : undefined,
                              border: tool ? `1px solid ${tool.color}30` : undefined,
                              color: tool?.color,
                              borderRadius: 12,
                              paddingInline: 8,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between'
                            }}
                          >
                            <span style={{ marginRight: 4 }}>
                              {tool ? toolIconMap[tool.icon] : null}
                            </span>
                            {label}
                          </Tag>
                        )
                      }}
                      options={availableTools.map((t) => ({
                        value: t.name,
                        label: t.label,
                        icon: t.icon,
                        color: t.color
                      }))}
                    />
                  </Tooltip>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="primary"
                    shape="circle"
                    icon={<RiArrowUpLine size={16} />}
                    onClick={handleSend}
                    disabled={!inputValue.trim() || messages.some((msg) => msg.loading)}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default Index
