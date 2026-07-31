import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { RiMusicLine, RiRefreshLine, RiSunCloudyLine } from '@remixicon/react'
import { useTheme } from '@renderer/contexts/useTheme'
import { useAudioState, useAudioProgress } from '@renderer/contexts/AudioContext'
import { formatTime } from '@renderer/utils/formatTime'
import MusicMiniPlayer from '../MusicMiniPlayer'
import { Window } from '../../../../resource/types/window'

interface WeatherData {
  location: string
  current: Record<string, unknown>
  daily: Record<string, unknown>[]
}

interface BottomBarProps {
  colorBgContainer: string
  colorFillAlter: string
  colorPrimary: string
  colorText: string
  colorTextSecondary: string
}

const CAROUSEL_INTERVAL = 4000

const BottomBar: React.FC<BottomBarProps> = ({
  colorBgContainer,
  colorFillAlter,
  colorPrimary,
  colorText,
  colorTextSecondary
}) => {
  const { effectiveTheme } = useTheme()
  const { currentTrack } = useAudioState()
  const { progress } = useAudioProgress()
  const isDark = effectiveTheme === 'dark'

  const [carouselIndex, setCarouselIndex] = useState(0)
  const [carouselPaused, setCarouselPaused] = useState(false)
  const [popupOpen, setPopupOpen] = useState(false)
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null)
  const [weatherCity, setWeatherCity] = useState<string>('')
  const [weatherLoading, setWeatherLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const api = (window as unknown as Window).api

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

  useEffect(() => {
    api.systemSettings.getAll().then((s) => {
      const city = s.ip?.city as string | undefined
      if (city) setWeatherCity(city)
    })
    const unsub = api.weather.onUpdate((data: unknown) => setWeatherData(data as WeatherData))
    api.weather.getCurrent().then((data: unknown) => {
      if (data) setWeatherData(data as WeatherData)
    })
    return unsub
  }, [])

  const carouselItems = useMemo(() => {
    const items: ('music' | 'weather')[] = ['weather']
    if (currentTrack) items.unshift('music')
    return items
  }, [currentTrack])

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

  return (
    <div className="frame-bottombar" style={{ background: colorFillAlter }}>
      <div className="frame-bottombar-inner" onMouseLeave={handleCarouselLeave}>
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
  )
}

export default BottomBar
