import React from 'react'
import { HashRouter } from 'react-router-dom'
import { MessageContext } from '@renderer/contexts/MessageContext'
import { AudioProvider } from '@renderer/contexts/AudioContext'
import { BuildProgressProvider } from '@renderer/providers/BuildProgressProvider'
import AppContent from '@renderer/components/system/AppContent'

const App: React.FC = () => {
  return (
    <HashRouter>
      <MessageContext.Provider
        value={{
          viewMessage: () => {}
        }}
      >
        <AudioProvider>
          <BuildProgressProvider>
            <AppContent />
          </BuildProgressProvider>
        </AudioProvider>
      </MessageContext.Provider>
    </HashRouter>
  )
}

export default App
