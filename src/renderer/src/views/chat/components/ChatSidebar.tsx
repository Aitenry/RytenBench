import React from 'react'
import { Dropdown } from 'antd'
import { RiHistoryLine, RiDeleteBin6Line, RiMoreLine } from '@remixicon/react'
import type { ChatTopicRow } from '../../../../../main/database/mapper/chat'

interface ChatSidebarProps {
  sidebarOpen: boolean
  topics: ChatTopicRow[]
  currentTopicId: number | null
  isDarkMode: boolean
  colorBgContainer: string
  borderRadiusLG: number
  colorBorderSecondary: string
  colorText: string
  colorTextSecondary: string
  colorTextTertiary: string
  colorFillAlter: string
  onSelectTopic: (topic: ChatTopicRow) => void
  onDeleteTopic: (topicId: number, e?: React.MouseEvent) => void
}

const ChatSidebar: React.FC<ChatSidebarProps> = ({
  sidebarOpen,
  topics,
  currentTopicId,
  isDarkMode,
  colorBgContainer,
  borderRadiusLG,
  colorBorderSecondary,
  colorText,
  colorTextSecondary,
  colorTextTertiary,
  colorFillAlter,
  onSelectTopic,
  onDeleteTopic
}) => {
  return (
    <div
      className="flex flex-col transition-all duration-200 overflow-hidden"
      style={{
        width: sidebarOpen ? 260 : 0,
        minWidth: sidebarOpen ? 260 : 0,
        background: colorBgContainer,
        borderRadius: borderRadiusLG,
        marginRight: sidebarOpen ? '6px' : '-1px',
        borderRight: `1px solid ${colorBorderSecondary}`
      }}
    >
      <div
        style={{ display: sidebarOpen ? 'flex' : 'none' }}
        className="items-center justify-between px-4 py-2"
      >
        <span className="text-sm font-medium" style={{ color: colorTextSecondary }}>
          历史记录
        </span>
      </div>
      <div
        style={{ display: sidebarOpen ? 'block' : 'none' }}
        className="flex-1 overflow-y-auto py-2 history-scrollbar"
      >
        {topics.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: colorTextTertiary }}>
            暂无历史记录
          </p>
        ) : (
          topics.map((topic) => (
            <div
              key={topic.id}
              onClick={() => onSelectTopic(topic)}
              className="group flex items-center gap-2 px-4 py-2.5 mb-1 mx-2 rounded-lg cursor-pointer transition-colors"
              style={{
                color: colorText,
                background:
                  currentTopicId === topic.id ? (isDarkMode ? '#1a2744' : '#eff6ff') : 'transparent'
              }}
              onMouseEnter={(e) => {
                if (currentTopicId !== topic.id) e.currentTarget.style.background = colorFillAlter
              }}
              onMouseLeave={(e) => {
                if (currentTopicId !== topic.id) e.currentTarget.style.background = 'transparent'
              }}
            >
              <RiHistoryLine size={16} className="shrink-0" style={{ color: colorTextTertiary }} />
              <span className="flex-1 text-sm truncate">{topic.title}</span>
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
          ))
        )}
      </div>
    </div>
  )
}

export default ChatSidebar
