import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ThemeMode } from '@renderer/types/settings'
import { Window } from '../../resource/types/window'

const { defaultAlgorithm, darkAlgorithm } = theme

interface ThemeContextType {
  themeMode: ThemeMode
  effectiveTheme: 'light' | 'dark'
  setThemeMode: (mode: ThemeMode) => Promise<void>
  loading: boolean
}

const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'auto',
  effectiveTheme: 'light',
  setThemeMode: async () => {},
  loading: true
})

/**
 * 根据当前时间（小时）判断应该使用亮色还是暗色主题。
 * 6:00 ~ 18:00 为白天 → 亮色，其余时间为夜间 → 暗色。
 */
const getTimeBasedTheme = (): 'light' | 'dark' => {
  const hour = new Date().getHours()
  return hour >= 6 && hour < 18 ? 'light' : 'dark'
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('auto')
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(getTimeBasedTheme())
  const [loading, setLoading] = useState(true)

  // 挂载时从系统设置加载主题偏好
  useEffect(() => {
    const loadTheme = async (): Promise<void> => {
      try {
        const settings = await (window as unknown as Window).api.systemSettings.getAll()
        const savedTheme = settings.theme as ThemeMode | undefined
        const mode = savedTheme || 'auto'
        setThemeModeState(mode)
        if (mode !== 'auto') {
          setEffectiveTheme(mode)
        } else {
          setEffectiveTheme(getTimeBasedTheme())
        }
      } catch {
        // 加载失败时使用默认值
      } finally {
        setLoading(false)
      }
    }
    loadTheme().then()
  }, [])

  // 自动模式：每分钟根据时间更新一次有效主题
  useEffect(() => {
    if (themeMode !== 'auto') return
    setEffectiveTheme(getTimeBasedTheme())
    const interval = setInterval(() => {
      setEffectiveTheme(getTimeBasedTheme())
    }, 60_000)
    return () => clearInterval(interval)
  }, [themeMode])

  // 同步 Tailwind v4 的 dark 类名到 document 根元素
  const isDark = effectiveTheme === 'dark'
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  const setThemeMode = useCallback(async (mode: ThemeMode): Promise<void> => {
    // 先存储到后端，失败也不影响本地状态更新
    try {
      await (window as unknown as Window).api.systemSettings.update({ theme: mode })
    } catch {
      // 静默处理
    }
    setThemeModeState(mode)
    if (mode !== 'auto') {
      setEffectiveTheme(mode)
    } else {
      setEffectiveTheme(getTimeBasedTheme())
    }
  }, [])

  const contextValue = useMemo<ThemeContextType>(
    () => ({
      themeMode,
      effectiveTheme,
      setThemeMode,
      loading
    }),
    [themeMode, effectiveTheme, setThemeMode, loading]
  )

  return (
    <ThemeContext.Provider value={contextValue}>
      <ConfigProvider
        locale={zhCN}
        theme={{ algorithm: isDark ? darkAlgorithm : defaultAlgorithm }}
      >
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  )
}

export const useTheme = (): ThemeContextType => {
  return useContext(ThemeContext)
}
