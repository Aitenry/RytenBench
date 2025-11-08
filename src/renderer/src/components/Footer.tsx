import React from 'react'
import { theme } from 'antd'

const Footer: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG }
  } = theme.useToken()

  return (
    <footer
      className="m-2.5 text-center py-4 text-sm"
      style={{
        background: colorBgContainer,
        borderRadius: borderRadiusLG,
        color: '#8c8c8c'
      }}
    >
      All rights reserved by{' '}
      <a
        href="https://aitenry.com  "
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#8c8c8c', textDecoration: 'underline' }}
      >
        Aitenry
      </a>{' '}
      ©{new Date().getFullYear()} RytenBench - 轻量级个人工作台
    </footer>
  )
}

export default Footer
