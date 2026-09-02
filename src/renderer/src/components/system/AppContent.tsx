// AppContent.tsx
import React, { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import CustomFrame from '@renderer/components/system/CustomFrame'
import LockScreen from '@renderer/components/system/LockScreen'
import CryptoJS from 'crypto-js'
import { Window } from '../../../resource/types/window'
import { MessageProvider } from '@renderer/providers/MessageProvider'
import { useMessage } from '@renderer/hooks/useMessage'

const AppContent: React.FC = () => {
  const { viewMessage } = useMessage()
  const location = useLocation()
  const [current, setCurrent] = useState('home')
  const [isLocked, setIsLocked] = useState(false)
  const [lockCode, setLockCode] = useState<string | null>(null)
  const [lockEnabled, setLockEnabled] = useState(true)

  // Initialize lock screen settings
  useEffect(() => {
    const initializeLockScreen = async (): Promise<void> => {
      try {
        const result = await (window as unknown as Window).api.setting.getLockScreenCode()
        setLockCode(result.code)
        setLockEnabled(result.view)
      } catch (error) {
        console.error('Failed to initialize lock screen:', error)
        setIsLocked(false)
      }
    }

    initializeLockScreen().then()
  }, [])

  // Update lock screen status locally (runtime state only)
  const updateLockStatus = useCallback((locked: boolean): void => {
    setIsLocked(locked)
  }, [])

  // Handle lock screen action
  const handleLockScreen = useCallback((): void => {
    if (!lockEnabled) return
    updateLockStatus(true)
  }, [updateLockStatus, lockEnabled])

  // Verify password against stored hash
  const verifyPassword = async (inputPassword: string): Promise<boolean> => {
    if (!lockCode) return false

    const encryptedPassword = CryptoJS.MD5(inputPassword).toString()
    return encryptedPassword === lockCode
  }

  // Handle unlock process
  const handleUnlock = async (password: string): Promise<void> => {
    try {
      const isValid = await verifyPassword(password)

      if (isValid) {
        updateLockStatus(false)
        viewMessage('unlock-success', 'success', '解锁成功')
      } else {
        viewMessage('unlock-error', 'error', '解锁密码错误')
      }
    } catch (error) {
      console.error('Unlock verification failed:', error)
      viewMessage('unlock-error', 'error', '解锁验证失败')
    }
  }

  // 侧栏高亮与路由同步（修复：此前 currentKey 只随菜单点击更新——刷新后停留在
  // #/planner 等非菜单路径进入的视图时,侧栏仍高亮 home/旧项）
  useEffect(() => {
    const key = location.pathname.replace(/^\/+/, '').split('/')[0]
    if (key && ['home', 'chat', 'planner', 'music'].includes(key)) {
      setCurrent(key)
    }
  }, [location.pathname])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleLockScreen()
      }
    }

    document.addEventListener('keydown', handleKeyPress)

    return () => {
      document.removeEventListener('keydown', handleKeyPress)
    }
  }, [handleLockScreen])

  return (
    <MessageProvider>
      <CustomFrame currentKey={current} setCurrentKey={setCurrent} />
      {isLocked && <LockScreen onUnlock={handleUnlock} />}
    </MessageProvider>
  )
}

export default React.memo(AppContent)
