import { useContext } from 'react'
import { NotificationContext } from './NotificationContextCore'
import type { NotificationContextType } from './NotificationContextCore'

export const useNotification = (): NotificationContextType => {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider')
  return ctx
}
