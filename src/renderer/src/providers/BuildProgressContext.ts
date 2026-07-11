import React from 'react'

export interface BuildProgressContextType {
  startBuild: (wikiId: number, wikiTitle: string) => void
  restoreBuild: (wikiId: number) => void
  subscribeToRefresh: (wikiId: number, callback: () => void) => () => void
}

export const BuildProgressContext = React.createContext<BuildProgressContextType | undefined>(
  undefined
)
