import { useContext } from 'react'
import { LanguageContext, type LanguageContextType } from '../contexts/LanguageContextCore'

export const useLanguage = (): LanguageContextType => {
  return useContext(LanguageContext)
}
