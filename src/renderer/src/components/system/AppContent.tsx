// AppContent.tsx
import React, { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import CustomFrame from '@renderer/components/system/CustomFrame'
import LockScreen from '@renderer/components/system/LockScreen'
import CryptoJS from 'crypto-js'
import { Window } from '../../../resource/types/window'
import { MessageProvider } from '@renderer/providers/MessageProvider'
import { useMessage } from '@renderer/hooks/useMessage'
import { useTranslation } from '@renderer/i18n'

const AppContent: React.FC = () => {
  const { viewMessage } = useMessage()
  const { t } = useTranslation()
  const location = useLocation()
  const [isLocked, setIsLocked] = useState(false)
  const [lockCode, setLockCode] = useState<string | null>(null)
  const [lockEnabled, setLockEnabled] = useState(true)

  /**
   * 侧栏高亮键**从路由派生**，不再用 useState。
   *
   * 为什么：停用注册了 `appProvider` 的插件会让 Provider 层重构，外壳子树随之重挂，
   * 组件里的 local state 会被重置——`currentKey` 用 state 时表现为「启停插件后高亮乱掉」。
   * 路由是外壳之外的真源（HashRouter 状态不受子树重挂影响），直接派生即天然一致
   * （顺带修掉旧问题：整页刷新停在 #/planner 时侧栏还高亮 home）。
   * 非菜单路径（如插件被停用后的兜底重定向中间态）不会有高亮项，可接受。
   */
  const current = location.pathname.replace(/^\/+/, '').split('/')[0] ?? ''

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
        viewMessage('unlock-success', 'success', t('shell.unlock.success'))
      } else {
        viewMessage('unlock-error', 'error', t('shell.unlock.failed'))
      }
    } catch (error) {
      console.error('Unlock verification failed:', error)
      viewMessage('unlock-error', 'error', t('shell.unlock.verifyFailed'))
    }
  }

  // 侧栏高亮不再需要「与路由同步」的 effect：current 本身就是 location 的派生值
  // （此前是 useState + 同步 effect，重挂后会丢状态）

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
      <CustomFrame currentKey={current} />
      {isLocked && <LockScreen onUnlock={handleUnlock} />}
    </MessageProvider>
  )
}

export default React.memo(AppContent)
