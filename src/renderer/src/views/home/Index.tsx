import React from 'react'
import { theme } from 'antd'
import HomeView from '@renderer/views/home/components/HomeView'

/**
 * 首页：思源笔记风格三栏布局
 * （左侧文档树 / 中间主区 / 右侧大纲·属性），已移除画布。
 */
const Index: React.FC = () => {
  const { token } = theme.useToken()

  return (
    <div className="h-full flex-1 flex" style={{ background: token.colorBgLayout }}>
      <HomeView />
    </div>
  )
}

export default Index
