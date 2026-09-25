import React from 'react'
import { useBuildProgress } from '@renderer/hooks/useBuildProgress'
import BuildProgress from '../components/graph/BuildProgress'

/**
 * 图谱构建进度浮层（home 插件经 `ctx.use('appProvider')` 注册）。
 *
 * 为什么 UI 在插件里、状态在 core：构建进度的**通知**由外壳的
 * `BuildProgressProvider`（core，常驻 Provider）负责——它持有 buildMap、写通知中心，
 * 并在 home 停用时优雅降级；而进度弹窗本体（`components/graph/BuildProgress`）属于首页的
 * 图谱视图，必须留在插件里，否则外壳就要 import 插件组件（插件停用即崩）。
 *
 * 两者经 core 的 `BuildProgressContext` 对接：本组件读 `builds` 渲染弹窗、
 * 调 `minimizeBuild` 收起。home 停用时本 Provider 卸载 → 浮层消失（进度状态仍在 core 里）。
 */
export const BuildProgressOverlay: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { builds, minimizeBuild } = useBuildProgress()

  return (
    <>
      {children}
      {builds
        .filter((state) => !state.completed)
        .map((state) => (
          <BuildProgress
            key={state.wikiId}
            open={!state.minimized}
            wikiId={state.wikiId}
            wikiTitle={state.wikiTitle}
            phaseLabel={state.phaseLabel}
            phaseProgress={state.phaseProgress}
            overallProgress={state.overallProgress}
            processedDocs={state.processedDocs}
            totalDocs={state.totalDocs}
            processedChunks={state.processedChunks}
            totalChunks={state.totalChunks}
            entityCount={state.entityCount}
            relationCount={state.relationCount}
            message={state.message}
            onMinimize={() => minimizeBuild(state.wikiId)}
          />
        ))}
    </>
  )
}

export default BuildProgressOverlay
