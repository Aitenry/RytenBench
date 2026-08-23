import React from 'react'
import { HashRouter } from 'react-router-dom'
import { MessageContext } from '@renderer/contexts/MessageContext'
import { AudioProvider } from '@renderer/contexts/AudioContext'
import { BuildProgressProvider } from '@renderer/providers/BuildProgressProvider'
import { NotificationProvider } from '@renderer/contexts/NotificationContext'
import { ChatProvider } from '@renderer/contexts/ChatContext'
import { composeProviders } from '@renderer/utils/composeProviders'
import AppContent from '@renderer/components/system/AppContent'
import AppErrorBoundary from '@renderer/components/system/AppErrorBoundary'

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
      {/* 全局错误边界：渲染错误不再让整个应用白屏死掉，而是给出可恢复的提示卡 */}
      <AppErrorBoundary>
        <AppProviders>
          <AppContent />
        </AppProviders>
      </AppErrorBoundary>
    </HashRouter>
  )
}

export default App
