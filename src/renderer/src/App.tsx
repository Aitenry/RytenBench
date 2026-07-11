import React from 'react'
import { HashRouter } from 'react-router-dom'
import { theme } from 'antd'
import { MessageContext } from './contexts/MessageContext'
import { AudioProvider } from './contexts/AudioContext'
import { BuildProgressProvider } from './providers/BuildProgressProvider'
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
          <BuildProgressProvider>
            <div className="min-h-screen flex flex-col" style={{ background: colorBgLayout }}>
              <AppContent />
            </div>
          </BuildProgressProvider>
        </AudioProvider>
      </MessageContext.Provider>
    </HashRouter>
  )
}

export default App
