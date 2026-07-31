import { createContext, useContext } from 'react'
import type { UseChatHandlersReturn } from '@renderer/views/chat/hooks/useChatHandlers'

export type ChatContextType = UseChatHandlersReturn

export const ChatCtx = createContext<ChatContextType | undefined>(undefined)

export const useChat = (): ChatContextType => {
  const ctx = useContext(ChatCtx)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
