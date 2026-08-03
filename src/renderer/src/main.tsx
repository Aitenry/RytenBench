import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntApp } from 'antd'
import App from './App'
import { ThemeProvider } from './contexts/ThemeContext'

import 'dayjs/locale/zh-cn'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AntApp>
        <App />
      </AntApp>
    </ThemeProvider>
  </StrictMode>
)
