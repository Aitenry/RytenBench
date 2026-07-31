import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { theme } from 'antd'
import { RiCalendar2Line, RiChatAiLine, RiDashboardLine, RiMusicLine } from '@remixicon/react'
import { Window } from '../../../resource/types/window'
import MainRoutes from '@renderer/route/MainRoutes'
import SettingsModal from './settings/SettingsModal'
import TitleBar from './frame/TitleBar'
import Sidebar from './frame/Sidebar'
import RightBar from './frame/RightBar'
import BottomBar from './frame/BottomBar'
import type { MenuItem } from './frame/Sidebar'

interface CustomFrameProps {
  currentKey: string
  setCurrentKey: (key: string) => void
}

const CustomFrame: React.FC<CustomFrameProps> = ({ currentKey, setCurrentKey }) => {
  const navigate = useNavigate()
  const {
    token: {
      colorBgContainer,
      borderRadiusLG,
      colorFillAlter,
      colorPrimary,
      colorText,
      colorTextSecondary
    }
  } = theme.useToken()

  const [isMaximized, setIsMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const api = (window as unknown as Window).api

  useEffect(() => {
    api.window.isMaximized().then(setIsMaximized)
    return api.window.onMaximized(setIsMaximized)
  }, [])

  const menuItems: MenuItem[] = useMemo(
    () => [
      { key: 'home', label: '首页', icon: <RiDashboardLine size={16} /> },
      { key: 'chat', label: '助手', icon: <RiChatAiLine size={16} /> },
      { key: 'planner', label: '计划', icon: <RiCalendar2Line size={16} /> },
      { key: 'music', label: '音乐', icon: <RiMusicLine size={16} /> }
    ],
    []
  )

  const onMenuClick = useCallback(
    (key: string): void => {
      navigate(`/${key}`)
      setCurrentKey(key)
    },
    [navigate, setCurrentKey]
  )

  const handleMinimize = useCallback(() => api.window.minimize(), [])
  const handleMaximize = useCallback(() => api.window.maximize(), [])
  const handleClose = useCallback(() => api.window.close(), [])
  const handleSettingsClick = useCallback(() => setSettingsOpen(true), [])

  return (
    <div className="custom-frame-outer" style={{ background: 'transparent' }}>
      <div
        className="custom-frame"
        style={{ background: colorBgContainer, borderRadius: borderRadiusLG }}
      >
        <TitleBar
          isMaximized={isMaximized}
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          onClose={handleClose}
          colorFillAlter={colorFillAlter}
          colorText={colorText}
          colorTextSecondary={colorTextSecondary}
        />

        <div className="frame-body">
          <Sidebar
            currentKey={currentKey}
            menuItems={menuItems}
            onMenuClick={onMenuClick}
            colorFillAlter={colorFillAlter}
            colorTextSecondary={colorTextSecondary}
          />

          <div className="frame-body-center custom-scrollbar">
            <MainRoutes />
          </div>

          <RightBar
            onSettingsClick={handleSettingsClick}
            colorFillAlter={colorFillAlter}
            colorText={colorText}
            colorTextSecondary={colorTextSecondary}
          />
        </div>

        <BottomBar
          colorBgContainer={colorBgContainer}
          colorFillAlter={colorFillAlter}
          colorPrimary={colorPrimary}
          colorText={colorText}
          colorTextSecondary={colorTextSecondary}
        />
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default CustomFrame
