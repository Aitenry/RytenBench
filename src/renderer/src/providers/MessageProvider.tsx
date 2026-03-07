import React, { ReactNode } from 'react'
import { message } from 'antd'
import { MessageContext, MessageContextType } from '../contexts/MessageContext'

interface MessageProviderProps {
  children: ReactNode
}

export const MessageProvider: React.FC<MessageProviderProps> = ({ children }) => {
  const [messageApi, contextHolder] = message.useMessage({ top: 20 })

  const viewMessage = (
    key: string,
    type: 'loading' | 'success' | 'info' | 'warning' | 'error',
    content: string,
    duration?: number
  ): void => {
    messageApi.open({ key, type, content, duration }).then()
  }

  const value: MessageContextType = {
    messageApi,
    viewMessage
  }

  return (
    <MessageContext.Provider value={value}>
      {contextHolder}
      {children}
    </MessageContext.Provider>
  )
}
