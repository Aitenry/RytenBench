import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { theme, Spin } from 'antd'
import { RiCalendar2Line, RiChatAiLine, RiDashboardLine, RiMusicLine } from '@remixicon/react'
import { useTheme } from '@renderer/contexts/useTheme'
import { useChat } from '@renderer/contexts/ChatContextCore'
import { Window } from '../../../resource/types/window'
import MainRoutes from '@renderer/route/MainRoutes'
import SettingsModal from './settings/SettingsModal'
import TitleBar from './frame/TitleBar'
import Sidebar from './frame/Sidebar'
import RightBar from './frame/RightBar'
import BottomBar from './frame/BottomBar'
import OnboardingGuide from './OnboardingGuide'
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

  /* ── 首次启动引导：工作区 + 模型配置任一缺失时整页引导 ── */
  const { providers } = useChat()
  const [hasWorkspace, setHasWorkspace] = useState<boolean | null>(null)

  const checkWorkspace = useCallback(async (): Promise<boolean> => {
    try {
      const [list, settings] = await Promise.all([
        (window as unknown as Window).api.chat.getAllWorkspaces(),
        (window as unknown as Window).api.systemSettings.getAll()
      ])
      const active = settings.chat?.activeWorkspaceId
      return list.length > 0 && active != null && list.some((w) => w.id === active)
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    checkWorkspace().then(setHasWorkspace)
  }, [checkWorkspace])

  useEffect(() => {
    const onWorkspaceChanged = (): void => {
      checkWorkspace().then(setHasWorkspace)
    }
    window.addEventListener('workspace-changed', onWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', onWorkspaceChanged)
  }, [checkWorkspace])

  /* 检查中（null）不显示内容；就绪前整页引导；就绪后进入应用 */
  const modelsDone = providers.length > 0
  const workspaceDone = hasWorkspace === true
  const onboardingVisible = hasWorkspace === false || (workspaceDone && !modelsDone)

  useEffect(() => {
    api.window.isMaximized().then(setIsMaximized)
    return api.window.onMaximized(setIsMaximized)
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

        {hasWorkspace === null ? (
          /* 就绪检查中：占位，避免内容闪现 */
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent'
            }}
          >
            <Spin size="large" />
          </div>
        ) : onboardingVisible ? (
          /* 工作区或模型未配置：整页引导，配置完成后自动进入 */
          <OnboardingGuide
            workspaceDone={workspaceDone}
            modelsDone={modelsDone}
            onModelSetup={() => {
              setSettingsTab('model')
              setSettingsOpen(true)
            }}
          />
        ) : (
          <>
            <div className="frame-body">
              <Sidebar
                currentKey={currentKey}
                menuItems={menuItems}
                onMenuClick={onMenuClick}
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
          </>
        )}

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialTab={settingsTab as 'general' | 'music' | 'graph' | 'model' | 'system' | undefined}
        />
      </div>
    </div>
  )
}

export default CustomFrame
