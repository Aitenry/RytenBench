// contexts/MessageContext.tsx
import { createContext } from 'react'
import { MessageInstance } from 'antd/es/message/interface'

// 定义Context类型
export interface MessageContextType {
  messageApi: MessageInstance
  viewMessage: (
    key: string,
    type: 'loading' | 'success' | 'info' | 'warning' | 'error',
    content: string,
    duration?: number
  ) => void
}

// 创建Context
export const MessageContext = createContext<MessageContextType | undefined>(undefined)
