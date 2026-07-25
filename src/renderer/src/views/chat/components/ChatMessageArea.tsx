import React from 'react'
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
  onCopy: (text: string, id: string) => Promise<void>
  onDelete: (msgIndex: number) => Promise<void>
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
  onCopy,
  onDelete,
  messagesEndRef
}) => {
  return (
    <div className="flex-1 overflow-y-scroll my-1 mr-1 ml-3 px-16 py-8 chat-scrollbar">
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
