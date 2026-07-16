import { useMemo } from 'react'
import { theme } from 'antd'
import { useTheme } from '@renderer/contexts/useTheme'
import type { ThemePalette } from '@renderer/types/components'
import { STICKY_LIGHT, STICKY_DARK } from '../utils/canvasConstants'

export function useThemePalette(): ThemePalette {
  const { effectiveTheme } = useTheme()
  const { token } = theme.useToken()
  const isDark = effectiveTheme === 'dark'

  return useMemo(
    () => ({
      wikiStackOuter: isDark ? '#2a2a2a' : '#e8e8e8',
      wikiStackInner: isDark ? '#333333' : '#eeeeee',
      wikiStackShadow: '0 1px 3px rgba(0,0,0,0.08)',
      wikiCardBg: isDark ? '#1a1a1a' : '#ffffff',
      wikiCardShadow: isDark
        ? '0 4px 16px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.20)'
        : '0 4px 16px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)',
      wikiIconColor: isDark ? '#a78bfa' : '#7c3aed',
      stickyColors: isDark ? STICKY_DARK : STICKY_LIGHT,
      docCardBg: isDark ? token.colorFillAlter : '#f0f0f0',
      docCardBorder: isDark ? token.colorBorderSecondary : '#e5e5e5',
      docCardShadow: isDark
        ? '0 2px 10px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.15)'
        : '0 2px 10px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)',
      docIconColor: isDark ? '#999' : '#888',
      todoDescColor: isDark ? '#bbb' : '#555',
      textColor: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.88)',
      textSecondary: isDark ? '#999' : '#666'
    }),
    [isDark, token]
  )
}
