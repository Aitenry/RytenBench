import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { theme, Badge, Popover, List, Progress, Tag, Typography } from 'antd'
import {
  RiCalendar2Line,
  RiChatAiLine,
  RiCollapseDiagonal2Line,
  RiDashboardLine,
  RiExpandDiagonal2Line,
  RiMusicLine,
  RiNotification3Line,
  RiRefreshLine,
  RiSettings3Line,
  RiShutDownLine,
  RiSubtractLine,
  RiSunCloudyLine
} from '@remixicon/react'
import { Window } from '../../../resource/types/window'
import MainRoutes from '@renderer/route/MainRoutes'
import SettingsModal from './settings/SettingsModal'
import MusicMiniPlayer from './MusicMiniPlayer'
import { useTheme } from '@renderer/contexts/useTheme'
import { useAudioState, useAudioProgress } from '@renderer/contexts/AudioContext'
import { useNotification } from '@renderer/contexts/NotificationContext'
import type { BuildProgressNotification } from '@renderer/types/notification'
import { formatTime } from '@renderer/utils/formatTime'

interface WeatherData {
  location: string
  current: Record<string, unknown>
  daily: Record<string, unknown>[]
}

interface CustomFrameProps {
  currentKey: string
  setCurrentKey: (key: string) => void
}

const CustomFrame: React.FC<CustomFrameProps> = ({ currentKey, setCurrentKey }) => {
  const navigate = useNavigate()
  const { effectiveTheme } = useTheme()
  const { currentTrack } = useAudioState()
  const { progress } = useAudioProgress()
  const isDark = effectiveTheme === 'dark'
  const {
    token: {
      colorBgContainer,
      colorBgLayout,
      borderRadiusLG,
      colorFillAlter,
      colorPrimary,
      colorText,
      colorTextSecondary
    }
  } = theme.useToken()

  const [isMaximized, setIsMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  // 底部轮播
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [carouselPaused, setCarouselPaused] = useState(false)
  const [popupOpen, setPopupOpen] = useState(false)
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null)
  const [weatherCity, setWeatherCity] = useState<string>('')
  const [weatherLoading, setWeatherLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const CAROUSEL_INTERVAL = 4000

  const api = (window as unknown as Window).api
  const { notifications, unreadCount, markAllRead } = useNotification()

  // 手动刷新天气（强制拉取最新）
  const refreshWeather = useCallback(async (): Promise<void> => {
    setWeatherLoading(true)
    try {
      const data = (await api.weather.getCurrent(true)) as unknown as WeatherData
      setWeatherData(data)
    } catch {
      // 静默处理
    } finally {
      setWeatherLoading(false)
    }
  }, [])

  // 启动时加载城市 + 监听后端天气推送 + 加载缓存数据
  useEffect(() => {
    api.systemSettings.getAll().then((s) => {
      const city = s.ip?.city as string | undefined
      if (city) setWeatherCity(city)
    })
    const unsub = api.weather.onUpdate((data: unknown) => setWeatherData(data as WeatherData))
    // 启动时加载缓存数据（不强制刷新）
    api.weather.getCurrent().then((data: unknown) => {
      if (data) setWeatherData(data as WeatherData)
    })
    return unsub
  }, [])

  // 轮播定时器
  const carouselItems = useMemo(() => {
    const items: ('music' | 'weather')[] = ['weather']
    if (currentTrack) items.unshift('music')
    return items
  }, [currentTrack])

  // items 变化时重置索引
  useEffect(() => {
    setCarouselIndex(0)
  }, [carouselItems.length])

  useEffect(() => {
    if (carouselPaused || carouselItems.length <= 1) return
    timerRef.current = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % carouselItems.length)
    }, CAROUSEL_INTERVAL)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [carouselPaused])

  const handleCarouselEnter = useCallback(() => {
    setCarouselPaused(true)
    setPopupOpen(true)
  }, [])

  const handleCarouselLeave = useCallback(() => {
    setCarouselPaused(false)
    setPopupOpen(false)
  }, [])
  useEffect(() => {
    const api = (window as unknown as Window).api
    api.window.isMaximized().then(setIsMaximized)
    return api.window.onMaximized(setIsMaximized)
  }, [])

  // 右侧菜单项（不含设置，设置在标题栏）
  const menuItems = [
    { key: 'home', label: '首页', icon: <RiDashboardLine size={16} /> },
    { key: 'chat', label: '助手', icon: <RiChatAiLine size={16} /> },
    { key: 'planner', label: '计划', icon: <RiCalendar2Line size={16} /> },
    { key: 'music', label: '音乐', icon: <RiMusicLine size={16} /> }
  ]

  const onMenuClick = (key: string): void => {
    navigate(`/${key}`)
    setCurrentKey(key)
  }

  // 通知面板内容渲染
  const renderNotifContent = (): React.ReactNode => {
    if (notifications.length === 0) {
      return (
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            color: colorTextSecondary,
            fontSize: 13
          }}
        >
          暂无消息
        </div>
      )
    }
    return (
      <div style={{ maxHeight: 360, overflow: 'auto', width: 320 }}>
        <List
          dataSource={notifications}
          renderItem={(item) => {
            const isBuild = item.type === 'build_progress'
            const buildItem = isBuild ? (item as BuildProgressNotification) : null
            return (
              <List.Item
                style={{
                  cursor: 'pointer',
                  padding: '10px 16px',
                  borderBottom: `1px solid ${colorFillAlter}`
                }}
                onClick={() => {
                  item.onClick?.()
                  setNotifOpen(false)
                }}
              >
                <List.Item.Meta
                  title={
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8
                      }}
                    >
                      <Typography.Text style={{ fontSize: 13, color: colorText, flex: 1 }} ellipsis>
                        {item.title}
                      </Typography.Text>
                      {buildItem && buildItem.completed && (
                        <Tag
                          color="success"
                          style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}
                        >
                          已完成
                        </Tag>
                      )}
                      {buildItem && !buildItem.completed && (
                        <Tag
                          color="processing"
                          style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}
                        >
                          {buildItem.phaseLabel}
                        </Tag>
                      )}
                    </div>
                  }
                  description={
                    <div style={{ fontSize: 12, color: colorTextSecondary }}>
                      <div style={{ marginBottom: buildItem && !buildItem.completed ? 6 : 0 }}>
                        {item.description}
                      </div>
                      {buildItem && !buildItem.completed && (
                        <Progress
                          percent={buildItem.overallProgress}
                          size="small"
                          strokeColor="#1677ff"
                          showInfo={false}
                          style={{ marginBottom: 4 }}
                        />
                      )}
                    </div>
                  }
                />
              </List.Item>
            )
          }}
        />
      </div>
    )
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
            <button
              className="frame-titlebar-btn"
              onClick={() => api.window.minimize()}
              title="最小化"
            >
              <RiSubtractLine size={16} />
            </button>
            <button
              className="frame-titlebar-btn"
              onClick={() => api.window.maximize()}
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
              onClick={() => api.window.close()}
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

          {/* 右边栏：消息 & 设置 */}
          <div className="frame-body-right">
            <div className="frame-menu" style={{ background: colorFillAlter }}>
              <Popover
                content={renderNotifContent()}
                trigger="click"
                open={notifOpen}
                onOpenChange={(open) => {
                  setNotifOpen(open)
                  if (!open) markAllRead()
                }}
                placement="leftTop"
              >
                <Badge dot={unreadCount > 0} offset={[-4, 4]}>
                  <button
                    className="frame-menu-item"
                    title="消息"
                    style={{ color: colorTextSecondary }}
                  >
                    <RiNotification3Line size={16} />
                  </button>
                </Badge>
              </Popover>
              <button
                className="frame-menu-item"
                onClick={() => setSettingsOpen(true)}
                title="设置"
                style={{ color: colorTextSecondary }}
              >
                <RiSettings3Line size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ======== 底部信息栏 ======== */}
        <div className="frame-bottombar" style={{ background: colorFillAlter }}>
          <div className="frame-bottombar-inner" onMouseLeave={handleCarouselLeave}>
            {/* 弹出详情卡片 */}
            {popupOpen && (
              <div
                className="frame-bottombar-popup"
                style={{
                  background: colorBgContainer,
                  color: colorText,
                  boxShadow: `0 -2px 12px rgba(0,0,0,${isDark ? '0.3' : '0.08'})`
                }}
              >
                {carouselItems[carouselIndex] === 'music' ? (
                  <MusicMiniPlayer />
                ) : (
                  <div className="text-sm">
                    {weatherLoading ? (
                      <span style={{ color: colorTextSecondary }}>加载中...</span>
                    ) : weatherData ? (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-medium" style={{ color: colorText }}>
                            {weatherData.location as string}
                          </div>
                          <button
                            className="frame-titlebar-btn"
                            onClick={refreshWeather}
                            title="刷新天气"
                          >
                            <RiRefreshLine size={14} />
                          </button>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className="text-2xl font-semibold" style={{ color: colorText }}>
                            {weatherData.current.temp as string}°C
                          </span>
                          <span style={{ color: colorTextSecondary }}>
                            {weatherData.current.weatherDesc as string}
                          </span>
                        </div>
                        <div className="flex gap-3 text-xs" style={{ color: colorTextSecondary }}>
                          <span>体感 {weatherData.current.apparentTemp as string}°C</span>
                          <span>湿度 {weatherData.current.humidity as number}%</span>
                          <span>风速 {weatherData.current.windSpeed as string}km/h</span>
                        </div>
                        {(weatherData.daily as Record<string, unknown>[]).length > 0 && (
                          <div
                            className="mt-3 pt-2 border-t flex gap-3 text-xs"
                            style={{ borderColor: colorTextSecondary }}
                          >
                            {(weatherData.daily as Record<string, unknown>[])
                              .slice(0, 3)
                              .map((d, i) => (
                                <div key={i} className="text-center flex-1">
                                  <div style={{ color: colorText }}>{d.label as string}</div>
                                  <div style={{ color: colorTextSecondary }}>
                                    {d.weatherDesc as string}
                                  </div>
                                  <div style={{ color: colorText }}>
                                    {d.tempMax as string}°/{d.tempMin as string}°
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ color: colorTextSecondary }}>暂无天气数据</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 轮播指示器 + 当前内容摘要 */}
            <div className="frame-bottombar-track">
              <div
                className="frame-bottombar-item"
                style={{ color: colorText }}
                onMouseEnter={handleCarouselEnter}
              >
                {carouselItems[carouselIndex] === 'music' ? (
                  <span className="flex items-center gap-1.5">
                    <RiMusicLine size={14} />
                    {currentTrack?.title || '音乐'}
                    {currentTrack && (
                      <span style={{ color: colorTextSecondary }}>{formatTime(progress)}</span>
                    )}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <RiSunCloudyLine size={14} />
                    {weatherData
                      ? `${weatherData.current.temp}° ${weatherData.current.weatherDesc}`
                      : weatherCity || '天气'}
                  </span>
                )}
              </div>
              {/* 进度点 */}
              <div className="frame-bottombar-dots">
                {carouselItems.map((_, idx) => (
                  <span
                    key={idx}
                    className="frame-bottombar-dot"
                    style={
                      idx === carouselIndex
                        ? { width: 16, borderRadius: 3, background: colorPrimary }
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default CustomFrame
