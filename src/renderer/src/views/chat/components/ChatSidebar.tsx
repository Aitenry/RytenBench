import React, { useRef, useEffect, useCallback, useState } from 'react'
import { Dropdown, Spin, Modal } from 'antd'
import {
  RiListCheck2,
  RiDeleteBin6Line,
  RiMoreLine,
  RiLoader4Line,
  RiBrain4Line,
  RiGpsLine,
  RiHomeOfficeLine,
  RiFolder6Line,
  RiAiAgentLine,
  RiShieldKeyholeLine,
  RiBookOpenLine,
  RiChatHistoryLine,
  RiFileCodeLine,
  RiUserSharedLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiFileTextLine
} from '@remixicon/react'
import type { ChatTopicRow } from '../../../../../main/database/mapper/chat'
import { Window } from '../../../../resource/types/window'
import MarkdownView from '@renderer/components/markdown/MarkdownView'

interface MemoryTreeNode {
  key: string
  title: string
  type: 'global' | 'workspace' | 'agent' | 'folder' | 'file'
  isLeaf?: boolean
  children?: MemoryTreeNode[]
  filePath?: string
}

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

const FOLDER_ICON_MAP: Record<string, React.ReactNode> = {
  memories: <RiBrain4Line size={12} />,
  peers: <RiUserSharedLine size={12} />,
  privacy: <RiShieldKeyholeLine size={12} />,
  resources: <RiBookOpenLine size={12} />,
  sessions: <RiChatHistoryLine size={12} />,
  skills: <RiFileCodeLine size={12} />
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
  const memoryScrollRef = useRef<HTMLDivElement>(null)

  // 记忆树状态
  const [memoryTree, setMemoryTree] = useState<MemoryTreeNode[]>([])
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memoryExpanded, setMemoryExpanded] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const [memoryConfigured, setMemoryConfigured] = useState(false)
  const [autoInitLoading, setAutoInitLoading] = useState(false)
  const [workspaceId, setWorkspaceId] = useState(0)

  // 文件预览状态
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)

  const loadMemoryTree = useCallback(async () => {
    setMemoryLoading(true)
    try {
      const tree = await (window as unknown as Window).api.chat.scanMemoryTree(workspaceId)
      setMemoryTree(tree)
      setExpandedKeys(tree.map((n) => n.key))
    } catch {
      setMemoryTree([])
    } finally {
      setMemoryLoading(false)
    }
  }, [workspaceId])

  const checkMemoryStatus = useCallback(async () => {
    try {
      const status = await (window as unknown as Window).api.chat.checkMemoryInitialized()
      setMemoryConfigured(status.configured)
      if (status.initialized) {
        loadMemoryTree()
      } else if (status.configured) {
        // 已配置但未初始化，自动初始化
        setAutoInitLoading(true)
        try {
          const result = await (window as unknown as Window).api.chat.initMemoryDirs(workspaceId)
          if (result.success) {
            loadMemoryTree()
          }
        } catch {
          // ignore
        } finally {
          setAutoInitLoading(false)
        }
      }
    } catch {
      setMemoryConfigured(false)
    }
  }, [loadMemoryTree, workspaceId])

  // 展开记忆面板时检查状态
  const handleToggleMemory = useCallback(async () => {
    const next = !memoryExpanded
    setMemoryExpanded(next)
    if (next) {
      await checkMemoryStatus()
    }
  }, [memoryExpanded, checkMemoryStatus])

  // 点击文件节点打开预览
  const handleFileClick = useCallback(async (node: MemoryTreeNode) => {
    if (!node.filePath) return
    setPreviewTitle(node.title)
    setPreviewLoading(true)
    setPreviewVisible(true)
    try {
      const result = await (window as unknown as Window).api.chat.readMemoryFile(node.filePath)
      if (result.success) {
        setPreviewContent(result.content || '')
      } else {
        setPreviewContent(`无法读取文件: ${result.error}`)
      }
    } catch {
      setPreviewContent('读取文件失败')
    } finally {
      setPreviewLoading(false)
    }
  }, [])

  // 组件挂载时获取工作区ID并检查记忆状态
  useEffect(() => {
    const init = async (): Promise<void> => {
      try {
        const settings = await (window as unknown as Window).api.systemSettings.getAll()
        const wsId = settings.chat?.activeWorkspaceId ?? 0
        setWorkspaceId(wsId)
      } catch {
        // ignore
      }
    }
    init()
  }, [])

  // workspaceId 变化后检查记忆状态
  useEffect(() => {
    if (workspaceId) {
      checkMemoryStatus()
    }
  }, [workspaceId, checkMemoryStatus])

  // 监听记忆树刷新事件
  useEffect(() => {
    const handleRefresh = (): void => {
      checkMemoryStatus()
    }
    window.addEventListener('memory-tree-refresh', handleRefresh)
    return () => window.removeEventListener('memory-tree-refresh', handleRefresh)
  }, [checkMemoryStatus])

  // 监听工作区切换
  useEffect(() => {
    const handleWorkspaceChanged = (e: Event): void => {
      const wsId = (e as CustomEvent<{ workspaceId: number | null }>).detail?.workspaceId
      if (wsId != null) {
        setWorkspaceId(wsId)
      }
    }
    window.addEventListener('workspace-changed', handleWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', handleWorkspaceChanged)
  }, [])

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

  // 自定义记忆树节点图标
  const getNodeIcon = (node: MemoryTreeNode): React.ReactNode => {
    if (node.type === 'file') {
      return <RiFileTextLine size={12} style={{ color: '#52c41a', flexShrink: 0 }} />
    }
    if (node.type === 'global') {
      return <RiGpsLine size={14} style={{ color: '#1677ff', flexShrink: 0 }} />
    }
    if (node.type === 'workspace') {
      return <RiHomeOfficeLine size={14} style={{ color: '#fa8c16', flexShrink: 0 }} />
    }
    if (node.type === 'agent') {
      return <RiAiAgentLine size={14} style={{ color: '#722ed1', flexShrink: 0 }} />
    }
    return (
      (FOLDER_ICON_MAP[node.title] as React.ReactElement) || (
        <RiFolder6Line size={12} style={{ flexShrink: 0 }} />
      )
    )
  }

  const toggleExpand = (key: string): void => {
    setExpandedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  // 递归树节点
  const renderTreeNode = (node: MemoryTreeNode, depth: number): React.ReactNode => {
    const isExpanded = expandedKeys.includes(node.key)
    const hasChildren = node.children && node.children.length > 0
    const isLeaf = node.isLeaf || !hasChildren
    const isFile = node.type === 'file'

    return (
      <div key={node.key}>
        <div
          className="flex items-center gap-1 py-1 cursor-pointer rounded transition-colors select-none"
          style={{
            paddingLeft: 8 + depth * 16,
            color: colorTextSecondary
          }}
          onClick={() => {
            if (isFile) {
              handleFileClick(node)
            } else if (!isLeaf) {
              toggleExpand(node.key)
            }
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = colorFillAlter)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          {/* 展开/折叠箭头 */}
          {!isLeaf ? (
            <span className="flex items-center justify-center" style={{ width: 14, flexShrink: 0 }}>
              {isExpanded ? <RiArrowDownSLine size={12} /> : <RiArrowRightSLine size={12} />}
            </span>
          ) : (
            <span style={{ width: 14, flexShrink: 0 }} />
          )}
          {/* 图标 */}
          {getNodeIcon(node)}
          {/* 标题 */}
          <span className="text-xs truncate">{node.title}</span>
        </div>
        {/* 子节点 */}
        {hasChildren && isExpanded && (
          <>{node.children!.map((child) => renderTreeNode(child, depth + 1))}</>
        )}
      </div>
    )
  }

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

      {/* 记忆树 */}
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
          {memoryExpanded ? <RiArrowDownSLine size={16} /> : <RiArrowRightSLine size={16} />}
        </button>

        {memoryExpanded && (
          <div
            ref={memoryScrollRef}
            className="overflow-y-auto history-scrollbar"
            style={{ maxHeight: 240 }}
          >
            {memoryLoading ? (
              <div className="flex justify-center py-4">
                <Spin size="small" />
              </div>
            ) : !memoryConfigured ? (
              <p className="text-xs text-center py-4 px-4" style={{ color: colorTextTertiary }}>
                请在设置中配置记忆目录
              </p>
            ) : autoInitLoading ? (
              <div className="flex justify-center py-4">
                <Spin size="small" />
              </div>
            ) : memoryTree.length === 0 ? (
              <p className="text-xs text-center py-4 px-4" style={{ color: colorTextTertiary }}>
                暂无记忆数据
              </p>
            ) : (
              <div className="px-2 pb-2">{memoryTree.map((node) => renderTreeNode(node, 0))}</div>
            )}
          </div>
        )}
      </div>

      {/* 文件预览 Modal */}
      <Modal
        title={previewTitle}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={800}
        style={{ top: 20 }}
        styles={{ body: { padding: 0, height: '70vh' } }}
        destroyOnHidden
      >
        {previewLoading ? (
          <div className="flex justify-center items-center h-full">
            <Spin size="default" />
          </div>
        ) : (
          <MarkdownView content={previewContent} isDarkMode={isDarkMode} />
        )}
      </Modal>
    </div>
  )
}

export default ChatSidebar
