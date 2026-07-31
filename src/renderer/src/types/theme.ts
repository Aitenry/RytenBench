import type { ThemeMode } from './settings'

export interface ThemeContextType {
  themeMode: ThemeMode
  effectiveTheme: 'light' | 'dark'
  setThemeMode: (mode: ThemeMode) => Promise<void>
}
