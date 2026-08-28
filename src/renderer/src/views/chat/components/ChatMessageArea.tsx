import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Spin } from 'antd'
import type { Message } from '@renderer/types/chat'
import UserMessage from './messages/UserMessage'
import AssistantMessage from './messages/AssistantMessage'
import ScrollToBottomButton from './ScrollToBottomButton'

interface ChatMessageAreaProps {
  messages: Message[]
  isDarkMode: boolean
  /** 当前话题是否正在流式输出（驱动贴底跟随与按钮旋转光圈） */
  streaming: boolean
  /** 当前话题 id：切换话题 / 新建会话时重置为贴底状态 */
  currentTopicId: number | null
  colorText: string
  colorTextSecondary: string
  colorTextTertiary: string
  colorFillAlter: string
  colorBorderSecondary: string
  titleDisplayed: string
  titleDone: boolean
  subtitleDisplayed: string
  subtitleDone: boolean
  copiedId: string | null
  /** 分页 */
  hasMoreMessages: boolean
  isLoadingMoreMessages: boolean
  onCopy: (text: string, id: string) => Promise<void>
  onDelete: (msgIndex: number) => Promise<void>
  onLoadMoreMessages: () => void
  messagesEndRef: React.RefObject<HTMLDivElement | null>
}

/** 距离底部小于该值视为「贴底」 */
const STICK_THRESHOLD = 10
/** 点击按钮后平滑滚动期间（ms）：期间的 scroll 事件视为程序滚动，不算用户打断 */
const PROGRAMMATIC_WINDOW = 600

const ChatMessageArea: React.FC<ChatMessageAreaProps> = ({
  messages,
  isDarkMode,
  streaming,
  currentTopicId,
  colorText,
  colorTextSecondary,
  colorTextTertiary,
  colorFillAlter,
  colorBorderSecondary,
  titleDisplayed,
  titleDone,
  subtitleDisplayed,
  subtitleDone,
  copiedId,
  hasMoreMessages,
  isLoadingMoreMessages,
  onCopy,
  onDelete,
  onLoadMoreMessages,
  messagesEndRef
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef(0)
  const prevMessagesLengthRef = useRef(0)

  /** 贴底跟随开关：true 时新内容自动滚到底部；用户上滑阅读历史时关闭，回到底部或点击按钮恢复 */
  const stickToBottomRef = useRef(true)
  /** 按钮平滑滚动的生效窗口：期间产生的 scroll 事件不算用户打断 */
  const programmaticUntilRef = useRef(0)
  const [atBottom, setAtBottom] = useState(true)

  // 切换话题 / 新建会话后，默认回到最新位置
  useEffect(() => {
    stickToBottomRef.current = true
    setAtBottom(true)
  }, [currentTopicId])

  // 加载更多历史消息后，保持滚动位置不跳动
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const prevLen = prevMessagesLengthRef.current
    const newLen = messages.length
    if (newLen > prevLen && prevLen > 0) {
      // 有新消息被 prepend 到头部，补偿滚动位置
      const newScrollHeight = el.scrollHeight
      const delta = newScrollHeight - prevScrollHeightRef.current
      el.scrollTop += delta
    }
    prevScrollHeightRef.current = el.scrollHeight
    prevMessagesLengthRef.current = messages.length
  }, [messages])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    const nearBottom = distFromBottom <= STICK_THRESHOLD
    setAtBottom(nearBottom)
    if (nearBottom) {
      // 用户自己滚回底部：恢复贴底跟随
      stickToBottomRef.current = true
    } else if (Date.now() >= programmaticUntilRef.current) {
      // 用户主动上滑阅读：打断持续滚动到底部
      stickToBottomRef.current = false
    }
    if (!isLoadingMoreMessages && hasMoreMessages && el.scrollTop <= 40) {
      onLoadMoreMessages()
    }
  }, [isLoadingMoreMessages, hasMoreMessages, onLoadMoreMessages])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // 新消息 / 流式 chunk：贴底跟随滚动（用户上滑阅读时 stick=false，不打扰）
  useEffect(() => {
    if (!stickToBottomRef.current) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  // 内容异步长高（图片 / mermaid 渲染等）：贴底时保持钉在底部
  useEffect(() => {
    const el = scrollRef.current
    const inner = contentRef.current
    if (!el || !inner) return
    const ro = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        el.scrollTop = el.scrollHeight
      }
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [])

  const handleScrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickToBottomRef.current = true
    setAtBottom(true)
    programmaticUntilRef.current = Date.now() + PROGRAMMATIC_WINDOW
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

  // 流式输出时按钮常驻（光圈即「生成中」指示）；平时仅在离开底部时出现
  const showScrollButton = messages.length > 0 && (!atBottom || streaming)

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={scrollRef}
        // 底部 pb-20 为悬浮的「回到底部」按钮预留空间：
        // 任务卡（输入框上方）展开压缩消息区高度时，按钮也不会盖住最后一条消息
        className="flex-1 overflow-y-scroll my-1 mr-1 ml-3 px-16 pt-7 chat-scrollbar"
      >
        <div ref={contentRef} className={messages.length === 0 ? 'h-full' : 'max-w-4xl mx-auto'}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center">
              <h1 className="text-2xl font-semibold mb-2 h-8" style={{ color: colorText }}>
                {titleDisplayed}
                {!titleDone && <span className="animate-pulse">|</span>}
              </h1>
              <p className="text-center max-w-md h-6" style={{ color: colorTextSecondary }}>
                {subtitleDisplayed}
                {titleDone && !subtitleDone && <span className="animate-pulse">|</span>}
              </p>
            </div>
          ) : (
            <>
              {isLoadingMoreMessages && (
                <div className="flex justify-center py-3">
                  <Spin size="small" />
                </div>
              )}
              {messages.map((message, idx) =>
                message.role === 'user' ? (
                  <UserMessage
                    key={message.id}
                    message={message}
                    isDarkMode={isDarkMode}
                    colorText={colorText}
                    colorTextSecondary={colorTextSecondary}
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
                    onCopy={onCopy}
                    onDelete={onDelete}
                  />
                )
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>
      <ScrollToBottomButton
        visible={showScrollButton}
        streaming={streaming}
        isDarkMode={isDarkMode}
        onClick={handleScrollToBottom}
      />
    </div>
  )
}

export default ChatMessageArea
