import React from 'react'
import { theme } from 'antd'

interface CanvasContextMenuProps {
  x: number
  y: number
  onClose: () => void
  onNewDoc: () => void
  onNewWiki: () => void
  onNewTodo: () => void
}

const CanvasContextMenu: React.FC<CanvasContextMenuProps> = ({
  x,
  y,
  onClose,
  onNewDoc,
  onNewWiki,
  onNewTodo
}) => {
  const { token } = theme.useToken()

  return (
    <div
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 1000,
        background: token.colorBgElevated,
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadowSecondary,
        padding: '6px',
        minWidth: 180,
        border: `1px solid ${token.colorBorderSecondary}`
      }}
    >
      <div
        onClick={() => {
          onClose()
          onNewDoc()
        }}
        style={{
          padding: '8px 16px',
          cursor: 'pointer',
          fontSize: 14,
          color: token.colorText,
          transition: 'background 0.15s'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = token.colorFillSecondary)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        添加文档
      </div>
      <div
        onClick={() => {
          onClose()
          onNewWiki()
        }}
        style={{
          padding: '8px 16px',
          cursor: 'pointer',
          fontSize: 14,
          color: token.colorText,
          transition: 'background 0.15s'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = token.colorFillSecondary)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        添加知识库
      </div>
      <div
        onClick={() => {
          onClose()
          onNewTodo()
        }}
        style={{
          padding: '8px 16px',
          cursor: 'pointer',
          fontSize: 14,
          color: token.colorText,
          transition: 'background 0.15s'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = token.colorFillSecondary)}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        添加待办事项
      </div>
    </div>
  )
}

export default CanvasContextMenu
