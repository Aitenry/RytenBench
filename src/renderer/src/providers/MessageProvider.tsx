import React from 'react'
import { message } from 'antd'
import { MessageContext, MessageContextType } from '../contexts/MessageContext'
import type { MessageProviderProps } from '@renderer/types/components'

export const MessageProvider: React.FC<MessageProviderProps> = ({ children }) => {
  const [messageApi, contextHolder] = message.useMessage({ top: 44 })

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
