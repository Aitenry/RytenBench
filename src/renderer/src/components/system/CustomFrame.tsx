import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, theme } from 'antd'
import {
  RiCalendar2Line,
  RiChatAiLine,
  RiCollapseDiagonal2Line,
  RiDashboardLine,
  RiExpandDiagonal2Line,
  RiMusicLine,
  RiSettings3Line, RiShutDownLine,
  RiSubtractLine,
  RiSunCloudyLine
} from '@remixicon/react'
import { Window } from '../../../resource/types/window'
import MainRoutes from '@renderer/route/MainRoutes'
import SettingsPanel from './SettingsPanel'
import { useTheme } from '@renderer/contexts/useTheme'

interface CustomFrameProps {
  currentKey: string
  setCurrentKey: (key: string) => void
}

const CustomFrame: React.FC<CustomFrameProps> = ({ currentKey, setCurrentKey }) => {
  const navigate = useNavigate()
  const { effectiveTheme } = useTheme()
  const isDark = effectiveTheme === 'dark'
  const {
    token: {
      colorBgContainer,
      colorBgLayout,
      borderRadiusLG,
      colorFillAlter,
      colorText,
      colorTextSecondary
    }
  } = theme.useToken()

  const [isMaximized, setIsMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 监听窗口最大化状态
  useEffect(() => {
    const api = (window as unknown as Window).api
    api.window.isMaximized().then(setIsMaximized)
    return api.window.onMaximized(setIsMaximized)
  }, [])

  const api = (window as unknown as Window).api.window

  // 右侧菜单项（不含设置，设置在标题栏）
  const menuItems = [
    { key: 'home', label: '首页', icon: <RiDashboardLine size={16} /> },
    { key: 'planner', label: '计划', icon: <RiCalendar2Line size={16} /> },
    { key: 'chat', label: '助手', icon: <RiChatAiLine size={16} /> },
    { key: 'weather', label: '天气', icon: <RiSunCloudyLine size={16} /> },
    { key: 'music', label: '音乐', icon: <RiMusicLine size={16} /> }
  ]

  const onMenuClick = (key: string): void => {
    navigate(`/${key}`)
    setCurrentKey(key)
  }

  return (
    <div
      className="custom-frame-outer"
      style={{ background: isDark ? colorBgLayout : colorBgContainer }}
    >
      <div
        className="custom-frame"
        style={{
          background: colorBgContainer,
          borderRadius: borderRadiusLG
        }}
      >
        {/* ======== 顶部标题栏 ======== */}
        <div
          className="frame-titlebar"
          style={{
            height: 36,
            background: colorFillAlter
          }}
        >
          {/* 左侧：图标 + 项目名 */}
          <div className="frame-titlebar-left">
            <img src="./image/logo.png" alt="RytenBench" className="frame-titlebar-icon" />
            <span className="frame-titlebar-title" style={{ color: colorTextSecondary }}>
              RytenBench
            </span>
          </div>

          {/* 右侧：窗口控制 */}
          <div className="frame-titlebar-controls" style={{ color: colorText }}>
            <button className="frame-titlebar-btn" onClick={() => api.minimize()} title="最小化">
              <RiSubtractLine size={16} />
            </button>
            <button
              className="frame-titlebar-btn"
              onClick={() => api.maximize()}
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
              onClick={() => api.close()}
              title="关闭"
            >
              <RiShutDownLine size={16} />
            </button>
          </div>
        </div>

        {/* ======== 主体内容区 ======== */}
        <div className="frame-body">
          {/* 左边栏菜单 */}
          <div className="frame-body-left">
            <div className="frame-menu" style={{ background: colorFillAlter }}>
              {menuItems.map((item) => (
                <button
                  key={item.key}
                  className={`frame-menu-item ${currentKey === item.key ? 'frame-menu-item-active' : ''}`}
                  onClick={() => onMenuClick(item.key)}
                  title={item.label}
                  style={{
                    color: currentKey === item.key ? undefined : colorTextSecondary
                  }}
                >
                  {item.icon}
                </button>
              ))}
            </div>
          </div>

          {/* 中心内容 */}
          <div className="frame-body-center custom-scrollbar">
            <MainRoutes />
          </div>

          {/* 右边栏：设置 */}
          <div className="frame-body-right">
            <div className="frame-menu" style={{ background: colorFillAlter }}>
              <button
                className="frame-menu-item"
                onClick={() => setSettingsOpen(true)}
                title="设置"
                style={{ color: colorTextSecondary }}
              >
                <RiSettings3Line size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ======== 设置弹窗 ======== */}
      <Modal
        title={null}
        open={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        footer={null}
        width={900}
        style={{ top: 40 }}
        destroyOnHidden
      >
        <SettingsPanel />
      </Modal>
    </div>
  )
}

export default CustomFrame
