import React from 'react'
import { RiCollapseDiagonal2Line, RiExpandDiagonal2Line, RiShutDownLine } from '@remixicon/react'
import { useTranslation } from '@renderer/i18n'
import logo from '@renderer/assets/logo.png'

interface TitleBarProps {
  isMaximized: boolean
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  colorText: string
  colorTextSecondary: string
}

/**
 * 无边框窗口标题栏：仅保留品牌标识与窗口控制按钮。
 * 工作区切换器已迁移到聊天侧边栏（HarnessSidebar），此处不再承载工作区 UI。
 */
const TitleBar: React.FC<TitleBarProps> = ({
  isMaximized,
  onMinimize,
  onMaximize,
  onClose,
  colorText,
  colorTextSecondary
}) => {
  const { t } = useTranslation()
  return (
    <div className="frame-titlebar">
      <div className="frame-titlebar-left">
        {/* 图标带描边徽标：颜色随亮/暗主题切换（见 main.css 的 .frame-titlebar-icon-badge） */}
        <span className="frame-titlebar-icon-badge">
          <img src={logo} alt="RytenBench" className="frame-titlebar-icon" />
        </span>
        <span className="frame-titlebar-title" style={{ color: colorTextSecondary }}>
          RytenBench
        </span>
      </div>

      <div className="frame-titlebar-controls" style={{ color: colorText }}>
        <button
          className="frame-titlebar-btn"
          onClick={onMinimize}
          title={t('shell.titleBar.minimize')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
            <line x1="3" y1="9" x2="15" y2="9" stroke="currentColor" />
          </svg>
        </button>
        <button
          className="frame-titlebar-btn"
          onClick={onMaximize}
          title={isMaximized ? t('shell.titleBar.restore') : t('shell.titleBar.maximize')}
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
          title={t('shell.titleBar.close')}
        >
          <RiShutDownLine size={16} />
        </button>
      </div>
    </div>
  )
}

export default React.memo(TitleBar)
