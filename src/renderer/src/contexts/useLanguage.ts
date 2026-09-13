import { useContext } from 'react'
import { LanguageContext, type LanguageContextType } from './LanguageContextCore'

export const useLanguage = (): LanguageContextType => {
  return useContext(LanguageContext)
}
