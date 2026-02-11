import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

import zhCN from 'antd/locale/zh_CN'
import 'dayjs/locale/zh-cn'
import { ConfigProvider } from 'antd'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN}>
      <App />
    </ConfigProvider>
  </StrictMode>
)
