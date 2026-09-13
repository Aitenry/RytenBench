import { createContext } from 'react'
import type { LanguageContextType } from '@renderer/types/language'

export type { LanguageContextType }

export const LanguageContext = createContext<LanguageContextType>({
  language: 'zh-CN',
  setLanguage: async () => {}
})
