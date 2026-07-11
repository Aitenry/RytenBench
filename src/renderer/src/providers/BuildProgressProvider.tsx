import React, { ReactNode, useEffect, useRef, useState } from 'react'
import { FloatButton, Tooltip } from 'antd'
import { LoadingOutlined, MinusOutlined } from '@ant-design/icons'
import { Window } from '../../resource/types/window'
import BuildProgress from '../views/knowledge/graph/BuildProgress'
import { BuildProgressContext } from './BuildProgressContext'

interface BuildProgressState {
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
}

interface BuildProgressProviderProps {
  children: ReactNode
}

export const BuildProgressProvider: React.FC<BuildProgressProviderProps> = ({ children }) => {
  const [buildMap, setBuildMap] = useState<Map<number, BuildProgressState>>(new Map())
  const refreshCallbacks = useRef<Map<number, Set<() => void>>>(new Map())

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
    setBuildMap((prev) => {
      const next = new Map(prev)
      next.set(wikiId, {
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
        minimized: false
      })
      return next
    })
  }

  const restoreBuild = (wikiId: number): void => {
    setBuildMap((prev) => {
      const next = new Map(prev)
      const state = next.get(wikiId)
      if (state) {
        next.set(wikiId, { ...state, minimized: false })
      }
      return next
    })
  }

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
      next.set(progress.wikiId, {
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
        minimized: existing?.minimized ?? false
      })
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
      next.delete(result.wikiId)
      return next
    })
  }

  const handleError = (error: { wikiId: number; error: string }): void => {
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

  const activeBuilds = Array.from(buildMap.values())
  const hasActiveBuilds = activeBuilds.length > 0

  return (
    <BuildProgressContext.Provider value={{ startBuild, restoreBuild, subscribeToRefresh }}>
      {children}

      {activeBuilds.map((state) => (
        <BuildProgress
          key={state.wikiId}
          open={!state.minimized}
          wikiId={state.wikiId}
          wikiTitle={state.wikiTitle}
          phase={state.phase}
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

      {hasActiveBuilds && (
        <FloatButton.Group icon={<LoadingOutlined />} style={{ right: 24, bottom: 24 }}>
          {activeBuilds.map((state) => {
            const percent = state.overallProgress

            return (
              <Tooltip title={`${state.wikiTitle} - ${percent}%`} key={state.wikiId}>
                <FloatButton
                  icon={<MinusOutlined />}
                  badge={{ count: percent, color: percent === 100 ? '#52c41a' : '#1677ff' }}
                  onClick={() => restoreBuild(state.wikiId)}
                />
              </Tooltip>
            )
          })}
        </FloatButton.Group>
      )}
    </BuildProgressContext.Provider>
  )
}
