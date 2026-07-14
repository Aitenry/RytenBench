/** 构建进度上下文类型 */
export interface BuildProgressContextType {
  startBuild: (wikiId: number, wikiTitle: string) => void
  restoreBuild: (wikiId: number) => void
  navigateToGraph: (wikiId: number) => void
  subscribeToRefresh: (wikiId: number, callback: () => void) => () => void
}

/** 构建进度状态 */
export interface BuildProgressState {
  wikiId: number
  wikiTitle: string
  phase: string
  phaseLabel: string
  phaseProgress: number
  overallProgress: number
  processedDocs: number
  totalDocs: number
  processedChunks: number
  totalChunks: number
  entityCount: number
  relationCount: number
  message: string
  minimized: boolean
  completed: boolean
}
