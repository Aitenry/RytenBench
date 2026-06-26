import React, { useState, useRef, useEffect } from 'react'
import { theme, Input, Button, Tooltip, Select, Tag } from 'antd'
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
  RiSidebarUnfoldLine
} from '@remixicon/react'
import { ChatDialogueRow, ChatTopicRow } from '../../../../main/database/mapper/chat'
import MarkdownLoad from '@renderer/components/MarkdownLoad'
import { Window, ToolInfo } from '../../../resource/types/window'
import { Collapse } from 'antd'

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
  type: 'text' | 'tool'
  text?: string
  tool?: ToolCall
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  blocks: MessageBlock[]
  timestamp: number
  toolCalls?: ToolCall[]
  loading?: boolean
}

const Index: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

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
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    ;(window as unknown as Window).api.chat.getTools().then(setAvailableTools).catch(console.error)
  }, [])

  // 加载话题列表
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

  // 选择话题并加载历史消息
  const handleSelectTopic = async (topic: ChatTopicRow): Promise<void> => {
    if (messages.some((msg) => msg.loading)) return // 正在生成中不允许切换

    currentTopicIdRef.current = topic.id
    setCurrentTopicId(topic.id)

    // 恢复工具选择
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

  // 删除话题
  const handleDeleteTopic = async (topicId: number, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
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

    // 用户消息（仅 UI，持久化由主进程处理）
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      blocks: [],
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

    // 安全兜底超时（仅设 loading=false，主进程已负责持久化）
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
      // 清理旧监听器，注册 chunk 回调
      ;(window as unknown as Window).api.chat.onStreamChunk(() => {})
      ;(window as unknown as Window).api.chat.onStreamChunk((chunk) => {
        if (currentSessionIdRef.current !== aiMessageId) {
          return
        }
        resetTimeout()

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) return msg

            const updatedContent = chunk.content ? msg.content + chunk.content : msg.content
            const updatedToolCalls = chunk.tool
              ? [...(msg.toolCalls || []), chunk.tool]
              : msg.toolCalls || []
            const updatedBlocks = [...msg.blocks]

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
              toolCalls: updatedToolCalls.length > 0 ? updatedToolCalls : undefined
            }
          })
        )
      })

      // 注册流结束回调（主进程持久化完成后通知）
      ;(window as unknown as Window).api.chat.onStreamDone(({ topicId }) => {
        if (currentSessionIdRef.current !== aiMessageId) return
        if (streamTimeoutRef.current) {
          clearTimeout(streamTimeoutRef.current)
        }
        // 更新话题 ID
        currentTopicIdRef.current = topicId
        setCurrentTopicId(topicId)
        refreshTopics()
        // 设置 loading 为 false
        setMessages((prev) =>
          prev.map((msg) => (msg.id === aiMessageId ? { ...msg, loading: false } : msg))
        )
      })

      // 发起流式请求，传递当前话题 ID（主进程负责创建/复用话题 + 保存消息）
      ;(window as unknown as Window).api.chat.startMessageStream(userMessage.content, {
        tools: selectedTools,
        topicId: currentTopicIdRef.current ?? undefined
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
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend().then()
    }
  }

  const UserMessage = ({ message }: { message: Message }): React.ReactNode => (
    <div className="flex justify-end mb-6">
      <div className="max-w-[80%]">
        <div className="bg-[#edf3fe] text-gray-800 px-5 py-3 rounded-2xl rounded-br-sm">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  )

  const AssistantMessage = ({ message }: { message: Message }): React.ReactNode => {
    const isCopied = copiedId === message.id

    if (
      message.loading &&
      !message.content &&
      (!message.toolCalls || message.toolCalls.length === 0)
    ) {
      return <LoadingMessage />
    }

    // 按时间顺序渲染 blocks（text / tool 交替）
    const renderBlocks = (): React.ReactNode => {
      if (message.blocks.length === 0) {
        // fallback: 无 blocks 时使用 content
        if (message.content) {
          return (
            <div className="text-gray-800 mb-2">
              <MarkdownLoad content={message.content} isDarkMode={false} />
            </div>
          )
        }
        return null
      }

      return message.blocks.map((block, index) => {
        if (block.type === 'text' && block.text) {
          return (
            <div key={index} className="text-gray-800 mb-2">
              <MarkdownLoad content={block.text} isDarkMode={false} />
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
                      <div className="font-medium text-gray-700 mb-1">输入：</div>
                      <pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto">
                        {JSON.stringify(block.tool.input, null, 2)}
                      </pre>
                      <div className="font-medium text-gray-700 mt-2 mb-1">输出：</div>
                      <pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto whitespace-pre-wrap">
                        {block.tool.output}
                      </pre>
                    </div>
                  )
                }
              ]}
              defaultActiveKey={[]}
              size="small"
              style={{ marginBottom: '6px' }}
              className="bg-gray-50 rounded-lg border-0"
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
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
              >
                {isCopied ? <RiCheckLine size={16} /> : <RiFileCopyLine size={16} />}
              </button>
            </Tooltip>
            <Tooltip title="点赞">
              <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700">
                <RiThumbUpLine size={16} />
              </button>
            </Tooltip>
            <Tooltip title="不喜欢">
              <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700">
                <RiThumbDownLine size={16} />
              </button>
            </Tooltip>
            <Tooltip title="重新生成">
              <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700">
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
        <div className="flex items-center gap-2 text-gray-500">
          <RiLoader4Line size={16} className="animate-spin" />
          <span>正在生成...</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex-1 flex">
      <style>{`
        .chat-scrollbar::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .chat-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .chat-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.15);
          border-radius: 4px;
          transition: background 0.2s;
        }
        .chat-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.3);
        }
        .chat-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 0, 0, 0.15) transparent;
        }
        .input-scrollbar textarea::-webkit-scrollbar {
          width: 4px;
        }
        .input-scrollbar textarea::-webkit-scrollbar-track {
          background: transparent;
        }
        .input-scrollbar textarea::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 2px;
          transition: background 0.2s;
        }
        .input-scrollbar textarea::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.2);
        }
        .input-scrollbar textarea {
          scrollbar-width: thin;
          scrollbar-color: rgba(0, 0, 0, 0.1) transparent;
        }
        .history-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .history-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .history-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 2px;
        }
        .history-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.2);
        }
      `}</style>

      {/* 历史记录侧边栏 */}
      <div
        className="flex flex-col border-r border-gray-100 transition-all duration-200 overflow-hidden"
        style={{
          width: sidebarOpen ? 260 : 0,
          minWidth: sidebarOpen ? 260 : 0,
          background: colorBgContainer,
          borderRadius: borderRadiusLG,
          marginRight: `${sidebarOpen ? '6px' : '0'}`
        }}
      >
        <div
          style={{ display: `${sidebarOpen ? 'flex' : 'none'}` }}
          className="items-center justify-between px-4 py-3 border-b border-gray-100"
        >
          <span className="text-sm font-medium text-gray-700">历史记录</span>
        </div>
        <div
          style={{ display: `${sidebarOpen ? 'block' : 'none'}` }}
          className="flex-1 overflow-y-auto py-2 history-scrollbar"
        >
          {topics.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-8">暂无历史记录</p>
          ) : (
            topics.map((topic) => (
              <div
                key={topic.id}
                onClick={() => handleSelectTopic(topic)}
                className={`group flex items-center gap-2 px-4 py-2.5 mb-1 mx-2 rounded-lg cursor-pointer transition-colors ${
                  currentTopicId === topic.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <RiHistoryLine size={16} className="shrink-0 text-gray-400" />
                <span className="flex-1 text-sm truncate">{topic.title}</span>
                <button
                  onClick={(e) => handleDeleteTopic(topic.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-50 rounded transition-all"
                >
                  <RiDeleteBin6Line size={14} className="text-gray-400 hover:text-red-500" />
                </button>
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
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Button
              type="text"
              size="small"
              icon={
                sidebarOpen ? <RiSidebarFoldLine size={16} /> : <RiSidebarUnfoldLine size={16} />
              }
              onClick={() => setSidebarOpen(!sidebarOpen)}
            />
            <span className="text-sm text-gray-500">
              {currentTopicId ? `对话 #${currentTopicId}` : '新对话'}
            </span>
          </div>
          <Button type="text" size="small" icon={<RiAddLine size={16} />} onClick={handleNewChat}>
            新对话
          </Button>
        </div>
        <div className="flex-1 overflow-y-scroll my-1 mr-1 ml-3 px-16 py-8 chat-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">你好！</h1>
              <p className="text-gray-500 text-center max-w-md">
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
            <div className="bg-gray-50 rounded-2xl border border-gray-200 input-scrollbar">
              <div className="p-4">
                <Input.TextArea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="给 RytenBench 发送消息"
                  autoSize={{ minRows: 1, maxRows: 8 }}
                  disabled={messages.some((msg) => msg.loading)}
                  className="bg-transparent border-none focus:shadow-none resize-none text-gray-800"
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
              <div className="flex items-center justify-between px-4 pb-4">
                <div className="flex items-center gap-2">
                  <Select
                    mode="multiple"
                    placeholder="选择工具"
                    value={selectedTools}
                    onChange={setSelectedTools}
                    style={{ minWidth: 140, padding: '6px', borderRadius: '10px' }}
                    size="small"
                    allowClear
                    maxTagCount={1}
                    maxTagPlaceholder={(omitted) => <span>+{omitted.length}</span>}
                    optionRender={(option) => {
                      const tool = availableTools.find((t) => t.name === option.value)
                      if (!tool) return option.label as React.ReactNode
                      return (
                        <div className="flex items-center gap-2">
                          <span
                            style={{
                              color: tool.color
                            }}
                          >
                            {toolIconMap[tool.icon]}
                          </span>
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
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="primary"
                    shape="circle"
                    size="small"
                    icon={<RiArrowUpLine size={16} />}
                    onClick={handleSend}
                    disabled={!inputValue.trim() || messages.some((msg) => msg.loading)}
                    className={`w-8 h-8 ${inputValue.trim() && !messages.some((msg) => msg.loading) ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-300'}`}
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
