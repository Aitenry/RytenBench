import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Window } from '../../resource/types/window'
import BuildProgress from '@renderer/components/graph/BuildProgress'
import { BuildProgressContext } from './BuildProgressContext'
import { useNotification } from '@renderer/contexts/useNotification'
import type { BuildProgressState } from '@renderer/types/build-progress'
import type { BuildProgressNotification } from '@renderer/types/notification'
import type { BuildProgressProviderProps } from '@renderer/types/components'

export const BuildProgressProvider: React.FC<BuildProgressProviderProps> = ({ children }) => {
  const [buildMap, setBuildMap] = useState<Map<number, BuildProgressState>>(new Map())
  const refreshCallbacks = useRef<Map<number, Set<() => void>>>(new Map())
  const navigate = useNavigate()
  const { addNotification, updateNotification, removeNotification } = useNotification()

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
      phaseLabel: '初始化',
      phaseProgress: 0,
      overallProgress: 0,
      processedDocs: 0,
      totalDocs: 0,
      processedChunks: 0,
      totalChunks: 0,
      entityCount: 0,
      relationCount: 0,
      message: '初始化...',
      minimized: false,
      completed: false
    }

    setBuildMap((prev) => {
      const next = new Map(prev)
      next.set(wikiId, state)
      return next
    })

    const notifId = `build-${wikiId}`
    addNotification(buildStateToNotification(notifId, state, () => restoreBuild(wikiId)))
  }

  const buildStateToNotification = (
    id: string,
    state: BuildProgressState,
    onClick: () => void
  ): BuildProgressNotification => ({
    id,
    type: 'build_progress',
    title: state.wikiTitle,
    description: state.completed
      ? `${state.entityCount} 实体, ${state.relationCount} 关系`
      : `${state.phaseLabel} ${state.overallProgress}% — ${state.message}`,
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
      navigate(`/knowledge/graph?wikiId=${wikiId}`)
      removeNotification(`build-${wikiId}`)
      setBuildMap((prev) => {
        const next = new Map(prev)
        next.delete(wikiId)
        return next
      })
    },
    [navigate, removeNotification]
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
        wikiTitle: existing?.wikiTitle || `知识库 #${progress.wikiId}`,
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

  useEffect(() => {
    const cleanupProgress = (window as unknown as Window).api.graph.onBuildProgress(handleProgress)
    const cleanupComplete = (window as unknown as Window).api.graph.onBuildComplete(handleComplete)
    const cleanupError = (window as unknown as Window).api.graph.onBuildError(handleError)

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
      updateNotification(
        notifId,
        buildStateToNotification(notifId, state, () => restoreBuild(wikiId))
      )
    })
  }, [buildMap, updateNotification, restoreBuild])

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
