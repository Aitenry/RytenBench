import React from 'react'
import { HashRouter } from 'react-router-dom'
import { MessageContext } from './contexts/MessageContext'
import AppContent from './components/AppContent'

const App: React.FC = () => {
  return (
    <HashRouter>
      <MessageContext.Provider value={{ viewMessage: () => {} }}>
        <div className="min-h-screen flex flex-col bg-gray-100">
          <AppContent />
        </div>
      </MessageContext.Provider>
    </HashRouter>
  )
}

export default App
