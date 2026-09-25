/**
 * 构建进度上下文类型。
 *
 * 契约分两侧（home 插件迁移后的形态）：
 * - core 侧（BuildProgressProvider，外壳常驻）持有进度状态与通知中心，读 `plugin:home:graph-build-*`
 *   事件；home 停用只是收不到事件，外壳照常渲染；
 * - 插件侧（home 的 BuildProgressOverlay，经 `ctx.use('appProvider')` 注册）读 `builds`
 *   渲染进度弹窗、调 `minimizeBuild` 收起——弹窗组件留在插件里，外壳不 import 插件模块。
 */
export interface BuildProgressContextType {
  /** 当前所有构建的状态（含已完成/已收起，由消费方自行过滤） */
  builds: BuildProgressState[]
  startBuild: (wikiId: number, wikiTitle: string) => void
  restoreBuild: (wikiId: number) => void
  /** 收起进度弹窗（仅改 minimized，不删状态） */
  minimizeBuild: (wikiId: number) => void
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
