// contexts/MessageContext.tsx
import { createContext } from 'react'
import type { MessageContextType } from '@renderer/types/components'

export type { MessageContextType }

// 创建Context
export const MessageContext = createContext<MessageContextType | undefined>(undefined)
