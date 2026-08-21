import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Dropdown, Spin } from 'antd'
import {
  RiListCheck2,
  RiDeleteBin6Line,
  RiMoreLine,
  RiBrain4Line,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiDatabase2Line,
  RiFileTextLine,
  RiSettings4Line
} from '@remixicon/react'
import ChaseDots from './ChaseDots'
import type { ChatTopicRow } from '../../../../../main/database/mapper/chat'
import { Window } from '../../../../resource/types/window'

interface ChatSidebarProps {
  topics: ChatTopicRow[]
  currentTopicId: number | null
  isDarkMode: boolean
  colorBgContainer: string
  borderRadiusLG: number
  colorText: string
  colorTextSecondary: string
  colorTextTertiary: string
  colorFillAlter: string
  loadingTopicIds: Set<number>
  /** 分页 */
  hasMoreTopics: boolean
  isLoadingMoreTopics: boolean
  onSelectTopic: (topic: ChatTopicRow) => void
  onDeleteTopic: (topicId: number, e?: React.MouseEvent) => void
  onLoadMoreTopics: () => void
}

/** Mnemon 记忆概览快照 */
interface MnemonSidebarSnapshot {
  configured: boolean
  runtime?: {
    entries: { content: string; target: 'user' | 'memory'; importance: string }[]
    targets: Record<'user' | 'memory', { used: number; limit: number; entryCount: number }>
  }
  bodies?: {
    total: number
    activeCount: number
  }
  documents?: {
    total: number
    activeCount: number
  }
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  topics,
  currentTopicId,
  isDarkMode,
  colorBgContainer,
  borderRadiusLG,
  colorText,
  colorTextSecondary,
  colorTextTertiary,
  colorFillAlter,
  loadingTopicIds,
  hasMoreTopics,
  isLoadingMoreTopics,
  onSelectTopic,
  onDeleteTopic,
  onLoadMoreTopics
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Mnemon 记忆概览状态
  const [memoryExpanded, setMemoryExpanded] = useState(false)
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memorySnap, setMemorySnap] = useState<MnemonSidebarSnapshot | null>(null)

  const loadMnemonSnapshot = useCallback(async () => {
    setMemoryLoading(true)
    try {
      const snap = await (window as unknown as Window).api.chat.mnemonSnapshot()
      if (!snap.configured) {
        setMemorySnap({ configured: false })
      } else {
        setMemorySnap({
          configured: true,
          runtime: snap.runtime
            ? {
                entries: snap.runtime.entries,
                targets: snap.runtime.targets
              }
            : undefined,
          bodies: snap.bodies
            ? { total: snap.bodies.total, activeCount: snap.bodies.activeCount }
            : undefined,
          documents: snap.documents
            ? { total: snap.documents.total, activeCount: snap.documents.activeCount }
            : undefined
        })
      }
    } catch {
      setMemorySnap({ configured: false })
    } finally {
      setMemoryLoading(false)
    }
  }, [])

  // 展开记忆面板时加载概览
  const handleToggleMemory = useCallback(async () => {
    const next = !memoryExpanded
    setMemoryExpanded(next)
    if (next) {
      await loadMnemonSnapshot()
    }
  }, [memoryExpanded, loadMnemonSnapshot])

  // 打开系统设置记忆页
  const handleOpenMemorySettings = useCallback(() => {
    window.dispatchEvent(new CustomEvent('open-system-settings', { detail: { tab: 'memory' } }))
  }, [])

  // 监听记忆变更事件（对话中模型写记忆后刷新概览）
  useEffect(() => {
    const handleRefresh = (): void => {
      if (memoryExpanded) {
        loadMnemonSnapshot()
      }
    }
    window.addEventListener('memory-tree-refresh', handleRefresh)
    return () => window.removeEventListener('memory-tree-refresh', handleRefresh)
  }, [memoryExpanded, loadMnemonSnapshot])

  // 切换工作区后立即刷新记忆概览（记忆按工作区目录隔离，旧工作区快照必须立刻失效）
  useEffect(() => {
    const handleWorkspaceChanged = (): void => {
      setMemorySnap(null)
      if (memoryExpanded) {
        loadMnemonSnapshot()
      }
    }
    window.addEventListener('workspace-changed', handleWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', handleWorkspaceChanged)
  }, [memoryExpanded, loadMnemonSnapshot])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || isLoadingMoreTopics || !hasMoreTopics) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      onLoadMoreTopics()
    }
  }, [isLoadingMoreTopics, hasMoreTopics, onLoadMoreTopics])

  // 按目标分组的热记忆数量
  const userEntries = memorySnap?.runtime?.entries.filter((e) => e.target === 'user') ?? []
  const memoryEntries = memorySnap?.runtime?.entries.filter((e) => e.target === 'memory') ?? []

  return (
    <div
      className="flex flex-col overflow-hidden h-full"
      style={{
        background: colorBgContainer,
        borderRadius: borderRadiusLG
      }}
    >
      <div className="items-center justify-between px-4 py-2 flex">
        <span className="text-sm font-medium" style={{ color: colorTextSecondary }}>
          任务
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded-full"
          style={{
            color: colorTextSecondary,
            background: colorFillAlter,
            minWidth: 20,
            textAlign: 'center'
          }}
        >
          {topics.length}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-2 history-scrollbar"
        onScroll={handleScroll}
      >
        {topics.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: colorTextTertiary }}>
            暂无任务
          </p>
        ) : (
          <>
            {topics.map((topic) => {
              const isTopicLoading = loadingTopicIds.has(topic.id)
              return (
                <div
                  key={topic.id}
                  onClick={() => onSelectTopic(topic)}
                  className="group flex items-center gap-2 px-4 py-2.5 mb-1 mx-2 rounded-lg cursor-pointer transition-colors"
                  style={{
                    color: colorText,
                    background:
                      currentTopicId === topic.id
                        ? isDarkMode
                          ? '#1a2744'
                          : '#eff6ff'
                        : 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    if (currentTopicId !== topic.id)
                      e.currentTarget.style.background = colorFillAlter
                  }}
                  onMouseLeave={(e) => {
                    if (currentTopicId !== topic.id)
                      e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {isTopicLoading ? (
                    <ChaseDots size={16} className="shrink-0" color={colorTextTertiary} />
                  ) : (
                    <RiListCheck2
                      size={16}
                      className="shrink-0"
                      style={{ color: colorTextTertiary }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{topic.title}</span>
                    <span className="block text-xs truncate" style={{ color: colorTextTertiary }}>
                      {new Date(topic.updated_at).toLocaleDateString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit'
                      })}{' '}
                      {new Date(topic.updated_at).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                      {topic.id !== undefined ? ` · #${topic.id}` : ''}
                    </span>
                  </div>
                  <Dropdown
                    menu={{
                      items: [
                        {
                          key: 'delete',
                          label: '删除对话',
                          danger: true,
                          icon: <RiDeleteBin6Line size={14} />,
                          onClick: () => onDeleteTopic(topic.id)
                        }
                      ]
                    }}
                    trigger={['click']}
                    placement="bottomRight"
                  >
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all"
                      onMouseEnter={(e) => (e.currentTarget.style.background = colorFillAlter)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <RiMoreLine size={16} style={{ color: colorTextTertiary }} />
                    </button>
                  </Dropdown>
                </div>
              )
            })}
            {isLoadingMoreTopics && (
              <div className="flex justify-center py-3">
                <Spin size="small" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Mnemon 记忆概览 */}
      <div className="border-t flex-shrink-0" style={{ borderColor: colorFillAlter }}>
        <button
          onClick={handleToggleMemory}
          className="flex items-center justify-between w-full px-4 py-2 text-left transition-colors"
          style={{ color: colorTextSecondary }}
          onMouseEnter={(e) => (e.currentTarget.style.background = colorFillAlter)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <RiBrain4Line size={16} />
            记忆
          </span>
          <span className="flex items-center gap-2">
            {memorySnap?.configured && (
              <span className="text-xs" style={{ color: colorTextTertiary }}>
                {memorySnap.runtime?.entries.length ?? 0} 条热记忆
              </span>
            )}
            {memoryExpanded ? <RiArrowDownSLine size={16} /> : <RiArrowRightSLine size={16} />}
          </span>
        </button>

        {memoryExpanded && (
          <div className="overflow-y-auto history-scrollbar px-3 pb-3" style={{ maxHeight: 300 }}>
            {memoryLoading ? (
              <div className="flex justify-center py-5">
                <Spin size="small" />
              </div>
            ) : !memorySnap?.configured ? (
              <div className="pt-2">
                <p className="text-xs text-center py-3" style={{ color: colorTextTertiary }}>
                  未配置记忆目录，模型将没有持久记忆。
                </p>
                <button
                  onClick={handleOpenMemorySettings}
                  className="flex items-center justify-center gap-1 w-full py-2 rounded text-xs transition-colors"
                  style={{ color: '#1677ff', background: colorFillAlter }}
                >
                  <RiSettings4Line size={13} />
                  前往设置配置记忆
                </button>
              </div>
            ) : (
              <div className="pt-1">
                {/* 用户画像（USER）——仅显示数量，不展示内容 */}
                {memorySnap.runtime && userEntries.length > 0 && (
                  <div className="mb-2">
                    <div
                      className="flex items-center justify-between gap-1.5 mb-1.5 text-xs font-medium"
                      style={{ color: colorTextSecondary }}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="rounded-sm"
                          style={{ width: 3, height: 12, background: '#1677ff' }}
                        />
                        用户画像
                      </span>
                      <span style={{ color: colorTextTertiary, fontWeight: 400 }}>
                        {userEntries.length} 条
                      </span>
                    </div>
                  </div>
                )}

                {/* 项目记忆（MEMORY）——仅显示数量，不展示内容 */}
                {memorySnap.runtime && memoryEntries.length > 0 && (
                  <div className="mb-2">
                    <div
                      className="flex items-center justify-between gap-1.5 mb-1.5 text-xs font-medium"
                      style={{ color: colorTextSecondary }}
                    >
                      <span className="flex items-center gap-1.5">
                        <span
                          className="rounded-sm"
                          style={{ width: 3, height: 12, background: '#52c41a' }}
                        />
                        项目记忆
                      </span>
                      <span style={{ color: colorTextTertiary, fontWeight: 400 }}>
                        {memoryEntries.length} 条
                      </span>
                    </div>
                  </div>
                )}

                {!memorySnap.runtime ||
                  (memorySnap.runtime.entries.length === 0 && (
                    <p className="text-xs text-center py-3" style={{ color: colorTextTertiary }}>
                      暂无热记忆，对话时可直接告诉模型要记住的内容
                    </p>
                  ))}

                {/* 统计行（换行排列，不挤压） */}
                <div
                  className="flex flex-wrap gap-x-4 gap-y-1 mt-1 pt-2 text-xs"
                  style={{
                    color: colorTextTertiary,
                    borderTop: `1px solid ${colorFillAlter}`
                  }}
                >
                  <span className="flex items-center gap-1.5">
                    <RiBrain4Line size={13} />
                    {memorySnap.runtime
                      ? `${memorySnap.runtime.entries.length} 条热记忆`
                      : '热记忆 -'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <RiDatabase2Line size={13} />
                    空间 {memorySnap.bodies?.activeCount ?? 0}/{memorySnap.bodies?.total ?? 0} 激活
                  </span>
                  <span className="flex items-center gap-1.5">
                    <RiFileTextLine size={13} />
                    档案 {memorySnap.documents?.total ?? 0}
                  </span>
                </div>

                {/* 管理入口 */}
                <button
                  onClick={handleOpenMemorySettings}
                  className="flex items-center justify-center gap-1.5 w-full py-2 mt-2.5 rounded text-xs transition-colors"
                  style={{ color: '#1677ff', background: colorFillAlter }}
                >
                  <RiSettings4Line size={13} />
                  管理记忆
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatSidebar
