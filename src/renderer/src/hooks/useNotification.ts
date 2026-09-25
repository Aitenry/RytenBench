import { useContext } from 'react'
import { NotificationContext } from '../contexts/NotificationContextCore'
import type { NotificationContextType } from '../contexts/NotificationContextCore'

export const useNotification = (): NotificationContextType => {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotification must be used within NotificationProvider')
  return ctx
}
