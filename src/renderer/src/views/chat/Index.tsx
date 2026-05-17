import React, { useState, useRef, useEffect } from 'react'
import { theme, Input, Button, Tooltip } from 'antd'
import {
  RiArrowUpLine,
  RiLoader4Line,
  RiFileCopyLine,
  RiCheckLine,
  RiThumbUpLine,
  RiThumbDownLine,
  RiRefreshLine,
  RiSparklingLine,
  RiSearchAi2Line
} from '@remixicon/react'
import MarkdownLoad from '@renderer/components/MarkdownLoad'
import { Window } from '../../../resource/types/window'
import { Collapse } from 'antd'
import type { CollapseProps } from 'antd'

interface ToolCall {
  name: string
  input: object
  output: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
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
  const [isDeepThinking, setIsDeepThinking] = useState(false)
  const [isSmartSearch, setIsSmartSearch] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const streamTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentSessionIdRef = useRef<string | null>(null)

  const scrollToBottom = (): void => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    // 组件卸载时清理超时和监听器
    return () => {
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current)
      }
      // 清理之前的监听器
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
    // 检查是否有正在加载的消息
    const hasLoadingMessage = messages.some((msg) => msg.loading)
    if (!inputValue.trim() || hasLoadingMessage) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: Date.now()
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')

    // 初始化 AI 消息和当前会话 ID
    const aiMessageId = (Date.now() + 1).toString()
    currentSessionIdRef.current = aiMessageId

    const initialAiMessage: Message = {
      id: aiMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
      loading: true
    }
    setMessages((prev) => [...prev, initialAiMessage])

    // 清除之前的超时
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current)
    }

    // 设置超时，5秒后自动结束加载状态
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
      // 清理之前的监听器
      ;(window as unknown as Window).api.chat.onStreamChunk(() => {})

      // 注册新的流式回调
      ;(window as unknown as Window).api.chat.onStreamChunk((chunk) => {
        // 检查是否是当前会话的消息
        if (currentSessionIdRef.current !== aiMessageId) {
          return
        }
        // 每次收到块时重置超时
        resetTimeout()

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== aiMessageId) return msg

            let updatedContent = msg.content
            let updatedToolCalls = msg.toolCalls || []

            if (chunk.content) {
              updatedContent += chunk.content
            }

            if (chunk.tool) {
              updatedToolCalls = [
                ...updatedToolCalls,
                {
                  name: chunk.tool.name,
                  input: chunk.tool.input,
                  output: chunk.tool.output
                }
              ]
            }

            return {
              ...msg,
              content: updatedContent,
              toolCalls: updatedToolCalls.length > 0 ? updatedToolCalls : undefined,
              loading: false
            }
          })
        )
      })

      // 启动流式请求
      ;(window as unknown as Window).api.chat.startMessageStream(userMessage.content, {
        deepThinking: isDeepThinking,
        smartSearch: isSmartSearch
      })

      // 启动初始超时
      resetTimeout()
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage: Message = {
        id: aiMessageId,
        role: 'assistant',
        content: '抱歉，发生了错误，请稍后重试。',
        timestamp: Date.now(),
        loading: false
      }
      setMessages((prev) => prev.map((msg) => (msg.id === aiMessageId ? errorMessage : msg)))
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current)
      }
    }
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

    // 如果消息正在加载，显示加载状态
    if (
      message.loading &&
      !message.content &&
      (!message.toolCalls || message.toolCalls.length === 0)
    ) {
      return <LoadingMessage />
    }

    // 构建折叠面板的 items
    const collapseItems: CollapseProps['items'] =
      message.toolCalls?.map((tool, index) => ({
        key: index,
        label: `${tool.name}`,
        children: (
          <div>
            <div className="font-medium text-gray-700 mb-1">输入：</div>
            <pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
            <div className="font-medium text-gray-700 mt-2 mb-1">输出：</div>
            <pre className="bg-gray-100 p-2 rounded text-sm overflow-x-auto whitespace-pre-wrap">
              {tool.output}
            </pre>
          </div>
        )
      })) || []

    return (
      <div className="flex mb-6">
        <div className="max-w-[85%] w-full">
          {/* 工具调用折叠面板 */}
          {collapseItems.length > 0 && (
            <Collapse
              items={collapseItems}
              defaultActiveKey={[]}
              size="small"
              style={{ marginBottom: '6px' }}
              className="bg-gray-50 rounded-lg border-0"
            />
          )}
          {/* 主要内容 */}
          <div className="text-gray-800">
            <MarkdownLoad content={message.content} isDarkMode={false} />
          </div>
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
        <div className="text-gray-800">
          {isDeepThinking && (
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <RiSparklingLine size={16} className="animate-pulse" />
              <span>深度思考中...</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <RiLoader4Line size={16} className="animate-spin text-gray-500" />
            <span className="text-gray-500">正在生成...</span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="h-full flex-1 flex flex-col">
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
      `}</style>
      <main
        className="w-full flex-1 flex flex-col overflow-hidden"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      >
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
                  <Button
                    type={isDeepThinking ? 'primary' : 'default'}
                    size="small"
                    shape="round"
                    icon={<RiSparklingLine size={14} />}
                    onClick={() => setIsDeepThinking(!isDeepThinking)}
                    className={`rounded-full ${isDeepThinking ? 'bg-blue-600' : ''}`}
                  >
                    深度思考
                  </Button>
                  <Button
                    type={isSmartSearch ? 'primary' : 'default'}
                    size="small"
                    shape="round"
                    icon={<RiSearchAi2Line size={14} />}
                    onClick={() => setIsSmartSearch(!isSmartSearch)}
                    className={`rounded-full ${isSmartSearch ? 'bg-blue-600' : ''}`}
                  >
                    智能搜索
                  </Button>
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
