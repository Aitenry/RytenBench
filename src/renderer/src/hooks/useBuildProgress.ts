import React from 'react'
import { BuildProgressContext, BuildProgressContextType } from '../providers/BuildProgressContext'

export const useBuildProgress = (): BuildProgressContextType => {
  const context = React.useContext(BuildProgressContext)
  if (!context) {
    throw new Error('useBuildProgress must be used within a BuildProgressProvider')
  }
  return context
}
