import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntApp } from 'antd'
import App from './App'
import { LanguageProvider } from './contexts/LanguageContext'
import { ThemeProvider } from './contexts/ThemeContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 语言在最外层：主题（antd locale）与 dayjs 都跟随它 */}
    <LanguageProvider>
      <ThemeProvider>
        <AntApp>
          <App />
        </AntApp>
      </ThemeProvider>
    </LanguageProvider>
  </StrictMode>
)
