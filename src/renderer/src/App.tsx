import React from 'react'
import { HashRouter } from 'react-router-dom'
import { MessageContext } from '@renderer/contexts/MessageContext'
import { AudioProvider } from '@renderer/contexts/AudioContext'
import { BuildProgressProvider } from '@renderer/providers/BuildProgressProvider'
import { NotificationProvider } from '@renderer/contexts/NotificationContext'
import { ChatProvider } from '@renderer/contexts/ChatContext'
import { composeProviders } from '@renderer/utils/composeProviders'
import AppContent from '@renderer/components/system/AppContent'

const AppProviders = composeProviders(
  [
    MessageContext.Provider,
    {
      value: {
        viewMessage: () => {}
      }
    }
  ],
  [AudioProvider],
  [NotificationProvider],
  [ChatProvider],
  [BuildProgressProvider]
)

const App: React.FC = () => {
  return (
    <HashRouter>
      <AppProviders>
        <AppContent />
      </AppProviders>
    </HashRouter>
  )
}

export default App
