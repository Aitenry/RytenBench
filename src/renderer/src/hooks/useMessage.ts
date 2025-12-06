import { useContext } from 'react'
import { MessageContext, MessageContextType } from '../contexts/MessageContext'

// 自定义Hook用于在组件中使用消息上下文
export const useMessage = (): MessageContextType => {
  const context = useContext(MessageContext)
  if (context === undefined) {
    throw new Error('useMessage must be used within a MessageProvider')
  }
  return context
}
