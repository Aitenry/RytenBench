import React, { useRef, useEffect, useCallback, useState } from 'react'
import { App, Dropdown, Input, Modal, Spin, theme } from 'antd'
import type { InputRef } from 'antd'
import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiBrain4Line,
  RiCloseLine,
  RiDatabase2Line,
  RiDeleteBin6Line,
  RiEditLine,
  RiEqualizerLine,
  RiFileTextLine,
  RiFolder2Line,
  RiFolderOpenLine,
  RiFoldersLine,
  RiMoreLine,
  RiSearchLine,
  RiSettings4Line
} from '@remixicon/react'
import ChaseDots from './ChaseDots'
import { useMessage } from '@renderer/hooks/useMessage'
import type { HarnessTopicRow, WorkspaceRow } from '../../../../../main/database/mapper/harness'
import { Window } from '../../../../resource/types/window'

interface HarnessSidebarProps {
  /** 当前工作区的会话列表（实时 + 分页，由 useHarness 维护） */
  topics: HarnessTopicRow[]
  /** 上面这批 topics 属于哪个工作区（null = 尚未加载过） */
  topicsWorkspaceId: number | null
  currentTopicId: number | null
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
  /** 整表刷新中（区别于滚动分页） */
  isRefreshingTopics: boolean
  onSelectTopic: (topic: HarnessTopicRow) => void
  onDeleteTopic: (topicId: number, e?: React.MouseEvent) => Promise<void>
  onLoadMoreTopics: () => void
  /** 在当前工作区新建会话 */
  onNewHarness: () => void
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

/** 会话分页大小（与 useHarnessHandlers 的 TOPICS_PAGE_SIZE 保持一致） */
const TOPICS_PAGE_SIZE = 20

/** 会话相对时间：刚刚 / 12分钟 / 3小时 / 1天 / 09月10日（值为 null 时不着色显示） */
function formatRelativeTime(value: string | null): string {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (!Number.isFinite(then)) return ''
  const now = Date.now()
  const diff = Math.max(0, now - then)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)}分钟`
  if (diff < day) return `${Math.floor(diff / hour)}小时`
  if (diff < 7 * day) return `${Math.floor(diff / day)}天`

  const d = new Date(then)
  const nowDate = new Date(now)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() === nowDate.getFullYear()
    ? `${mm}月${dd}日`
    : `${d.getFullYear()}/${mm}/${dd}`
}

const HarnessSidebar: React.FC<HarnessSidebarProps> = ({
  topics,
  topicsWorkspaceId,
  currentTopicId,
  colorBgContainer,
  borderRadiusLG,
  colorText,
  colorTextSecondary,
  colorTextTertiary,
  colorFillAlter,
  loadingTopicIds,
  hasMoreTopics,
  isLoadingMoreTopics,
  isRefreshingTopics,
  onSelectTopic,
  onDeleteTopic,
  onLoadMoreTopics,
  onNewHarness
}) => {
  const { token } = theme.useToken()
  const { viewMessage } = useMessage()
  const { modal } = App.useApp()

  const scrollRef = useRef<HTMLDivElement>(null)

  /* ── 工作区状态 ── */
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null)
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState<number | null>(null)
  const [hoveredWorkspaceId, setHoveredWorkspaceId] = useState<number | null>(null)
  /** 非当前工作区的会话缓存（展开时按需拉取；当前工作区始终用 topics 属性保证实时） */
  const [workspaceTopics, setWorkspaceTopics] = useState<Record<number, HarnessTopicRow[]>>({})
  const [workspaceTopicsLoading, setWorkspaceTopicsLoading] = useState<Record<number, boolean>>({})

  /* 搜索 */
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<InputRef | null>(null)
  useEffect(() => {
    if (searchMode) searchInputRef.current?.focus()
  }, [searchMode])

  /* 重命名弹窗 */
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<WorkspaceRow | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  // Mnemon 记忆概览状态
  const [memoryExpanded, setMemoryExpanded] = useState(false)
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memorySnap, setMemorySnap] = useState<MnemonSidebarSnapshot | null>(null)

  const loadMnemonSnapshot = useCallback(async () => {
    setMemoryLoading(true)
    try {
      const snap = await (window as unknown as Window).api.harness.mnemonSnapshot()
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

  /* ── 工作区与会话 ── */

  const loadWorkspaces = useCallback(async (): Promise<{
    list: WorkspaceRow[]
    activeId: number | null
  }> => {
    try {
      const win = window as unknown as Window
      const [list, settings] = await Promise.all([
        win.api.harness.getAllWorkspaces(),
        win.api.systemSettings.getAll()
      ])
      const activeId = settings.harness.activeWorkspaceId ?? null
      setWorkspaces(list)
      setActiveWorkspaceId(activeId)
      return { list, activeId }
    } catch (err) {
      console.error('Failed to load workspaces:', err)
      return { list: [], activeId: null }
    }
  }, [])

  /** 非当前工作区的会话按需拉取；取第一页（与 useHarness 的分页口径一致，切换时列表长度不跳变） */
  const loadWorkspaceTopics = useCallback(async (workspaceId: number): Promise<void> => {
    setWorkspaceTopicsLoading((prev) => ({ ...prev, [workspaceId]: true }))
    try {
      const result = await (window as unknown as Window).api.harness.getAllTopicsPaginated(
        workspaceId,
        0,
        TOPICS_PAGE_SIZE
      )
      setWorkspaceTopics((prev) => ({ ...prev, [workspaceId]: result.items }))
    } catch (err) {
      console.error('Failed to load workspace topics:', err)
    } finally {
      setWorkspaceTopicsLoading((prev) => ({ ...prev, [workspaceId]: false }))
    }
  }, [])

  /**
   * 单一数据源：列表一律渲染 workspaceTopics 缓存。
   * useHarness 的 topics 属性只负责把它所属工作区的缓存「刷新成最新」——
   * 切换工作区的瞬间 topics 仍属于旧工作区，绝不能直接拿来渲染新工作区（列表会闪成旧数据）。
   */
  useEffect(() => {
    if (topicsWorkspaceId == null) return
    setWorkspaceTopics((prev) => ({ ...prev, [topicsWorkspaceId]: topics }))
  }, [topicsWorkspaceId, topics])

  // 首次进入：载入工作区列表并展开当前工作区
  useEffect(() => {
    loadWorkspaces().then(({ list, activeId }) => {
      setExpandedWorkspaceId(activeId ?? list[0]?.id ?? null)
    })
  }, [loadWorkspaces])

  // 切换工作区（含子代理等外部入口）：同步激活态、展开态与记忆概览
  useEffect(() => {
    const handleWorkspaceChanged = (e: Event): void => {
      const detail = (e as CustomEvent<{ workspaceId?: number }>).detail
      const nextId = detail?.workspaceId ?? null
      if (memoryExpanded) {
        // 展开态：先清空旧工作区快照再重载（记忆按工作区隔离，不能残留旧内容）
        setMemorySnap(null)
        loadMnemonSnapshot()
      } else {
        // 折叠态：只刷新数字，不清空，避免「记忆」这一行跟着闪一下
        loadMnemonSnapshot()
      }
      if (nextId != null) {
        setActiveWorkspaceId(nextId)
        setExpandedWorkspaceId(nextId)
      }
      loadWorkspaces().then()
    }
    window.addEventListener('workspace-changed', handleWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', handleWorkspaceChanged)
  }, [memoryExpanded, loadMnemonSnapshot, loadWorkspaces])

  /** 切换工作区：写设置 + 派发事件（Index 负责清空当前会话并刷新会话列表） */
  const switchWorkspace = useCallback(async (ws: WorkspaceRow): Promise<void> => {
    try {
      const win = window as unknown as Window
      await win.api.systemSettings.update({
        harness: {
          workspacePath: ws.path,
          activeWorkspaceId: ws.id
        } as Parameters<typeof win.api.systemSettings.update>[0]['harness']
      })
      setActiveWorkspaceId(ws.id)
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: ws.id } }))
    } catch (err) {
      console.error('Failed to switch workspace:', err)
    }
  }, [])

  /** 展开/收起工作区；展开时按需拉取该工作区的会话 */
  const handleToggleWorkspace = useCallback(
    (workspaceId: number): void => {
      const next = expandedWorkspaceId === workspaceId ? null : workspaceId
      setExpandedWorkspaceId(next)
      if (next != null && next !== activeWorkspaceId) {
        loadWorkspaceTopics(next).then()
      }
    },
    [expandedWorkspaceId, activeWorkspaceId, loadWorkspaceTopics]
  )

  /** 打开某个工作区下的会话：跨工作区时先切换工作区 */
  const handleOpenTopic = useCallback(
    async (workspaceId: number, topic: HarnessTopicRow): Promise<void> => {
      if (workspaceId !== activeWorkspaceId) {
        const ws = workspaces.find((w) => w.id === workspaceId)
        if (ws) await switchWorkspace(ws)
      }
      await onSelectTopic(topic)
    },
    [activeWorkspaceId, workspaces, switchWorkspace, onSelectTopic]
  )

  /** 在指定工作区新建会话：跨工作区时先切换工作区 */
  const handleCreateSession = useCallback(
    async (ws: WorkspaceRow): Promise<void> => {
      setExpandedWorkspaceId(ws.id)
      // 该工作区会话尚未加载过时先补一次，避免切换瞬间出现空列表
      if (!Object.prototype.hasOwnProperty.call(workspaceTopics, ws.id)) {
        loadWorkspaceTopics(ws.id).then()
      }
      if (ws.id !== activeWorkspaceId) {
        await switchWorkspace(ws)
      }
      onNewHarness()
    },
    [activeWorkspaceId, workspaceTopics, loadWorkspaceTopics, switchWorkspace, onNewHarness]
  )

  /** 选择文件夹后直接创建并激活工作区（名称取目录名，之后可重命名） */
  const handleBrowseFolder = useCallback(async (): Promise<void> => {
    try {
      const win = window as unknown as Window
      const dir = await win.api.harness.selectWorkspace()
      if (!dir) return
      const name =
        dir
          .replace(/[/\\]$/, '')
          .split(/[/\\]/)
          .pop() || '工作区'
      const id = await win.api.harness.createWorkspace(name, dir)
      await win.api.systemSettings.update({
        harness: {
          workspacePath: dir,
          activeWorkspaceId: id
        } as Parameters<typeof win.api.systemSettings.update>[0]['harness']
      })
      setActiveWorkspaceId(id)
      setExpandedWorkspaceId(id)
      window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspaceId: id } }))
      onNewHarness()
      await loadWorkspaces()
    } catch (err) {
      console.error('Failed to create workspace:', err)
    }
  }, [loadWorkspaces, onNewHarness])

  const handleDeleteWorkspace = useCallback(
    (ws: WorkspaceRow): void => {
      modal.confirm({
        title: '删除工作区',
        content: `确定要删除「${ws.name}」吗？该工作区下的所有会话与记忆也将被删除。`,
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
          try {
            const win = window as unknown as Window
            await win.api.harness.deleteWorkspace(ws.id)
            if (activeWorkspaceId === ws.id) {
              // 删除的是当前工作区：自动切到剩余第一个；一个都不剩则回到「未配置」状态
              const remaining = await win.api.harness.getAllWorkspaces()
              if (remaining.length > 0) {
                const next = remaining[0]
                await win.api.systemSettings.update({
                  harness: {
                    workspacePath: next.path,
                    activeWorkspaceId: next.id
                  } as Parameters<typeof win.api.systemSettings.update>[0]['harness']
                })
                setActiveWorkspaceId(next.id)
                setExpandedWorkspaceId(next.id)
                window.dispatchEvent(
                  new CustomEvent('workspace-changed', { detail: { workspaceId: next.id } })
                )
              } else {
                await win.api.systemSettings.update({
                  harness: {
                    workspacePath: '',
                    activeWorkspaceId: undefined
                  } as Parameters<typeof win.api.systemSettings.update>[0]['harness']
                })
                setActiveWorkspaceId(null)
                setExpandedWorkspaceId(null)
                setWorkspaceTopics({})
                window.dispatchEvent(new CustomEvent('workspace-changed', { detail: {} }))
              }
              // 原会话已随工作区删除，回到空白欢迎态
              onNewHarness()
            }
            await loadWorkspaces()
          } catch (err) {
            console.error('Failed to delete workspace:', err)
          }
        }
      })
    },
    [activeWorkspaceId, modal, loadWorkspaces, onNewHarness]
  )

  /* 打开重命名弹窗 */
  const openRename = useCallback((ws: WorkspaceRow): void => {
    setRenameTarget(ws)
    setRenameName(ws.name)
    setRenameOpen(true)
  }, [])

  /* 保存重命名 */
  const handleRenameSave = useCallback(async (): Promise<void> => {
    const name = renameName.trim()
    if (!name || !renameTarget) {
      viewMessage('ws-rename-validate', 'warning', '请输入工作区名称')
      return
    }
    try {
      setRenameSaving(true)
      const win = window as unknown as Window
      await win.api.harness.updateWorkspace(renameTarget.id, { name })
      setRenameOpen(false)
      await loadWorkspaces()
      viewMessage('ws-rename-done', 'success', '工作区已重命名', 2)
    } catch (err) {
      console.error('Failed to rename workspace:', err)
      viewMessage('ws-rename-error', 'error', '重命名失败')
    } finally {
      setRenameSaving(false)
    }
  }, [renameName, renameTarget, viewMessage, loadWorkspaces])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || isLoadingMoreTopics || !hasMoreTopics) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      onLoadMoreTopics()
    }
  }, [isLoadingMoreTopics, hasMoreTopics, onLoadMoreTopics])

  /* 某个工作区当前的会话列表：统一取缓存（由 topics 属性按所属工作区刷新） */
  const topicsOf = useCallback(
    (workspaceId: number): HarnessTopicRow[] => workspaceTopics[workspaceId] ?? [],
    [workspaceTopics]
  )
  /** 该工作区的会话是否已加载过（未加载过才显示 spinner，避免空列表闪一下） */
  const hasTopicsLoaded = useCallback(
    (workspaceId: number): boolean =>
      Object.prototype.hasOwnProperty.call(workspaceTopics, workspaceId),
    [workspaceTopics]
  )

  const query = searchQuery.trim().toLowerCase()
  const visibleWorkspaces = query
    ? workspaces.filter(
        (ws) =>
          ws.name.toLowerCase().includes(query) ||
          topicsOf(ws.id).some((t) => t.title.toLowerCase().includes(query))
      )
    : workspaces
  const visibleTopicsOf = (workspaceId: number): HarnessTopicRow[] => {
    const list = topicsOf(workspaceId)
    return query ? list.filter((t) => t.title.toLowerCase().includes(query)) : list
  }

  /* 按目标分组的热记忆数量 */
  const userEntries = memorySnap?.runtime?.entries.filter((e) => e.target === 'user') ?? []
  const memoryEntries = memorySnap?.runtime?.entries.filter((e) => e.target === 'memory') ?? []

  /* 头部小图标按钮 */
  const iconBtn = (title: string, onClick: () => void, icon: React.ReactNode): React.ReactNode => (
    <button
      title={title}
      onClick={onClick}
      className="flex items-center justify-center rounded transition-colors"
      style={{
        width: 26,
        height: 26,
        border: 'none',
        background: 'transparent',
        color: colorTextSecondary,
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = colorFillAlter
        e.currentTarget.style.color = colorText
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = colorTextSecondary
      }}
    >
      {icon}
    </button>
  )

  /** 会话行 */
  const renderTopicRow = (workspaceId: number, topic: HarnessTopicRow): React.ReactNode => {
    const isTopicLoading = loadingTopicIds.has(topic.id)
    const selected = workspaceId === activeWorkspaceId && currentTopicId === topic.id
    return (
      <div
        key={topic.id}
        onClick={() => handleOpenTopic(workspaceId, topic)}
        className="group flex items-center gap-2 mx-2 my-0.5 rounded-md cursor-pointer transition-colors"
        style={{
          // 左内边距 6 + 行首 16px 指示槽 = 与工作区行图标列（14~30px）对齐；
          // 槽位 + gap(8) 后标题落在 38px，与工作区名称同列
          paddingLeft: 6,
          paddingRight: 8,
          height: 30,
          color: selected ? colorText : colorTextSecondary,
          background: selected ? token.colorFill : 'transparent'
        }}
        onMouseEnter={(e) => {
          if (!selected) e.currentTarget.style.background = token.colorFillQuaternary
        }}
        onMouseLeave={(e) => {
          if (!selected) e.currentTarget.style.background = 'transparent'
        }}
      >
        {/* 行首指示槽：固定 16px（平时留空，生成中显示追逐点），保证与工作区图标同列且标题不位移 */}
        <span
          className="flex items-center justify-center shrink-0"
          style={{ width: 16, height: 16 }}
        >
          {isTopicLoading && <ChaseDots size={14} color={colorTextTertiary} />}
        </span>
        <span className="flex-1 min-w-0 truncate" style={{ fontSize: 13 }}>
          {topic.title}
        </span>
        {!isTopicLoading && (
          <span
            className="shrink-0 group-hover:hidden"
            style={{ fontSize: 11, color: colorTextTertiary }}
          >
            {formatRelativeTime(topic.updated_at)}
          </span>
        )}
        <Dropdown
          menu={{
            items: [
              {
                key: 'delete',
                // 会话生成中禁止删除（含后台仍在流式输出的话题）
                label: isTopicLoading ? '进行中，无法删除' : '删除会话',
                danger: true,
                disabled: isTopicLoading,
                icon: <RiDeleteBin6Line size={14} />,
                // 删除非当前工作区的会话：useHarness 只刷新当前工作区列表，这里补刷本地缓存
                onClick: async () => {
                  if (isTopicLoading) return
                  await onDeleteTopic(topic.id)
                  if (workspaceId !== activeWorkspaceId) {
                    await loadWorkspaceTopics(workspaceId)
                  }
                }
              }
            ]
          }}
          trigger={['click']}
          placement="bottomRight"
        >
          <button
            onClick={(e) => e.stopPropagation()}
            title={isTopicLoading ? '会话进行中' : '会话操作'}
            className="hidden group-hover:flex items-center justify-center shrink-0 rounded"
            style={{ width: 20, height: 20, color: colorTextTertiary, background: 'transparent' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = token.colorFillSecondary)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <RiMoreLine size={15} />
          </button>
        </Dropdown>
      </div>
    )
  }

  /** 工作区行 + 其下会话 */
  const renderWorkspace = (ws: WorkspaceRow): React.ReactNode => {
    const expanded = expandedWorkspaceId === ws.id
    const active = activeWorkspaceId === ws.id
    const list = visibleTopicsOf(ws.id)
    // 该工作区下是否有会话正在生成（用未过滤的完整列表判断，避免搜索时漏判）：
    // 有则禁止删除该工作区，否则会连坐删掉进行中的会话
    const hasRunningTopic = topicsOf(ws.id).some((t) => loadingTopicIds.has(t.id))
    // 只有「该工作区会话从未加载过」才算加载中：切换工作区时缓存已有内容，直接无缝渲染
    const loading =
      !hasTopicsLoaded(ws.id) &&
      (ws.id === activeWorkspaceId || workspaceTopicsLoading[ws.id] === true)
    const hovered = hoveredWorkspaceId === ws.id
    const showControls = hovered || active

    return (
      <div key={ws.id} className="mb-0.5">
        <div
          onClick={() => handleToggleWorkspace(ws.id)}
          className="flex items-center gap-2 mx-2 rounded-md cursor-pointer transition-colors"
          style={{
            padding: '0 6px',
            height: 32,
            background: expanded ? token.colorFillTertiary : 'transparent'
          }}
          onMouseEnter={(e) => {
            setHoveredWorkspaceId(ws.id)
            if (!expanded) e.currentTarget.style.background = token.colorFillQuaternary
          }}
          onMouseLeave={(e) => {
            setHoveredWorkspaceId(null)
            if (!expanded) e.currentTarget.style.background = 'transparent'
          }}
        >
          <span
            className="flex items-center justify-center shrink-0"
            style={{ width: 16, color: expanded ? colorTextSecondary : colorTextTertiary }}
          >
            {expanded ? <RiFolderOpenLine size={15} /> : <RiFolder2Line size={15} />}
          </span>
          <span
            className="flex-1 min-w-0 truncate"
            style={{ fontSize: 13, color: colorText, fontWeight: 500 }}
          >
            {ws.name}
          </span>

          {/* 悬停/激活时显示：重命名删除菜单 + 新建会话 */}
          <span className="flex items-center gap-0.5 shrink-0">
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'rename',
                    label: '重命名',
                    icon: <RiEditLine size={14} />,
                    onClick: () => openRename(ws)
                  },
                  {
                    key: 'delete',
                    // 该工作区下有会话正在生成时禁止删除（避免连坐删掉进行中的会话）
                    label: hasRunningTopic ? '有会话进行中' : '删除工作区',
                    danger: true as const,
                    disabled: hasRunningTopic,
                    icon: <RiDeleteBin6Line size={14} />,
                    onClick: () => {
                      if (hasRunningTopic) return
                      handleDeleteWorkspace(ws)
                    }
                  }
                ]
              }}
              trigger={['click']}
              placement="bottomRight"
            >
              <button
                onClick={(e) => e.stopPropagation()}
                title={hasRunningTopic ? '有会话进行中' : '工作区操作'}
                className="flex items-center justify-center rounded transition-opacity"
                style={{
                  width: 22,
                  height: 22,
                  color: colorTextSecondary,
                  background: 'transparent',
                  opacity: showControls ? 1 : 0,
                  pointerEvents: showControls ? 'auto' : 'none'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = token.colorFillSecondary)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <RiMoreLine size={15} />
              </button>
            </Dropdown>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleCreateSession(ws)
              }}
              title="新建会话"
              className="flex items-center justify-center rounded transition-opacity"
              style={{
                width: 22,
                height: 22,
                color: colorTextSecondary,
                background: 'transparent',
                opacity: showControls ? 1 : 0,
                pointerEvents: showControls ? 'auto' : 'none'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = token.colorFillSecondary)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <RiAddLine size={16} />
            </button>
          </span>
        </div>

        {expanded && (
          <div className="pb-1">
            {loading && list.length === 0 ? (
              <div className="flex justify-center py-3">
                <Spin size="small" />
              </div>
            ) : list.length === 0 ? (
              /* 空态与上面的 loading 一样在整栏居中：不能再加左侧缩进，
                 否则 text-center 只在「缩进剩下的」区域里居中，看起来整体偏右 */
              <p className="text-center py-3" style={{ fontSize: 12, color: colorTextTertiary }}>
                {query ? '无匹配会话' : '暂无会话'}
              </p>
            ) : (
              <>
                {list.map((topic) => renderTopicRow(ws.id, topic))}
                {/* 仅当前工作区的「滚动分页」显示底部 spinner；整表刷新（切换工作区）不显示，避免闪动 */}
                {ws.id === activeWorkspaceId &&
                  isLoadingMoreTopics &&
                  !isRefreshingTopics &&
                  hasMoreTopics && (
                    <div className="flex justify-center py-3">
                      <Spin size="small" />
                    </div>
                  )}
              </>
            )}
          </div>
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
      {/* 头部：工作区标题 + 搜索 / 设置 / 新建工作区 */}
      <div className="flex items-center px-2" style={{ minHeight: 38 }}>
        {searchMode ? (
          <div className="flex items-center gap-1 flex-1">
            <Input
              ref={searchInputRef}
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索工作区与会话"
              allowClear
              variant="borderless"
              prefix={<RiSearchLine size={14} style={{ color: colorTextTertiary }} />}
              style={{ flex: 1, background: 'transparent', padding: '0 3px' }}
            />
            {iconBtn(
              '退出搜索',
              () => {
                setSearchMode(false)
                setSearchQuery('')
              },
              <RiCloseLine size={16} />
            )}
          </div>
        ) : (
          <>
            <span
              className="select-none"
              style={{ fontSize: 13, fontWeight: 500, color: colorTextSecondary }}
            >
              工作区
            </span>
            <span className="flex-1" />
            {iconBtn('搜索工作区与会话', () => setSearchMode(true), <RiSearchLine size={16} />)}
            {iconBtn(
              '助手设置',
              // 聚焦模式：设置弹窗只显示助手相关页签（智能体 / 模型 / 技能 / 记忆）
              () =>
                window.dispatchEvent(
                  new CustomEvent('open-system-settings', {
                    detail: { tab: 'agents', scope: 'assistant' }
                  })
                ),
              <RiEqualizerLine size={16} />
            )}
            {iconBtn('新建工作区', handleBrowseFolder, <RiFoldersLine size={16} />)}
          </>
        )}
      </div>

      {/* 工作区 → 会话树 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto py-1 history-scrollbar"
        onScroll={handleScroll}
      >
        {visibleWorkspaces.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: colorTextTertiary }}>
            {query ? '无匹配结果' : '尚未配置工作区'}
          </p>
        ) : (
          visibleWorkspaces.map((ws) => renderWorkspace(ws))
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

      {/* 重命名工作区弹窗 */}
      <Modal
        title="重命名工作区"
        open={renameOpen}
        onCancel={() => {
          setRenameOpen(false)
          setRenameTarget(null)
        }}
        onOk={handleRenameSave}
        okText="保存"
        cancelText="取消"
        confirmLoading={renameSaving}
        width={380}
      >
        <Input
          autoFocus
          placeholder="工作区名称"
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onPressEnter={handleRenameSave}
        />
      </Modal>
    </div>
  )
}

// memo：聊天区流式输出时父级会高频重渲染，侧边栏（含搜索框）props 全部稳定引用，
// 不应跟着重渲染
export default React.memo(HarnessSidebar)
