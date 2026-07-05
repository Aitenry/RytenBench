import { useContext } from 'react'
import { ThemeContext, type ThemeContextType } from './ThemeContextCore'

export const useTheme = (): ThemeContextType => {
  return useContext(ThemeContext)
}
