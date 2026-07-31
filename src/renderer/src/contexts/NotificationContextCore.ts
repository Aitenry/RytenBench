import { createContext } from 'react'
import type { NotificationItem } from '@renderer/types/notification'

export interface NotificationContextType {
  notifications: NotificationItem[]
  unreadCount: number
  addNotification: (notification: NotificationItem) => void
  updateNotification: (id: string, updates: Partial<NotificationItem>) => void
  removeNotification: (id: string) => void
  markAllRead: () => void
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined)
