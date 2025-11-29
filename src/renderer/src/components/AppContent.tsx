import React, { useState, useEffect } from 'react'
import { message } from 'antd'
import type { MenuProps } from 'antd'
import Header from './Header'
import MainContent from './MainContent'
import Footer from './Footer'
import LockScreen from './LockScreen'
import CryptoJS from 'crypto-js'
import { Window } from '../../resource/types/window'

const expected = await (window as unknown as Window).api.setting.getLockScreenCode()
// MD5 密码验证函数
const verifyPassword = async (inputPassword: string): Promise<boolean> => {
  const encryptedPassword = CryptoJS.MD5(inputPassword).toString()
  return encryptedPassword === expected.code
}

const AppContent: React.FC = () => {
  type MessageType = 'loading' | 'success' | 'info' | 'warning' | 'error'
  const [messageApi, contextHolder] = message.useMessage({ top: 90 })
  const [current, setCurrent] = useState('home')
  const [isLocked, setIsLocked] = useState(false)

  // 组件挂载时检查锁屏状态
  useEffect(() => {
    const checkLockStatus = (): void => {
      if (expected.view) {
        setIsLocked(true)
      }
    }

    checkLockStatus()
  }, [])

  // 更新锁屏状态时同时更新本地存储
  const updateLockStatus = (locked: boolean): void => {
    ;(window as unknown as Window).api.setting.setLockScreenView(locked)
    setIsLocked(locked)
  }

  const viewMessage = (
    key: string,
    type: MessageType,
    content: string,
    duration?: number
  ): void => {
    messageApi.open({ key, type, content, duration }).then()
  }

  const handleLockScreen = (): void => {
    updateLockStatus(true)
  }

  const handleUnlock = async (password: string): Promise<void> => {
    if (await verifyPassword(password)) {
      updateLockStatus(false)
      viewMessage('unlock-success', 'success', '解锁成功')
    } else {
      viewMessage('unlock-error', 'error', '解锁密码错误')
    }
  }

  const handleUserMenuClick: MenuProps['onClick'] = (e) => {
    if (e.key === 'lock') {
      handleLockScreen()
    } else {
      viewMessage('user-menu-click', 'info', `执行: ${e.key}`)
    }
  }

  return (
    <>
      {isLocked && <LockScreen onUnlock={handleUnlock} />}
      <Header
        currentKey={current}
        setCurrentKey={setCurrent}
        onUserMenuClick={handleUserMenuClick}
      />
      <MainContent />
      <Footer />
      {contextHolder}
    </>
  )
}

export default AppContent
