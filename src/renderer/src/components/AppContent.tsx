// AppContent.tsx
import React, { useState, useEffect } from 'react'
import { type MenuProps } from 'antd'
import Sidebar from './Sidebar'
import MainContent from './MainContent'
import LockScreen from './LockScreen'
import CryptoJS from 'crypto-js'
import { Window } from '../../resource/types/window'
import { MessageProvider } from '../providers/MessageProvider'
import { useMessage } from '../hooks/useMessage'

const AppContent: React.FC = () => {
  const { viewMessage } = useMessage()
  const [current, setCurrent] = useState('home')
  const [isLocked, setIsLocked] = useState(false)
  const [lockCode, setLockCode] = useState<string | null>(null)

  // Initialize lock screen settings
  useEffect(() => {
    const initializeLockScreen = async () => {
      try {
        const result = await (window as unknown as Window).api.setting.getLockScreenCode()
        setLockCode(result.code)

        if (result.view) {
          setIsLocked(true)
        }
      } catch (error) {
        console.error('Failed to initialize lock screen:', error)
        // Default to unlocked if there's an error
        setIsLocked(false)
      }
    }

    initializeLockScreen().then()
  }, [])

  // Update lock screen status in both local storage and backend
  const updateLockStatus = (locked: boolean): void => {
    // Update backend setting
    (window as unknown as Window).api.setting.setLockScreenView(locked)

    // Update local state
    setIsLocked(locked)
  }

  // Handle lock screen action
  const handleLockScreen = (): void => {
    updateLockStatus(true)
  }

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
    } else {
      viewMessage('user-menu-click', 'loading', `${e.key} loading...`)
      setTimeout(() => {
        viewMessage('user-menu-click', 'success', `${e.key} execution completed!`, 2)
      }, 2000)
    }
  }

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
          <MainContent />
        </div>
      </div>
    </MessageProvider>
  )
}

export default AppContent
