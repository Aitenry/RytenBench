import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { theme, Tooltip, Empty, Spin, Dropdown, Modal, Input, App } from 'antd'
import type { MenuProps } from 'antd'
import {
  RiFileTextLine,
  RiCheckboxCircleLine,
  RiBook2Line,
  RiFolder2Line,
  RiAddLine,
  RiSearchLine,
  RiArrowRightSLine,
  RiTodoLine,
  RiPlayCircleLine,
  RiCheckboxBlankCircleLine,
  RiMore2Line,
  RiDeleteBinLine,
  RiEditLine,
  RiInboxArchiveLine,
  RiFolderAddLine,
  RiFileAddLine,
  RiFolderTransferLine,
  RiExternalLinkLine
} from '@remixicon/react'
import { Window } from '../../../../resource/types/window'
import { useMessage } from '@renderer/hooks/useMessage'
import type {
  DocListItem,
  TodoItem as TodoItemRow,
  WikiRow,
  WikiDirectoryRow
} from '@renderer/types/models'
import type { Selection } from '../types'

/* ──────────── 内部类型 ──────────── */

interface WikiTreeData {
  dirs: WikiDirectoryRow[]
  /** 目录下的文档 id 列表（标题渲染时从 docs 实时取，保存后自动更新） */
  notesByDir: Map<number, number[]>
}

const TODO_STATUS_META: Record<number, { label: string; color: string }> = {
  0: { label: '待办', color: '#1677ff' },
  1: { label: '进行中', color: '#fa8c16' },
  2: { label: '已完成', color: '#52c41a' }
}

/* ──────────── Props ──────────── */

export interface DocTreePanelProps {
  /** 未归档文档（文档库分区展示） */
  docs: DocListItem[]
  /** 全部文档（树内标题解析与搜索） */
  allDocs: DocListItem[]
  todos: TodoItemRow[]
  wikis: WikiRow[]
  selection: Selection
  onSelect: (selection: Selection) => void
  onCreateDoc: () => void
  onCreateTodo: () => void
  onCreateWiki: () => void
  /** 编辑知识库（⋯ 菜单） */
  onEditWiki: (wiki: WikiRow) => void
  /** 删除知识库（⋯ 菜单） */
  onDeleteWiki: (wiki: WikiRow) => void
  /** 删除文档（⋯ 菜单） */
  onDeleteDoc: (doc: DocListItem) => void
  /** 归档文档（⋯ 菜单） */
  onArchiveDoc: (doc: DocListItem) => void
  /** 在目录中新建文档（⋯ 菜单） */
  onCreateDocInDirectory: (
    directoryId: number,
    context?: { wikiId: number; dirName: string }
  ) => void
  /** 目录/文档关联关系变化（删除目录、从目录移除）后通知父级刷新文档列表 */
  onDocsChanged?: () => void
  /** 数据变更后自增，用于刷新已展开知识库的树（保留展开状态） */
  refreshKey?: number
  /** 面板宽度（可拖拽调整） */
  width?: number
}

/* ──────────── 组件 ──────────── */

const DocTreePanel: React.FC<DocTreePanelProps> = ({
  docs,
  allDocs,
  todos,
  wikis,
  selection,
  onSelect,
  onCreateDoc,
  onCreateTodo,
  onCreateWiki,
  onEditWiki,
  onDeleteWiki,
  onDeleteDoc,
  onArchiveDoc,
  onCreateDocInDirectory,
  onDocsChanged,
  refreshKey = 0,
  width = 252
}) => {
  const { token } = theme.useToken()
  const { viewMessage } = useMessage()
  const { modal } = App.useApp()
  const api = (window as unknown as Window).api

  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({
    docs: true,
    todos: true,
    wikis: true
  })
  const [expandedWikis, setExpandedWikis] = useState<Set<number>>(new Set())
  const [expandedDirs, setExpandedDirs] = useState<Set<number>>(new Set())
  const [treeCache, setTreeCache] = useState<Record<number, WikiTreeData>>({})
  const [loadingWikis, setLoadingWikis] = useState<Set<number>>(new Set())

  /* ── 目录编辑弹窗 ── */
  const [dirModalOpen, setDirModalOpen] = useState(false)
  const [dirModalTitle, setDirModalTitle] = useState('新建目录')
  const [dirName, setDirName] = useState('新目录')
  const [dirTarget, setDirTarget] = useState<{
    wikiId: number
    parent: WikiDirectoryRow | null
  } | null>(null)
  const [editingDir, setEditingDir] = useState<WikiDirectoryRow | null>(null)
  const [dirSaving, setDirSaving] = useState(false)

  const docTitle = useCallback(
    (docId: number): string => allDocs.find((d) => d.id === docId)?.title ?? `文档 ${docId}`,
    [allDocs]
  )

  /* ── 加载 / 刷新知识库目录树 ── */
  const treeCacheRef = useRef(treeCache)
  treeCacheRef.current = treeCache
  const loadWikiTree = useCallback(
    async (wikiId: number, force = false) => {
      if ((treeCache[wikiId] && !force) || loadingWikis.has(wikiId)) return
      setLoadingWikis((prev) => new Set(prev).add(wikiId))
      try {
        const dirs = await api.wikis.getDirectories(wikiId)
        const notesByDir = new Map<number, number[]>()
        for (const dir of dirs) {
          const notes = await api.wikis.getNotesByDirectory(dir.id)
          notesByDir.set(
            dir.id,
            notes.map((n) => n.doc_id)
          )
        }
        /* 首次加载：展开全部目录；刷新：仅展开新增目录，保留用户折叠状态 */
        const oldIds = new Set((treeCacheRef.current[wikiId]?.dirs ?? []).map((d) => d.id))
        const newIds = dirs.filter((d) => !oldIds.has(d.id)).map((d) => d.id)
        setTreeCache((prev) => ({ ...prev, [wikiId]: { dirs, notesByDir } }))
        if (newIds.length > 0) {
          setExpandedDirs((p) => {
            const next = new Set(p)
            newIds.forEach((id) => next.add(id))
            return next
          })
        }
      } catch (error) {
        console.error('Failed to load wiki tree:', error)
      } finally {
        setLoadingWikis((prev) => {
          const next = new Set(prev)
          next.delete(wikiId)
          return next
        })
      }
    },
    [api, treeCache, loadingWikis]
  )

  /* 数据变更：仅重载仍然存在的已展开知识库。
     注意：effect 只依赖 refreshKey，绝不可依赖 loadWikiTree——
     否则 treeCache 每次更新都会重建 loadWikiTree 导致 effect 反复触发，
     与 force 重载形成无限请求循环，把界面卡死。 */
  const loadWikiTreeRef = useRef(loadWikiTree)
  loadWikiTreeRef.current = loadWikiTree
  const expandedWikisRef = useRef<Set<number>>(new Set())
  expandedWikisRef.current = expandedWikis
  useEffect(() => {
    if (refreshKey <= 0) return
    const aliveIds = new Set(wikis.map((w) => w.id))
    /* 清掉已删除知识库的残留展开状态 */
    setExpandedWikis((prev) => {
      const next = new Set([...prev].filter((id) => aliveIds.has(id)))
      return next.size === prev.size ? prev : next
    })
    ;[...expandedWikisRef.current].forEach((wikiId) => {
      if (aliveIds.has(wikiId)) {
        loadWikiTreeRef.current(wikiId, true).then()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const toggleWiki = useCallback(
    (wikiId: number) => {
      setExpandedWikis((prev) => {
        const next = new Set(prev)
        if (next.has(wikiId)) {
          next.delete(wikiId)
        } else {
          next.add(wikiId)
          loadWikiTree(wikiId).then()
        }
        return next
      })
    },
    [loadWikiTree]
  )

  const toggleDir = useCallback((dirId: number) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(dirId)) next.delete(dirId)
      else next.add(dirId)
      return next
    })
  }, [])

  /* ── 目录 CRUD ── */
  const openCreateDir = useCallback((wikiId: number, parent: WikiDirectoryRow | null) => {
    setEditingDir(null)
    setDirTarget({ wikiId, parent })
    setDirName('新目录')
    setDirModalTitle(parent ? `在「${parent.name}」下新建目录` : '新建目录')
    setDirModalOpen(true)
  }, [])

  const openRenameDir = useCallback((dir: WikiDirectoryRow) => {
    setEditingDir(dir)
    setDirTarget({ wikiId: dir.wiki_id, parent: null })
    setDirName(dir.name)
    setDirModalTitle('重命名目录')
    setDirModalOpen(true)
  }, [])

  const handleDirModalOk = useCallback(async (): Promise<void> => {
    const messageKey = 'dir-save'
    setDirSaving(true)
    try {
      if (editingDir) {
        viewMessage(messageKey, 'loading', '正在保存目录...')
        await api.wikis.updateDirectory(editingDir.id, { name: dirName })
        viewMessage(messageKey, 'success', '目录已保存', 2)
        await loadWikiTree(editingDir.wiki_id, true)
      } else if (dirTarget) {
        viewMessage(messageKey, 'loading', '正在创建目录...')
        await api.wikis.addDirectory({
          wiki_id: dirTarget.wikiId,
          parent_id: dirTarget.parent?.id ?? null,
          name: dirName,
          sort_order: 0,
          level: dirTarget.parent ? dirTarget.parent.level + 1 : 0
        })
        viewMessage(messageKey, 'success', '目录创建成功！', 2)
        await loadWikiTree(dirTarget.wikiId, true)
      }
      setDirModalOpen(false)
    } catch (error) {
      console.error('Failed to save directory:', error)
      viewMessage(messageKey, 'error', '保存目录失败')
    } finally {
      setDirSaving(false)
    }
  }, [api, viewMessage, loadWikiTree, editingDir, dirTarget, dirName])

  const handleDeleteDir = useCallback(
    (dir: WikiDirectoryRow) => {
      modal.confirm({
        title: `确定要删除目录「${dir.name}」吗？`,
        content: '目录中的文档不会被删除，只会与目录解除关联。',
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          const messageKey = 'dir-delete'
          try {
            viewMessage(messageKey, 'loading', '正在删除目录...')
            await api.wikis.deleteDirectory(dir.id)
            viewMessage(messageKey, 'success', '目录已删除', 2)
            await loadWikiTree(dir.wiki_id, true)
            /* 目录删除后其中的文档解除关联回到文档库，通知父级刷新列表 */
            onDocsChanged?.()
          } catch (error) {
            console.error('Failed to delete directory:', error)
            viewMessage(messageKey, 'error', '删除目录失败')
          }
        }
      })
    },
    [api, viewMessage, loadWikiTree, onDocsChanged, modal]
  )

  const handleRemoveDocFromDir = useCallback(
    (wikiId: number, dir: WikiDirectoryRow, docId: number, docName: string) => {
      modal.confirm({
        title: `从「${dir.name}」移除「${docName}」？`,
        content: '仅解除目录关联，文档本身不会被删除。',
        okText: '移除',
        cancelText: '取消',
        onOk: async () => {
          const messageKey = 'remove-doc'
          try {
            viewMessage(messageKey, 'loading', '正在移除...')
            await api.wikis.removeNoteFromDirectory(dir.id, docId)
            viewMessage(messageKey, 'success', '已从目录移除', 2)
            await loadWikiTree(wikiId, true)
            /* 文档解除关联后回到文档库，通知父级刷新列表 */
            onDocsChanged?.()
          } catch (error) {
            console.error('Failed to remove doc from directory:', error)
            viewMessage(messageKey, 'error', '移除失败')
          }
        }
      })
    },
    [api, viewMessage, loadWikiTree, onDocsChanged, modal]
  )

  /* ── 数据分组（时间字段运行时可能是 Date/number，统一转字符串比较） ── */
  const sortedDocs = useMemo(
    () =>
      [...docs].sort((a, b) =>
        String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''))
      ),
    [docs]
  )
  const todoGroups = useMemo(() => {
    const pending = todos.filter((t) => t.status === 0)
    const doing = todos.filter((t) => t.status === 1)
    const done = todos.filter((t) => t.status === 2)
    const byDue = (a: TodoItemRow, b: TodoItemRow): number =>
      String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999'))
    return {
      pending: pending.sort(byDue),
      doing: doing.sort(byDue),
      done: done.sort(byDue)
    }
  }, [todos])

  const searchLower = search.trim().toLowerCase()

  /* ── 行样式 ── */
  const rowStyle = (selected: boolean, indent = 0): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 28,
    padding: `0 6px 0 ${8 + indent * 16}px`,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    color: selected ? token.colorPrimary : token.colorText,
    background: selected ? token.colorPrimaryBg : 'transparent',
    position: 'relative'
  })

  const accentBar = (visible: boolean): React.ReactNode =>
    visible ? (
      <span
        style={{
          position: 'absolute',
          left: 0,
          top: 6,
          bottom: 6,
          width: 2.5,
          borderRadius: 2,
          background: token.colorPrimary
        }}
      />
    ) : null

  /* ── 折叠箭头（行首，独立点击区） ── */
  const toggleArrow = (open: boolean, onToggle: () => void): React.ReactNode => (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        flexShrink: 0,
        borderRadius: 4,
        color: token.colorTextTertiary,
        cursor: 'pointer'
      }}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = token.colorFillTertiary
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <RiArrowRightSLine
        size={14}
        style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
      />
    </span>
  )

  /** 占位（文档行无箭头，保持图标对齐） */
  const arrowPlaceholder = <span style={{ width: 18, height: 18, flexShrink: 0 }} aria-hidden />

  /* ── 行尾「⋯」操作菜单 ── */
  const rowMenu = (items: MenuProps['items']): React.ReactNode => (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items,
        onClick: ({ domEvent }) => {
          domEvent.stopPropagation()
        }
      }}
    >
      <span
        className="tree-more-btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          flexShrink: 0,
          borderRadius: 4,
          color: token.colorTextTertiary,
          cursor: 'pointer'
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = token.colorFillTertiary
          e.currentTarget.style.color = token.colorText
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = token.colorTextTertiary
        }}
      >
        <RiMore2Line size={14} />
      </span>
    </Dropdown>
  )

  /* ── 分区标题 ── */
  const renderSectionHeader = (
    key: string,
    icon: React.ReactNode,
    label: string,
    count: number,
    onCreate: () => void
  ): React.ReactNode => {
    const open = sectionOpen[key]
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 30,
          padding: '0 8px 0 4px',
          cursor: 'pointer',
          userSelect: 'none'
        }}
        onClick={() => setSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }))}
      >
        <RiArrowRightSLine
          size={14}
          style={{
            color: token.colorTextTertiary,
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s'
          }}
        />
        <span
          style={{
            marginLeft: 2,
            color: token.colorTextSecondary,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 12.5,
            fontWeight: 600
          }}
        >
          {icon}
          {label}
        </span>
        <span style={{ marginLeft: 6, fontSize: 11, color: token.colorTextTertiary }}>{count}</span>
        <span style={{ flex: 1 }} />
        <Tooltip title={`新建${label}`}>
          <button
            style={{
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              borderRadius: 5,
              background: 'transparent',
              color: token.colorTextTertiary,
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = token.colorFillTertiary
              e.currentTarget.style.color = token.colorText
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = token.colorTextTertiary
            }}
            onClick={(e) => {
              e.stopPropagation()
              onCreate()
            }}
          >
            <RiAddLine size={14} />
          </button>
        </Tooltip>
      </div>
    )
  }

  /* ── 知识库子树 ── */
  const renderWikiChildren = (wikiId: number, tree: WikiTreeData): React.ReactNode => {
    const wikiTitle = wikis.find((w) => w.id === wikiId)?.title
    const dirsByParent = new Map<number | null, WikiDirectoryRow[]>()
    tree.dirs.forEach((d) => {
      const list = dirsByParent.get(d.parent_id) ?? []
      list.push(d)
      dirsByParent.set(d.parent_id, list)
    })
    const renderDirs = (parentId: number | null, depth: number): React.ReactNode[] => {
      const dirs = (dirsByParent.get(parentId) ?? []).sort((a, b) => a.sort_order - b.sort_order)
      return dirs.flatMap((dir) => {
        const dirOpen = expandedDirs.has(dir.id)
        const noteIds = tree.notesByDir.get(dir.id) ?? []
        const dirRow = (
          <div key={`dir-${dir.id}`} style={rowStyle(false, 2 + depth)}>
            {depth > 0 && (
              <span
                style={{
                  position: 'absolute',
                  left: 8 + (2 + depth - 1) * 16 + 9,
                  top: 0,
                  bottom: 0,
                  borderLeft: `1px dashed ${token.colorBorderSecondary}`
                }}
              />
            )}
            {toggleArrow(dirOpen, () => toggleDir(dir.id))}
            <RiFolder2Line size={14} style={{ color: token.colorWarning, flexShrink: 0 }} />
            <span
              style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
              onClick={() => toggleDir(dir.id)}
            >
              {dir.name}
            </span>
            {noteIds.length > 0 && (
              <span
                style={{
                  fontSize: 10,
                  color: token.colorTextTertiary,
                  background: token.colorFillTertiary,
                  borderRadius: 8,
                  padding: '0 5px',
                  lineHeight: '15px',
                  flexShrink: 0
                }}
              >
                {noteIds.length}
              </span>
            )}
            {rowMenu([
              {
                key: 'new-doc',
                label: '新建文档',
                icon: <RiFileAddLine size={14} />,
                onClick: () => onCreateDocInDirectory(dir.id, { wikiId, dirName: dir.name })
              },
              {
                key: 'new-subdir',
                label: '新建子目录',
                icon: <RiFolderAddLine size={14} />,
                onClick: () => openCreateDir(wikiId, dir)
              },
              { type: 'divider' },
              {
                key: 'rename',
                label: '重命名',
                icon: <RiEditLine size={14} />,
                onClick: () => openRenameDir(dir)
              },
              {
                key: 'delete',
                label: '删除目录',
                danger: true,
                icon: <RiDeleteBinLine size={14} />,
                onClick: () => handleDeleteDir(dir)
              }
            ])}
          </div>
        )
        const children: React.ReactNode[] = [dirRow]
        if (dirOpen) {
          children.push(...renderDirs(dir.id, depth + 1))
          noteIds.forEach((noteId) => {
            const isSel = selection?.kind === 'doc' && selection.docId === noteId
            const title = docTitle(noteId)
            children.push(
              <div key={`doc-${noteId}`} style={rowStyle(isSel, 3 + depth)}>
                {accentBar(isSel)}
                <span
                  style={{
                    position: 'absolute',
                    left: 8 + (3 + depth - 1) * 16 + 9,
                    top: 0,
                    bottom: 0,
                    borderLeft: `1px dashed ${token.colorBorderSecondary}`
                  }}
                />
                {arrowPlaceholder}
                <RiFileTextLine
                  size={13}
                  style={{ color: token.colorTextTertiary, flexShrink: 0 }}
                />
                <span
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                  onClick={() =>
                    onSelect({
                      kind: 'doc',
                      docId: noteId,
                      source: { wikiId, dirId: dir.id, dirName: dir.name, wikiTitle }
                    })
                  }
                >
                  {title}
                </span>
                {rowMenu([
                  {
                    key: 'open',
                    label: '打开',
                    icon: <RiExternalLinkLine size={14} />,
                    onClick: () =>
                      onSelect({
                        kind: 'doc',
                        docId: noteId,
                        source: { wikiId, dirId: dir.id, dirName: dir.name, wikiTitle }
                      })
                  },
                  {
                    key: 'remove',
                    label: '从目录移除',
                    icon: <RiFolderTransferLine size={14} />,
                    onClick: () => handleRemoveDocFromDir(wikiId, dir, noteId, title)
                  },
                  {
                    key: 'archive',
                    label: '归档到其他目录',
                    icon: <RiInboxArchiveLine size={14} />,
                    onClick: () => {
                      const doc = docs.find((d) => d.id === noteId)
                      if (doc) onArchiveDoc(doc)
                    }
                  },
                  { type: 'divider' },
                  {
                    key: 'delete',
                    label: '彻底删除',
                    danger: true,
                    icon: <RiDeleteBinLine size={14} />,
                    onClick: () => {
                      const doc = docs.find((d) => d.id === noteId)
                      if (doc) onDeleteDoc(doc)
                    }
                  }
                ])}
              </div>
            )
          })
        }
        return children
      })
    }
    return renderDirs(null, 0)
  }

  /* ── 搜索模式 ── */
  const renderSearchResults = (): React.ReactNode => {
    const matchedDocs = [...allDocs]
      .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
      .filter((d) => d.title.toLowerCase().includes(searchLower))
    const matchedTodos = todos.filter((t) => t.title.toLowerCase().includes(searchLower))
    const matchedWikis = wikis.filter((w) => w.title.toLowerCase().includes(searchLower))
    const total = matchedDocs.length + matchedTodos.length + matchedWikis.length
    if (total === 0) {
      return (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="无匹配结果"
          style={{ marginTop: 32 }}
        />
      )
    }
    return (
      <>
        {matchedDocs.length > 0 && (
          <>
            <div style={searchGroupStyle(token)}>文档 · {matchedDocs.length}</div>
            {matchedDocs.map((d) => {
              const isSel = selection?.kind === 'doc' && selection.docId === d.id
              return (
                <div
                  key={`doc-${d.id}`}
                  style={rowStyle(isSel, 1)}
                  onClick={() => onSelect({ kind: 'doc', docId: d.id })}
                  onMouseEnter={(e) => {
                    if (!isSel) e.currentTarget.style.background = token.colorFillQuaternary
                  }}
                  onMouseLeave={(e) => {
                    if (!isSel) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {accentBar(isSel)}
                  {arrowPlaceholder}
                  <RiFileTextLine
                    size={13}
                    style={{ color: token.colorTextTertiary, flexShrink: 0 }}
                  />
                  <span
                    style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {d.title}
                  </span>
                  {rowMenu([
                    {
                      key: 'open',
                      label: '打开',
                      onClick: () => onSelect({ kind: 'doc', docId: d.id })
                    },
                    {
                      key: 'archive',
                      label: '归档到知识库',
                      onClick: () => onArchiveDoc(d)
                    },
                    { type: 'divider' },
                    {
                      key: 'delete',
                      label: '删除文档',
                      danger: true,
                      onClick: () => onDeleteDoc(d)
                    }
                  ])}
                </div>
              )
            })}
          </>
        )}
        {matchedTodos.length > 0 && (
          <>
            <div style={searchGroupStyle(token)}>待办 · {matchedTodos.length}</div>
            {matchedTodos.map((t) => (
              <div
                key={`todo-${t.id}`}
                style={rowStyle(false, 1)}
                onClick={() => onSelect({ kind: 'todo', todoId: t.id })}
              >
                {arrowPlaceholder}
                <RiTodoLine
                  size={13}
                  style={{ color: TODO_STATUS_META[t.status]?.color, flexShrink: 0 }}
                />
                <span
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {t.title}
                </span>
              </div>
            ))}
          </>
        )}
        {matchedWikis.length > 0 && (
          <>
            <div style={searchGroupStyle(token)}>知识库 · {matchedWikis.length}</div>
            {matchedWikis.map((w) => (
              <div key={`wiki-${w.id}`} style={rowStyle(false, 1)} onClick={() => toggleWiki(w.id)}>
                {toggleArrow(expandedWikis.has(w.id), () => toggleWiki(w.id))}
                <RiBook2Line size={13} style={{ color: token.colorWarning, flexShrink: 0 }} />
                <span
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {w.title}
                </span>
                {rowMenu([
                  { key: 'edit', label: '编辑知识库', onClick: () => onEditWiki(w) },
                  {
                    key: 'delete',
                    label: '删除知识库',
                    danger: true,
                    onClick: () => onDeleteWiki(w)
                  }
                ])}
              </div>
            ))}
          </>
        )}
      </>
    )
  }

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 12,
        overflow: 'hidden'
      }}
    >
      {/* 搜索 */}
      <div style={{ padding: '12px 12px 8px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 32,
            padding: '0 10px',
            borderRadius: 8,
            background: token.colorFillTertiary,
            border: `1px solid ${searchFocused ? token.colorPrimary : 'transparent'}`,
            boxShadow: searchFocused ? `0 0 0 2px ${token.colorPrimaryBg}` : 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s'
          }}
        >
          <RiSearchLine size={14} style={{ color: token.colorTextTertiary }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="搜索文档 / 待办 / 知识库"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 12.5,
              color: token.colorText
            }}
          />
        </div>
      </div>

      {/* 树区域 */}
      <div
        className="custom-scrollbar"
        style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}
      >
        {searchLower ? (
          renderSearchResults()
        ) : (
          <>
            {renderSectionHeader(
              'docs',
              <RiFileTextLine size={13} />,
              '文档库',
              docs.length,
              onCreateDoc
            )}
            {sectionOpen.docs &&
              (sortedDocs.length === 0 ? (
                <div
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    color: token.colorTextTertiary,
                    textAlign: 'center',
                    userSelect: 'none'
                  }}
                >
                  暂无文档
                </div>
              ) : (
                sortedDocs.map((d) => {
                  const isSel = selection?.kind === 'doc' && selection.docId === d.id
                  return (
                    <div
                      key={`doc-${d.id}`}
                      style={rowStyle(isSel, 1)}
                      onClick={() => onSelect({ kind: 'doc', docId: d.id })}
                      onMouseEnter={(e) => {
                        if (!isSel) e.currentTarget.style.background = token.colorFillQuaternary
                      }}
                      onMouseLeave={(e) => {
                        if (!isSel) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {accentBar(isSel)}
                      {arrowPlaceholder}
                      <RiFileTextLine
                        size={13}
                        style={{ color: token.colorTextTertiary, flexShrink: 0 }}
                      />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {d.title}
                      </span>
                      {rowMenu([
                        {
                          key: 'open',
                          label: '打开',
                          onClick: () => onSelect({ kind: 'doc', docId: d.id })
                        },
                        {
                          key: 'archive',
                          label: '归档到知识库',
                          onClick: () => onArchiveDoc(d)
                        },
                        { type: 'divider' },
                        {
                          key: 'delete',
                          label: '删除文档',
                          danger: true,
                          onClick: () => onDeleteDoc(d)
                        }
                      ])}
                    </div>
                  )
                })
              ))}

            {renderSectionHeader(
              'todos',
              <RiCheckboxCircleLine size={13} />,
              '待办',
              todos.length,
              onCreateTodo
            )}
            {sectionOpen.todos &&
              (todos.length === 0 ? (
                <div
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    color: token.colorTextTertiary,
                    textAlign: 'center',
                    userSelect: 'none'
                  }}
                >
                  暂无待办
                </div>
              ) : (
                (
                  [
                    {
                      key: 'pending',
                      label: '待办',
                      items: todoGroups.pending,
                      icon: RiCheckboxBlankCircleLine
                    },
                    {
                      key: 'doing',
                      label: '进行中',
                      items: todoGroups.doing,
                      icon: RiPlayCircleLine
                    },
                    {
                      key: 'done',
                      label: '已完成',
                      items: todoGroups.done,
                      icon: RiCheckboxCircleLine
                    }
                  ] as const
                ).map((group) =>
                  group.items.length === 0 ? null : (
                    <div key={group.key}>
                      <div style={searchGroupStyle(token)}>
                        {group.label} · {group.items.length}
                      </div>
                      {group.items.map((t) => (
                        <div
                          key={`todo-${t.id}`}
                          style={rowStyle(false, 1)}
                          onClick={() => onSelect({ kind: 'todo', todoId: t.id })}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = token.colorFillQuaternary
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                          }}
                        >
                          {arrowPlaceholder}
                          <group.icon
                            size={13}
                            style={{ color: TODO_STATUS_META[t.status]?.color, flexShrink: 0 }}
                          />
                          <span
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {t.title}
                          </span>
                          {t.status !== 2 && t.due_date ? (
                            <span
                              style={{
                                fontSize: 10,
                                color: token.colorTextTertiary,
                                flexShrink: 0,
                                background: token.colorFillTertiary,
                                borderRadius: 4,
                                padding: '0 5px',
                                lineHeight: '15px'
                              }}
                            >
                              {String(t.due_date).slice(5)}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )
                )
              ))}

            {renderSectionHeader(
              'wikis',
              <RiBook2Line size={13} />,
              '知识库',
              wikis.length,
              onCreateWiki
            )}
            {sectionOpen.wikis &&
              (wikis.length === 0 ? (
                <div
                  style={{
                    padding: '4px 12px',
                    fontSize: 12,
                    color: token.colorTextTertiary,
                    textAlign: 'center',
                    userSelect: 'none'
                  }}
                >
                  暂无知识库
                </div>
              ) : (
                wikis.map((w) => {
                  const wikiOpen = expandedWikis.has(w.id)
                  const tree = treeCache[w.id]
                  const isLoading = loadingWikis.has(w.id)
                  return (
                    <div key={w.id}>
                      <div style={rowStyle(false, 1)}>
                        {toggleArrow(wikiOpen, () => toggleWiki(w.id))}
                        <RiBook2Line
                          size={13}
                          style={{ color: token.colorWarning, flexShrink: 0 }}
                        />
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          onClick={() => toggleWiki(w.id)}
                        >
                          {w.title}
                        </span>
                        {isLoading ? (
                          <Spin size="small" />
                        ) : (
                          rowMenu([
                            {
                              key: 'new-dir',
                              label: '新建目录',
                              icon: <RiFolderAddLine size={14} />,
                              onClick: () => openCreateDir(w.id, null)
                            },
                            { type: 'divider' },
                            {
                              key: 'edit',
                              label: '编辑知识库',
                              icon: <RiEditLine size={14} />,
                              onClick: () => onEditWiki(w)
                            },
                            {
                              key: 'delete',
                              label: '删除知识库',
                              danger: true,
                              icon: <RiDeleteBinLine size={14} />,
                              onClick: () => onDeleteWiki(w)
                            }
                          ])
                        )}
                      </div>
                      {wikiOpen && tree && renderWikiChildren(w.id, tree)}
                    </div>
                  )
                })
              ))}
          </>
        )}
      </div>

      {/* 目录编辑弹窗 */}
      <Modal
        title={dirModalTitle}
        open={dirModalOpen}
        onOk={handleDirModalOk}
        onCancel={() => setDirModalOpen(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={dirSaving}
        width={380}
      >
        <Input
          autoFocus
          placeholder="目录名称"
          value={dirName}
          onChange={(e) => setDirName(e.target.value)}
          onPressEnter={handleDirModalOk}
        />
      </Modal>
    </aside>
  )
}

const searchGroupStyle = (
  token: ReturnType<typeof theme.useToken>['token']
): React.CSSProperties => ({
  fontSize: 11,
  color: token.colorTextTertiary,
  padding: '4px 8px 2px 16px',
  userSelect: 'none'
})

export default React.memo(DocTreePanel)
