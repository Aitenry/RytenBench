import React from 'react'
import logo from '@renderer/assets/logo.png'
import {
  RiCollapseDiagonal2Line,
  RiExpandDiagonal2Line,
  RiShutDownLine,
  RiSubtractLine
} from '@remixicon/react'

interface TitleBarProps {
  isMaximized: boolean
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  colorFillAlter: string
  colorText: string
  colorTextSecondary: string
}

const TitleBar: React.FC<TitleBarProps> = ({
  isMaximized,
  onMinimize,
  onMaximize,
  onClose,
  colorFillAlter,
  colorText,
  colorTextSecondary
}) => {
  return (
    <div className="frame-titlebar" style={{ height: 36, background: colorFillAlter }}>
      <div className="frame-titlebar-left">
        <img src={logo} alt="RytenBench" className="frame-titlebar-icon" />
        <span className="frame-titlebar-title" style={{ color: colorTextSecondary }}>
          RytenBench
        </span>
      </div>

      <div className="frame-titlebar-controls" style={{ color: colorText }}>
        <button className="frame-titlebar-btn" onClick={onMinimize} title="最小化">
          <RiSubtractLine size={16} />
        </button>
        <button
          className="frame-titlebar-btn"
          onClick={onMaximize}
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <RiCollapseDiagonal2Line size={16} />
          ) : (
            <RiExpandDiagonal2Line size={16} />
          )}
        </button>
        <button
          className="frame-titlebar-btn frame-titlebar-btn-close"
          onClick={onClose}
          title="关闭"
        >
          <RiShutDownLine size={16} />
        </button>
      </div>
    </div>
  )
}

export default React.memo(TitleBar)
