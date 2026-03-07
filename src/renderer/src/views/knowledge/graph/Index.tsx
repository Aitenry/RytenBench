import React from 'react'
import { theme } from 'antd'

const Index: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()
  return (
    <div className="h-full flex-1 flex flex-row mx-2.5 gap-2.5">
      <main
        className="w-full"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      ></main>
    </div>
  )
}

export default Index
