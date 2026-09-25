import { useContext } from 'react'
import { ThemeContext, type ThemeContextType } from '../contexts/ThemeContextCore'

export const useTheme = (): ThemeContextType => {
  return useContext(ThemeContext)
}
