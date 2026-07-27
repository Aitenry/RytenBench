import React, { createContext, useContext, useState, useCallback } from 'react'
import type { NotificationItem } from '@renderer/types/notification'

interface NotificationContextType {
  notifications: NotificationItem[]
  unreadCount: number
  addNotification: (notification: NotificationItem) => void
  updateNotification: (id: string, updates: Partial<NotificationItem>) => void
  removeNotification: (id: string) => void
  markAllRead: () => void
}

const NotificationCtx = createContext<NotificationContextType | undefined>(undefined)

export const useNotification = (): NotificationContextType => {
  const ctx = useContext(NotificationCtx)
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider')
  return ctx
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  const addNotification = useCallback((notification: NotificationItem) => {
    setNotifications((prev) => {
      const exists = prev.find((n) => n.id === notification.id)
      if (exists) {
        return prev.map((n) =>
          n.id === notification.id
            ? ({ ...n, ...notification, read: n.read } as NotificationItem)
            : n
        )
      }
      return [...prev, notification]
    })
  }, [])

  const updateNotification = useCallback((id: string, updates: Partial<NotificationItem>) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? ({ ...n, ...updates, read: n.read } as NotificationItem) : n))
    )
  }, [])

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <NotificationCtx.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        updateNotification,
        removeNotification,
        markAllRead
      }}
    >
      {children}
    </NotificationCtx.Provider>
  )
}
