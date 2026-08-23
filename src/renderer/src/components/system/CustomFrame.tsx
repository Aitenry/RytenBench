import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { theme } from 'antd'
import { RiCalendar2Line, RiChatAiLine, RiDashboardLine, RiMusicLine } from '@remixicon/react'
import { useTheme } from '@renderer/contexts/useTheme'
import { Window } from '../../../resource/types/window'
import MainRoutes from '@renderer/route/MainRoutes'
import { isLazyViewKey, preloadView, scheduleViewPreload } from '@renderer/route/viewPreload'
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

  const { effectiveTheme } = useTheme()

  const [isMaximized, setIsMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined)

  const api = (window as unknown as Window).api

  useEffect(() => {
    api.window.isMaximized().then(setIsMaximized)
    return api.window.onMaximized(setIsMaximized)
  }, [])

  // 启动后的空闲时段提前加载懒加载页面 chunk（chat → planner → music），
  // 首次切换菜单时模块已就绪，实现直接切换不卡顿
  useEffect(() => {
    scheduleViewPreload()
  }, [])

  // 菜单悬停/聚焦时预加载对应 chunk：空闲预加载未完成时的兜底
  const onMenuHover = useCallback((key: string): void => {
    if (isLazyViewKey(key)) preloadView(key)
  }, [])

  // 监听自定义事件以从其他页面打开系统设置
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { tab?: string } | undefined
      setSettingsTab(detail?.tab)
      setSettingsOpen(true)
    }
    window.addEventListener('open-system-settings', handler)
    return () => window.removeEventListener('open-system-settings', handler)
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
  const handleSettingsClick = useCallback(() => {
    setSettingsTab(undefined)
    setSettingsOpen(true)
  }, [])

  return (
    <div className="custom-frame-outer" style={{ background: 'transparent' }}>
      <div
        className="custom-frame"
        style={{
          background: effectiveTheme === 'dark' ? 'rgb(32, 32, 32)' : 'rgb(238 238 238)',
          borderRadius: borderRadiusLG
        }}
      >
        <TitleBar
          isMaximized={isMaximized}
          onMinimize={handleMinimize}
          onMaximize={handleMaximize}
          onClose={handleClose}
          colorText={colorText}
          colorTextSecondary={colorTextSecondary}
        />

        {/* 应用即开即用；模型配置只在「助手」页需要时引导 */}
        <div className="frame-body">
          <Sidebar
            currentKey={currentKey}
            menuItems={menuItems}
            onMenuClick={onMenuClick}
            onMenuHover={onMenuHover}
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
          colorPrimary={colorPrimary}
          colorText={colorText}
          colorTextSecondary={colorTextSecondary}
        />

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialTab={
            settingsTab as
              | 'general'
              | 'music'
              | 'graph'
              | 'model'
              | 'system'
              | 'agents'
              | 'skills'
              | 'memory'
              | undefined
          }
        />
      </div>
    </div>
  )
}

export default CustomFrame
