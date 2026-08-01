import React, { useRef, useEffect, useCallback } from 'react'
import { Spin } from 'antd'
import type { Message } from '@renderer/types/chat'
import UserMessage from './messages/UserMessage'
import AssistantMessage from './messages/AssistantMessage'

interface ChatMessageAreaProps {
  messages: Message[]
  isDarkMode: boolean
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

const ChatMessageArea: React.FC<ChatMessageAreaProps> = ({
  messages,
  isDarkMode,
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
  const prevScrollHeightRef = useRef(0)
  const prevMessagesLengthRef = useRef(0)

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
    if (!el || isLoadingMoreMessages || !hasMoreMessages) return
    if (el.scrollTop <= 40) {
      onLoadMoreMessages()
    }
  }, [isLoadingMoreMessages, hasMoreMessages, onLoadMoreMessages])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-scroll my-1 mr-1 ml-3 px-16 py-8 chat-scrollbar">
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
        <div className="max-w-4xl mx-auto">
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
        </div>
      )}
    </div>
  )
}

export default ChatMessageArea
