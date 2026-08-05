import React, { useRef, useEffect, useCallback } from 'react'
import { Dropdown, Spin } from 'antd'
import { RiListCheck2, RiDeleteBin6Line, RiMoreLine, RiLoader4Line } from '@remixicon/react'
import type { ChatTopicRow } from '../../../../../main/database/mapper/chat'

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

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || isLoadingMoreTopics || !hasMoreTopics) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      onLoadMoreTopics()
    }
  }, [isLoadingMoreTopics, hasMoreTopics, onLoadMoreTopics])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

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
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-2 history-scrollbar">
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
                    <RiLoader4Line
                      size={16}
                      className="shrink-0 animate-spin"
                      style={{ color: colorTextTertiary }}
                    />
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
    </div>
  )
}

export default ChatSidebar
