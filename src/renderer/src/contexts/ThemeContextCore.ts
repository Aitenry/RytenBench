import { createContext } from 'react'
import type { ThemeMode } from '@renderer/types/settings'

export interface ThemeContextType {
  themeMode: ThemeMode
  effectiveTheme: 'light' | 'dark'
  setThemeMode: (mode: ThemeMode) => Promise<void>
  loading: boolean
}

export const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'auto',
  effectiveTheme: 'light',
  setThemeMode: async () => {},
  loading: true
})
