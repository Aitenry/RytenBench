import React, { useState } from 'react'
import { HashRouter } from 'react-router-dom' // Import BrowserRouter
import { message } from 'antd'
import type { MenuProps } from 'antd'
import Header from './components/Header'
import MainContent from './components/MainContent'
import Footer from './components/Footer'

const App: React.FC = () => {
  type MessageType = 'loading' | 'success' | 'info' | 'warning' | 'error'
  const [messageApi, contextHolder] = message.useMessage({ top: 110 })
  const [current, setCurrent] = useState('home') // Keep state for menu selection UI

  const viewMessage = (
    key: string,
    type: MessageType,
    content: string,
    duration?: number
  ): void => {
    messageApi.open({ key, type, content, duration }).then()
  }

  const handleUserMenuClick: MenuProps['onClick'] = (e) => {
    viewMessage('user-menu-click', 'info', `执行: ${e.key}`)
  }

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col bg-gray-100">
        <Header
          currentKey={current}
          setCurrentKey={setCurrent}
          onUserMenuClick={handleUserMenuClick}
        />
        <MainContent />
        <Footer />
        {contextHolder}
      </div>
    </HashRouter>
  )
}

export default App
