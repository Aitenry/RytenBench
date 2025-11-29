// contexts/MessageContext.tsx
import { createContext, useContext } from 'react'

// 定义Context类型
export interface MessageContextType {
  viewMessage: (
    key: string,
    type: 'loading' | 'success' | 'info' | 'warning' | 'error',
    content: string,
    duration?: number
  ) => void
}

// 创建Context
export const MessageContext = createContext<MessageContextType | undefined>(undefined)

// 自定义Hook用于在组件中使用消息上下文
export const useMessageContext = (): MessageContextType => {
  const context = useContext(MessageContext)
  if (context === undefined) {
    throw new Error('useMessageContext must be used within a MessageProvider')
  }
  return context
}
