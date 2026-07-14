import React from 'react'
import type { BuildProgressContextType } from '@renderer/types/build-progress'

export type { BuildProgressContextType }

export const BuildProgressContext = React.createContext<BuildProgressContextType | undefined>(
  undefined
)
