import React, { ReactNode, useEffect, useRef, useState } from 'react'
import { Dropdown, FloatButton } from 'antd'
import type { MenuProps } from 'antd'
import { CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons'
import { RiBubbleChartLine } from '@remixicon/react'
import { useNavigate } from 'react-router-dom'
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
  completed: boolean
}

interface BuildProgressProviderProps {
  children: ReactNode
}

export const BuildProgressProvider: React.FC<BuildProgressProviderProps> = ({ children }) => {
  const [buildMap, setBuildMap] = useState<Map<number, BuildProgressState>>(new Map())
  const refreshCallbacks = useRef<Map<number, Set<() => void>>>(new Map())
  const navigate = useNavigate()

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
        minimized: false,
        completed: false
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

  const navigateToGraph = (wikiId: number): void => {
    navigate(`/knowledge/graph?wikiId=${wikiId}`)
    setBuildMap((prev) => {
      const next = new Map(prev)
      next.delete(wikiId)
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
        minimized: existing?.minimized ?? false,
        completed: existing?.completed ?? false
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
  const allCompleted = hasActiveBuilds && activeBuilds.every((s) => s.completed)
  const incompleteCount = activeBuilds.filter((s) => !s.completed).length

  const menuItems: MenuProps['items'] = activeBuilds.map((state) => ({
    key: String(state.wikiId),
    icon: state.completed ? (
      <CheckCircleOutlined style={{ color: '#52c41a' }} />
    ) : (
      <LoadingOutlined spin />
    ),
    label: state.completed ? state.wikiTitle : `${state.wikiTitle}  ${state.overallProgress}%`,
    onClick: () => (state.completed ? navigateToGraph(state.wikiId) : restoreBuild(state.wikiId))
  }))

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

      {hasActiveBuilds && (
        <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="topRight">
          <FloatButton
            icon={allCompleted ? <RiBubbleChartLine /> : <LoadingOutlined spin />}
            badge={allCompleted ? { dot: true } : { count: incompleteCount }}
            style={{ right: 24, bottom: 24 }}
          />
        </Dropdown>
      )}
    </BuildProgressContext.Provider>
  )
}
