import React from 'react'
import { theme } from 'antd'
import MainContent from '@renderer/views/home/components/MainContent'

const Index: React.FC = () => {
  const { token } = theme.useToken()

  return (
    <div
      className="h-full flex-1 flex"
      style={{
        background: token.colorBgLayout
      }}
    >
      <MainContent />
    </div>
  )
}

export default Index
