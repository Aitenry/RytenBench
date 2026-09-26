import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { theme } from 'antd'
import { useTheme } from '@renderer/hooks/useTheme'
import { useTranslation } from '@renderer/i18n'
import { Window } from '../../../resource/types/window'
import MainRoutes from '@renderer/route/MainRoutes'
import { preloadView, scheduleViewPreload } from '@renderer/route/viewPreload'
import { usePluginMenus, usePluginRoutes } from '@renderer/plugin-host/PluginHostContext'
import { openSettingsModal } from './settings/settings-modal-state'
import TitleBar from './frame/TitleBar'
import Sidebar from './frame/Sidebar'
import RightBar from './frame/RightBar'
import BottomBar from './frame/BottomBar'
import type { MenuItem } from './frame/Sidebar'

interface CustomFrameProps {
  /** 当前侧栏高亮键（由路由派生，见 AppContent；不再用可被重挂重置的 local state） */
  currentKey: string
}

const CustomFrame: React.FC<CustomFrameProps> = ({ currentKey }) => {
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
  const { t } = useTranslation()

  const [isMaximized, setIsMaximized] = useState(false)

  const api = (window as unknown as Window).api

  // 侧栏菜单与路由均来自插件注册表（停用插件的菜单项/路由即时消失）
  const pluginMenus = usePluginMenus()
  const pluginRoutes = usePluginRoutes()

  useEffect(() => {
    api.window.isMaximized().then(setIsMaximized)
    return api.window.onMaximized(setIsMaximized)
  }, [])

  // 启动后的空闲时段提前加载「已启用插件的懒路由」chunk（按菜单序倒排 = 重插件靠前），
  // 首次切换菜单时模块已就绪，实现直接切换不卡顿
  const lazyRoutes = useMemo(
    () =>
      [...pluginMenus]
        .reverse()
        .flatMap((m) => pluginRoutes.filter((r) => r.path === `/${m.key}` && r.load))
        .map((r) => ({
          key: r.path.replace(/^\//, ''),
          load: r.load! as () => Promise<{ default: unknown }>
        })),
    [pluginMenus, pluginRoutes]
  )
  useEffect(() => {
    if (lazyRoutes.length > 0) scheduleViewPreload(lazyRoutes)
  }, [lazyRoutes])

  // 菜单悬停/聚焦时预加载对应 chunk：空闲预加载未完成时的兜底
  const onMenuHover = useCallback(
    (key: string): void => {
      const route = pluginRoutes.find((r) => r.path === `/${key}` && r.load)
      if (route?.load) preloadView(key, route.load as () => Promise<{ default: unknown }>)
    },
    [pluginRoutes]
  )

  // 监听自定义事件以从其他页面打开系统设置
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent).detail as { tab?: string; scope?: string } | undefined
      // scope: 'assistant' → 聚焦模式（只显示智能体 / 模型 / 技能 / 记忆）
      openSettingsModal(detail?.tab, detail?.scope === 'assistant' ? 'assistant' : 'full')
    }
    window.addEventListener('open-system-settings', handler)
    return () => window.removeEventListener('open-system-settings', handler)
  }, [])

  const menuItems: MenuItem[] = useMemo(
    () =>
      pluginMenus.map((m) => ({
        key: m.key,
        label: t(m.labelKey as never),
        icon: m.icon
      })),
    [pluginMenus, t]
  )

  // 菜单点击只改路由：侧栏高亮由 AppContent 从 location 派生（停用注册了
  // appProvider 的插件会重挂外壳子树，local state 会被重置——高亮不能再依赖它）
  const onMenuClick = useCallback(
    (key: string): void => {
      navigate(`/${key}`)
    },
    [navigate]
  )

  const handleMinimize = useCallback(() => api.window.minimize(), [])
  const handleMaximize = useCallback(() => api.window.maximize(), [])
  const handleClose = useCallback(() => api.window.close(), [])
  const handleSettingsClick = useCallback(() => {
    openSettingsModal(undefined, 'full')
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

        {/* 设置弹窗不在这里渲染：它挂在插件 Provider 链之外（见 settings/SettingsHost.tsx），
            否则插件启停导致的外壳重挂会让弹窗动画重放（看起来像关了又开）。 */}
      </div>
    </div>
  )
}

export default CustomFrame
