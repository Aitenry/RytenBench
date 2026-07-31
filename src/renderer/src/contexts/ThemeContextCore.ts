import { createContext } from 'react'
import type { ThemeContextType } from '@renderer/types/theme'

export type { ThemeContextType }

export const ThemeContext = createContext<ThemeContextType>({
  themeMode: 'auto',
  effectiveTheme: 'light',
  setThemeMode: async () => {}
})
