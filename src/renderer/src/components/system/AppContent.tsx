// AppContent.tsx
import React, { useState, useEffect, useCallback } from 'react'
import { type MenuProps } from 'antd'
import Sidebar from '@renderer/components/system/Sidebar'
import MainRoutes from '@renderer/route/MainRoutes'
import LockScreen from '@renderer/components/system/LockScreen'
import CryptoJS from 'crypto-js'
import { Window } from '../../../resource/types/window'
import { MessageProvider } from '@renderer/providers/MessageProvider'
import { useMessage } from '@renderer/hooks/useMessage'

const AppContent: React.FC = () => {
  const { viewMessage } = useMessage()
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

  // Handle user menu clicks
  const handleUserMenuClick: MenuProps['onClick'] = (e) => {
    if (e.key === 'lock') {
      handleLockScreen()
    }
  }

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
      {isLocked && <LockScreen onUnlock={handleUnlock} />}
      <div className="flex h-screen">
        <Sidebar
          currentKey={current}
          setCurrentKey={setCurrent}
          onUserMenuClick={handleUserMenuClick}
        />
        <div className="flex-1 overflow-auto py-2.5 pr-2.5">
          <MainRoutes />
        </div>
      </div>
    </MessageProvider>
  )
}

export default React.memo(AppContent)
