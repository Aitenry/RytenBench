import React from 'react'
import { HashRouter } from 'react-router-dom'
import { theme } from 'antd'
import { MessageContext } from './contexts/MessageContext'
import { AudioProvider } from './contexts/AudioContext'
import AppContent from './components/AppContent'

const App: React.FC = () => {
  const {
    token: { colorBgLayout }
  } = theme.useToken()

  return (
    <HashRouter>
      <MessageContext.Provider
        value={{
          viewMessage: () => {}
        }}
      >
        <AudioProvider>
          <div className="min-h-screen flex flex-col" style={{ background: colorBgLayout }}>
            <AppContent />
          </div>
        </AudioProvider>
      </MessageContext.Provider>
    </HashRouter>
  )
}

export default App
