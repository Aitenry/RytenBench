import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Window } from '../../resource/types/window'
import BuildProgress from '@renderer/components/graph/BuildProgress'
import { BuildProgressContext } from './BuildProgressContext'
import { useNotification } from '@renderer/contexts/useNotification'
import { useTranslation } from '@renderer/i18n'
import type { TFunction } from 'i18next'
import type { BuildProgressState } from '@renderer/types/build-progress'
import type { BuildProgressNotification } from '@renderer/types/notification'
import type { BuildProgressProviderProps } from '@renderer/types/components'

/** 全局事件：请求打开某知识库的图谱视图（首页 HomeView 监听并切换选中） */
export const OPEN_WIKI_GRAPH_EVENT = 'open-wiki-graph'

/** 构建进度通知的文案组装：普通函数，t 由调用方注入（内部不调 hook） */
const buildStateToNotification = (
  t: TFunction,
  id: string,
  state: BuildProgressState,
  onClick: () => void
): BuildProgressNotification => ({
  id,
  type: 'build_progress',
  title: state.wikiTitle,
  description: state.completed
    ? t('shell.build.completedSummary', {
        count: state.entityCount,
        entityCount: state.entityCount,
        relationCount: state.relationCount
      })
    : t('shell.build.progressSummary', {
        phase: state.phaseLabel,
        percent: state.overallProgress,
        message: state.message
      }),
  timestamp: Date.now(),
  read: false,
  onClick,
  wikiId: state.wikiId,
  wikiTitle: state.wikiTitle,
  phaseLabel: state.phaseLabel,
  phaseProgress: state.phaseProgress,
  overallProgress: state.overallProgress,
  entityCount: state.entityCount,
  relationCount: state.relationCount,
  message: state.message,
  completed: state.completed,
  minimized: state.minimized
})

export const BuildProgressProvider: React.FC<BuildProgressProviderProps> = ({ children }) => {
  const [buildMap, setBuildMap] = useState<Map<number, BuildProgressState>>(new Map())
  const refreshCallbacks = useRef<Map<number, Set<() => void>>>(new Map())
  const { addNotification, updateNotification, removeNotification } = useNotification()
  const { t } = useTranslation()

  const subscribeToRefresh = (wikiId: number, callback: () => void): (() => void) => {
    const callbacks = refreshCallbacks.current.get(wikiId) || new Set()
    callbacks.add(callback)
    refreshCallbacks.current.set(wikiId, callbacks)
    return () => {
      const currentCallbacks = refreshCallbacks.current.get(wikiId)
      if (currentCallbacks) {
        currentCallbacks.delete(callback)
      }
    }
  }

  const startBuild = (wikiId: number, wikiTitle: string): void => {
    const state: BuildProgressState = {
      wikiId,
      wikiTitle,
      phase: '',
      phaseLabel: t('shell.build.initializing'),
      phaseProgress: 0,
      overallProgress: 0,
      processedDocs: 0,
      totalDocs: 0,
      processedChunks: 0,
      totalChunks: 0,
      entityCount: 0,
      relationCount: 0,
      message: t('shell.build.initializingMessage'),
      minimized: false,
      completed: false
    }

    setBuildMap((prev) => {
      const next = new Map(prev)
      next.set(wikiId, state)
      return next
    })

    const notifId = `build-${wikiId}`
    addNotification(buildStateToNotification(t, notifId, state, () => restoreBuild(wikiId)))
  }

  const restoreBuild = useCallback((wikiId: number): void => {
    setBuildMap((prev) => {
      const next = new Map(prev)
      const state = next.get(wikiId)
      if (state) {
        const updated = { ...state, minimized: false }
        next.set(wikiId, updated)
      }
      return next
    })
  }, [])

  const navigateToGraph = useCallback(
    (wikiId: number): void => {
      /* 原实现 navigate('/knowledge/graph?wikiId=...')，但该路由早已不存在（首页重构后图谱改为工作台视图）——改为派发事件，由首页 HomeView 切换选中 */
      window.dispatchEvent(
        new CustomEvent<{ wikiId: number }>(OPEN_WIKI_GRAPH_EVENT, { detail: { wikiId } })
      )
      removeNotification(`build-${wikiId}`)
      setBuildMap((prev) => {
        const next = new Map(prev)
        next.delete(wikiId)
        return next
      })
    },
    [removeNotification]
  )

  const handleMinimize = (wikiId: number): void => {
    setBuildMap((prev) => {
      const next = new Map(prev)
      const state = next.get(wikiId)
      if (state) {
        next.set(wikiId, { ...state, minimized: true })
      }
      return next
    })
  }

  const handleProgress = (progress: {
    wikiId: number
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
    needsRefresh?: boolean
  }): void => {
    setBuildMap((prev) => {
      const next = new Map(prev)
      const existing = next.get(progress.wikiId)
      const updated: BuildProgressState = {
        wikiId: progress.wikiId,
        wikiTitle: existing?.wikiTitle || t('shell.build.unknownWiki', { id: progress.wikiId }),
        phase: progress.phase,
        phaseLabel: progress.phaseLabel,
        phaseProgress: progress.phaseProgress,
        overallProgress: progress.overallProgress,
        processedDocs: progress.processedDocs,
        totalDocs: progress.totalDocs,
        processedChunks: progress.processedChunks,
        totalChunks: progress.totalChunks,
        entityCount: progress.entityCount,
        relationCount: progress.relationCount,
        message: progress.message,
        minimized: existing?.minimized ?? false,
        completed: existing?.completed ?? false
      }
      next.set(progress.wikiId, updated)
      return next
    })

    if (progress.needsRefresh) {
      const callbacks = refreshCallbacks.current.get(progress.wikiId)
      if (callbacks) {
        callbacks.forEach((callback) => callback())
      }
    }
  }

  const handleComplete = (result: {
    wikiId: number
    entityCount: number
    relationCount: number
  }): void => {
    setBuildMap((prev) => {
      const next = new Map(prev)
      const state = next.get(result.wikiId)
      if (state) {
        next.set(result.wikiId, {
          ...state,
          completed: true,
          entityCount: result.entityCount,
          relationCount: result.relationCount,
          overallProgress: 100
        })
      }
      return next
    })
  }

  const handleError = (error: { wikiId: number; error: string }): void => {
    removeNotification(`build-${error.wikiId}`)
    setBuildMap((prev) => {
      const next = new Map(prev)
      next.delete(error.wikiId)
      return next
    })
  }

  /**
   * 订阅图谱构建事件（主进程 → 渲染层）。
   *
   * 迁移说明：图谱通道已随 home 插件收进 `plugin:home:graph-build-*`，并随插件启停注册/摘除。
   * 本 Provider 是无条件挂载的外壳 Provider，**停用 home 插件时通道不存在**：
   * - preload 的 `api.graph.onBuild*` 直接 `ipcRenderer.on`，通常不抛；
   * - 走通用桥 `window.api.plugin.on` 时白名单会拒（抛「插件通道未启用」）。
   * 旧代码让异常从 useEffect 逃逸 → Provider 卸载 → 整棵应用树崩掉（白屏）。
   * 这里统一 try/catch，订阅失败只是「没有进度事件」，不再影响外壳渲染。
   */
  useEffect(() => {
    const api = (window as unknown as Window).api
    const subscribe = <T,>(
      label: string,
      run: (cb: (payload: T) => void) => () => void,
      cb: (payload: T) => void
    ): (() => void) => {
      try {
        return run(cb)
      } catch (error) {
        console.warn(
          `[BuildProgress] 订阅 ${label} 失败（home 插件可能未启用），已降级为空闲：`,
          error
        )
        return () => {}
      }
    }

    const cleanupProgress = subscribe(
      'graph-build-progress',
      api.graph.onBuildProgress,
      handleProgress
    )
    const cleanupComplete = subscribe(
      'graph-build-complete',
      api.graph.onBuildComplete,
      handleComplete
    )
    const cleanupError = subscribe('graph-build-error', api.graph.onBuildError, handleError)

    return () => {
      cleanupProgress()
      cleanupComplete()
      cleanupError()
    }
  }, [])

  // 同步 buildMap 变更到通知系统
  useEffect(() => {
    buildMap.forEach((state, wikiId) => {
      const notifId = `build-${wikiId}`
      // 修复：已完成的构建通知点击后是「恢复一个不会再渲染的 completed 状态」= 无任何反馈
      // 且通知永不清理——完成态改为直达该知识库图谱（navigateToGraph 会移除通知与状态）
      updateNotification(
        notifId,
        buildStateToNotification(t, notifId, state, () =>
          state.completed ? navigateToGraph(wikiId) : restoreBuild(wikiId)
        )
      )
    })
  }, [buildMap, updateNotification, restoreBuild, navigateToGraph, t])

  const activeBuilds = Array.from(buildMap.values())

  return (
    <BuildProgressContext.Provider
      value={{ startBuild, restoreBuild, navigateToGraph, subscribeToRefresh }}
    >
      {children}

      {activeBuilds
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
            onMinimize={() => handleMinimize(state.wikiId)}
          />
        ))}
    </BuildProgressContext.Provider>
  )
}
