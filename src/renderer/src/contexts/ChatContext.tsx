import React from 'react'
import { useChatHandlers } from '@renderer/views/chat/hooks/useChatHandlers'
import { ChatCtx } from './ChatContextCore'

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const chat = useChatHandlers()

  return <ChatCtx.Provider value={chat}>{children}</ChatCtx.Provider>
}
