import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Spin, Tag, theme, Modal } from 'antd'
import { RiBook2Line, RiFileTextLine, RiPencilLine, RiInboxArchiveLine } from '@remixicon/react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  type Node,
  type NodeProps
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Window } from '../../../../resource/types/window'
import WikiPreviewModal from '@renderer/components/wiki/WikiPreviewModal'
import WikiEditModal from '@renderer/components/wiki/WikiEditModal'
import WikiDetail from '@renderer/components/wiki/WikiDocumentModal'

import DocumentPreviewModal from '@renderer/components/document/DocumentPreviewModal'
import DocumentEditModal from '@renderer/components/document/DocumentEditModal'
import TodoEditModal, { type TodoFormValues } from '@renderer/components/todo/TodoEditModal'
import TodoPreviewModal from '@renderer/components/todo/TodoPreviewModal'
import { useMessage } from '@renderer/hooks/useMessage'
import { useTheme } from '@renderer/contexts/useTheme'
import type {
  WikiRow,
  DocListItem,
  DocItem as DocItemType,
  TodoItem as TodoItemRow
} from '@renderer/types/models'
import type { StickyPalette, ThemePalette } from '@renderer/types/components'

/* ──────────── Sticky note palettes ──────────── */

const STICKY_LIGHT: StickyPalette[] = [
  { bg: '#fff9c4', shadow: '#e6d88a80', tape: '#f5e79a' },
  { bg: '#fce4ec', shadow: '#d4b8c080', tape: '#f8c8d4' },
  { bg: '#e8f5e9', shadow: '#b8c8ba80', tape: '#c8e6c9' },
  { bg: '#e3f2fd', shadow: '#b4c4d080', tape: '#bbdefb' },
  { bg: '#f3e5f5', shadow: '#c4b8c880', tape: '#e1bee7' },
  { bg: '#fff3e0', shadow: '#d4c4b080', tape: '#ffe0b2' }
]

const STICKY_DARK: StickyPalette[] = [
  { bg: '#4a4520', shadow: '#35311880', tape: '#5c5628' },
  { bg: '#4a2d36', shadow: '#35202680', tape: '#5c3642' },
  { bg: '#2d3d30', shadow: '#202c2280', tape: '#364a3a' },
  { bg: '#2d3648', shadow: '#1e243280', tape: '#364258' },
  { bg: '#3d2d3d', shadow: '#2a202a80', tape: '#4a364a' },
  { bg: '#4a3828', shadow: '#35261c80', tape: '#5c4430' }
]

/* ──────────── Node position presets (pixel coords) ──────────── */

const WIKI_POSITIONS = [
  { x: 150, y: 120 },
  { x: 180, y: 520 },
  { x: 140, y: 920 }
]
const TODO_POSITIONS = [
  { x: 520, y: 100 },
  { x: 550, y: 500 },
  { x: 530, y: 900 }
]
const DOC_POSITIONS = [
  { x: 950, y: 110 },
  { x: 970, y: 510 },
  { x: 940, y: 910 }
]

/* ──────────── React Flow node data types ──────────── */

interface WikiNodeData extends Record<string, unknown> {
  wiki: WikiRow
  palette: ReturnType<typeof useThemePalette>
  onOpen: (wiki: WikiRow) => void
  onEdit: (wiki: WikiRow) => void
  onArchive: (wiki: WikiRow) => void
}

interface TodoNodeData extends Record<string, unknown> {
  todo: TodoItemRow
  palette: ReturnType<typeof useThemePalette>
  colorIndex: number
  onOpen: (todo: TodoItemRow) => void
  onEdit: (todo: TodoItemRow) => void
}

interface DocNodeData extends Record<string, unknown> {
  doc: DocListItem
  palette: ReturnType<typeof useThemePalette>
  onOpen: (doc: DocListItem) => void
  onEdit: (doc: DocListItem) => void
}

/* ──────────── Theme palette hook ──────────── */

function useThemePalette(): ThemePalette {
  const { effectiveTheme } = useTheme()
  const { token } = theme.useToken()
  const isDark = effectiveTheme === 'dark'

  return useMemo(
    () => ({
      wikiStackOuter: isDark ? '#2a2a2a' : '#e8e8e8',
      wikiStackInner: isDark ? '#333333' : '#eeeeee',
      wikiStackShadow: '0 1px 3px rgba(0,0,0,0.08)',
      wikiCardBg: isDark ? '#1a1a1a' : '#ffffff',
      wikiCardShadow: isDark
        ? '0 4px 16px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.20)'
        : '0 4px 16px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)',
      wikiIconColor: isDark ? '#a78bfa' : '#7c3aed',
      stickyColors: isDark ? STICKY_DARK : STICKY_LIGHT,
      docCardBg: isDark ? token.colorFillAlter : '#f0f0f0',
      docCardBorder: isDark ? token.colorBorderSecondary : '#e5e5e5',
      docCardShadow: isDark
        ? '0 2px 10px rgba(0,0,0,0.30), 0 1px 3px rgba(0,0,0,0.15)'
        : '0 2px 10px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.04)',
      docIconColor: isDark ? '#999' : '#888',
      todoDescColor: isDark ? '#bbb' : '#555',
      textColor: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.88)',
      textSecondary: isDark ? '#999' : '#666'
    }),
    [isDark, token]
  )
}

/* ──────────── Tag parser ──────────── */

function parseTags(tagsStr: string | null): string[] {
  if (!tagsStr) return []
  try {
    const allTags = new Set<string>()
    const parsed = JSON.parse('[' + tagsStr + ']')
    if (Array.isArray(parsed)) {
      parsed.forEach((item) => {
        if (Array.isArray(item)) item.forEach((tag: string) => allTags.add(tag))
      })
    }
    return Array.from(allTags).slice(0, 3)
  } catch {
    return []
  }
}

/* ──────────── Date formatter ──────────── */

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

/* ═══════════════════════════════════════════════════════════
   Custom Node Components
   ═══════════════════════════════════════════════════════════ */

/** Type A: Wiki folder — stacked paper look */
const WikiNode: React.FC<NodeProps<Node<WikiNodeData>>> = ({ data }) => {
  const { wiki, palette } = data
  const [hovered, setHovered] = useState(false)
  const tags = parseTags(wiki.tags)

  const iconBtnBase: React.CSSProperties = {
    position: 'absolute',
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    background: 'rgba(128,128,128,0.10)',
    color: palette.textSecondary,
    opacity: hovered ? 1 : 0,
    transition: 'opacity 0.15s ease, background 0.15s ease',
    zIndex: 2
  }

  return (
    <div
      style={{ cursor: 'pointer', position: 'relative' }}
      onClick={() => data.onOpen(wiki)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* stacked paper layers behind */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 4,
          width: 240,
          height: 200,
          background: palette.wikiStackOuter,
          borderRadius: 14,
          transform: 'rotate(-1.5deg)',
          boxShadow: palette.wikiStackShadow
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 3,
          left: 2,
          width: 240,
          height: 200,
          background: palette.wikiStackInner,
          borderRadius: 14,
          transform: 'rotate(0.8deg)',
          boxShadow: palette.wikiStackShadow
        }}
      />
      {/* main card */}
      <div
        style={{
          position: 'relative',
          width: 240,
          minHeight: 200,
          background: palette.wikiCardBg,
          borderRadius: 14,
          boxShadow: palette.wikiCardShadow,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          transition: 'box-shadow 0.2s ease'
        }}
        className="hover:shadow-lg"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <RiBook2Line size={20} style={{ color: palette.wikiIconColor }} />
          <span
            className="font-semibold truncate"
            style={{ fontSize: 15, flex: 1, color: palette.textColor }}
          >
            {wiki.title}
          </span>
        </div>
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {tags.map((tag, i) => (
              <Tag key={i} style={{ margin: 0, fontSize: 11 }}>
                {tag}
              </Tag>
            ))}
          </div>
        )}
        {wiki.summary && (
          <div
            className="line-clamp-3"
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              marginBottom: 12,
              fontStyle: 'italic',
              color: palette.textSecondary
            }}
          >
            {wiki.summary}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 'auto'
          }}
        >
          <span style={{ fontSize: 11, color: palette.textSecondary }}>
            {new Date(wiki.updated_at).toLocaleDateString('zh-CN')}
          </span>
          <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
            {wiki.doc_count} 篇
          </Tag>
        </div>
        {/* edit button */}
        <button
          style={{ ...iconBtnBase, top: 8, right: 8 }}
          onClick={(e) => {
            e.stopPropagation()
            data.onEdit(wiki)
          }}
          title="编辑知识库"
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(128,128,128,0.22)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(128,128,128,0.10)')}
        >
          <RiPencilLine size={14} />
        </button>
        {/* archive button */}
        <button
          style={{ ...iconBtnBase, top: 40, right: 8 }}
          onClick={(e) => {
            e.stopPropagation()
            data.onArchive(wiki)
          }}
          title="归档文档到知识库"
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(128,128,128,0.22)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(128,128,128,0.10)')}
        >
          <RiInboxArchiveLine size={14} />
        </button>
      </div>
    </div>
  )
}

/** Type B: Todo sticky note */
const TodoNode: React.FC<NodeProps<Node<TodoNodeData>>> = ({ data }) => {
  const { todo, palette, colorIndex } = data
  const [hovered, setHovered] = useState(false)
  const stickyPalette = palette.stickyColors[colorIndex % palette.stickyColors.length]

  return (
    <div
      style={{ cursor: 'pointer' }}
      onClick={() => data.onOpen(todo)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          width: 220,
          minHeight: 160,
          background: stickyPalette.bg,
          borderRadius: '2px 2px 14px 14px',
          boxShadow: `0 3px 10px ${stickyPalette.shadow}, 0 1px 3px rgba(0,0,0,0.06)`,
          padding: '20px 16px 16px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}
      >
        {/* tape */}
        <div
          style={{
            position: 'absolute',
            top: -6,
            left: '50%',
            transform: 'translateX(-50%) rotate(-2deg)',
            width: 56,
            height: 18,
            background: stickyPalette.tape,
            borderRadius: 2,
            opacity: 0.7
          }}
        />
        <span
          className="font-semibold truncate"
          style={{ fontSize: 14, marginBottom: 6, lineHeight: 1.3, color: palette.textColor }}
        >
          {todo.title}
        </span>
        {todo.description && (
          <div
            className="line-clamp-3"
            style={{
              fontSize: 12,
              color: palette.todoDescColor,
              marginBottom: 10,
              lineHeight: 1.4
            }}
          >
            {todo.description}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {todo.priority <= 1 ? (
            <Tag color="red" style={{ margin: 0, fontSize: 10 }}>
              P{todo.priority}
            </Tag>
          ) : todo.priority <= 3 ? (
            <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>
              P{todo.priority}
            </Tag>
          ) : (
            <Tag style={{ margin: 0, fontSize: 10 }}>P{todo.priority}</Tag>
          )}
          {todo.due_date && (
            <span style={{ fontSize: 11, color: palette.textSecondary }}>
              {formatDueDate(todo.due_date)}
            </span>
          )}
        </div>
        {/* edit button */}
        <button
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: 'rgba(0,0,0,0.08)',
            color: palette.textSecondary,
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s ease, background 0.15s ease',
            zIndex: 2
          }}
          onClick={(e) => {
            e.stopPropagation()
            data.onEdit(todo)
          }}
          title="编辑待办事项"
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.18)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.08)')}
        >
          <RiPencilLine size={14} />
        </button>
      </div>
    </div>
  )
}

/** Type D: Document card — plain paper */
const DocNode: React.FC<NodeProps<Node<DocNodeData>>> = ({ data }) => {
  const { doc, palette } = data
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{ cursor: 'pointer' }}
      onClick={() => data.onOpen(doc)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          width: 220,
          minHeight: 140,
          background: palette.docCardBg,
          borderRadius: 14,
          boxShadow: palette.docCardShadow,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          border: `1px solid ${palette.docCardBorder}`,
          position: 'relative'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <RiFileTextLine size={18} style={{ color: palette.docIconColor }} />
          <span
            className="font-semibold truncate"
            style={{ fontSize: 14, flex: 1, color: palette.textColor }}
          >
            {doc.title}
          </span>
        </div>
        {doc.summary && (
          <div
            className="line-clamp-3"
            style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8, color: palette.textSecondary }}
          >
            {doc.summary}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: palette.textSecondary }}>
          {doc.word_count} 字 · {new Date(doc.updated_at).toLocaleDateString('zh-CN')}
        </span>
        {/* edit button */}
        <button
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 26,
            height: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: 'rgba(128,128,128,0.10)',
            color: palette.textSecondary,
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s ease, background 0.15s ease',
            zIndex: 2
          }}
          onClick={(e) => {
            e.stopPropagation()
            data.onEdit(doc)
          }}
          title="编辑文档"
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(128,128,128,0.22)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(128,128,128,0.10)')}
        >
          <RiPencilLine size={14} />
        </button>
      </div>
    </div>
  )
}

/* ──────────── Memoized node types ──────────── */

const nodeTypes = {
  wiki: React.memo(WikiNode),
  todo: React.memo(TodoNode),
  doc: React.memo(DocNode)
}

/* ═══════════════════════════════════════════════════════════
   MainContent — Infinite Canvas powered by React Flow
   ═══════════════════════════════════════════════════════════ */

const MainContent: React.FC = () => {
  const { effectiveTheme } = useTheme()
  const { token } = theme.useToken()
  const isDark = effectiveTheme === 'dark'
  const palette = useThemePalette()
  const { viewMessage } = useMessage()

  /* ── data state ── */
  const [wikis, setWikis] = useState<WikiRow[]>([])
  const [todos, setTodos] = useState<TodoItemRow[]>([])
  const [docs, setDocs] = useState<DocListItem[]>([])
  const [loading, setLoading] = useState(true)

  /* ── React Flow nodes ── */
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])

  /* ── wiki preview modal state ── */
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [selectedWiki, setSelectedWiki] = useState<WikiRow | null>(null)

  /* ── doc preview modal state ── */
  const [isDocPreviewOpen, setIsDocPreviewOpen] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<DocItemType | null>(null)

  /* ── todo preview modal state ── */
  const [isTodoPreviewOpen, setIsTodoPreviewOpen] = useState(false)
  const [selectedTodo, setSelectedTodo] = useState<TodoItemRow | null>(null)

  /* ── context menu state ── */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  /* ── create modal state ── */
  const [newWikiOpen, setNewWikiOpen] = useState(false)
  const [newDocOpen, setNewDocOpen] = useState(false)
  const [newTodoOpen, setNewTodoOpen] = useState(false)

  /* ── edit modal state ── */
  const [editWikiOpen, setEditWikiOpen] = useState(false)
  const [editingWiki, setEditingWiki] = useState<WikiRow | null>(null)
  const [wikiDetailOpen, setWikiDetailOpen] = useState(false)
  const [detailWikiId, setDetailWikiId] = useState<number | undefined>(undefined)
  const [editTodoOpen, setEditTodoOpen] = useState(false)
  const [editingTodo, setEditingTodo] = useState<TodoItemRow | null>(null)
  const [editDocOpen, setEditDocOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<DocItemType | null>(null)

  /* ── fetch data ── */

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true)
    try {
      const [wikiResult, todoResult, docResult] = await Promise.all([
        (window as unknown as Window).api.wikis.getAll(1, 3),
        (window as unknown as Window).api.todoItems.getAll(),
        (window as unknown as Window).api.docs.getAll(1, 3, undefined, undefined)
      ])
      setWikis(wikiResult.items.slice(0, 3))
      setTodos(todoResult.filter((x: TodoItemRow) => x.status !== 2).slice(0, 3))
      setDocs(docResult.items.slice(0, 3))
    } catch (error) {
      console.error('Failed to load canvas data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(true)
  }, [loadData])

  /* ── build nodes from data whenever data or palette changes ── */

  useEffect(() => {
    const wikiNodes: Node<WikiNodeData>[] = wikis.map((wiki, i) => ({
      id: `wiki-${wiki.id}`,
      type: 'wiki',
      position: WIKI_POSITIONS[i] ?? WIKI_POSITIONS[0],
      data: {
        wiki,
        palette,
        onOpen: handleOpenPreview,
        onEdit: handleEditWiki,
        onArchive: handleOpenWikiDetail
      }
    }))

    const todoNodes: Node<TodoNodeData>[] = todos.map((todo, i) => ({
      id: `todo-${todo.id}`,
      type: 'todo',
      position: TODO_POSITIONS[i] ?? TODO_POSITIONS[0],
      data: { todo, palette, colorIndex: i, onOpen: handleOpenTodoPreview, onEdit: handleEditTodo }
    }))

    const docNodes: Node<DocNodeData>[] = docs.map((doc, i) => ({
      id: `doc-${doc.id}`,
      type: 'doc',
      position: DOC_POSITIONS[i] ?? DOC_POSITIONS[0],
      data: { doc, palette, onOpen: handleOpenDocPreview, onEdit: handleEditDoc }
    }))

    setNodes([...wikiNodes, ...todoNodes, ...docNodes])
  }, [wikis, todos, docs, palette, setNodes])

  /* ── wiki preview handler ── */

  const handleOpenPreview = useCallback((wiki: WikiRow): void => {
    setSelectedWiki(wiki)
    setIsPreviewOpen(true)
  }, [])

  const handleOpenTodoPreview = useCallback((todo: TodoItemRow): void => {
    setSelectedTodo(todo)
    setIsTodoPreviewOpen(true)
  }, [])

  const handleOpenDocPreview = useCallback(
    async (doc: DocListItem): Promise<void> => {
      const messageKey = 'doc-preview-load'
      try {
        viewMessage(messageKey, 'loading', '正在加载文档内容...')
        const fullDoc = await (window as unknown as Window).api.docs.getById(doc.id)
        if (fullDoc) {
          setSelectedDoc({ ...doc, content: fullDoc.content })
          setIsDocPreviewOpen(true)
          viewMessage(messageKey, 'success', '文档内容加载成功！', 2)
        } else {
          viewMessage(messageKey, 'error', '文档不存在')
        }
      } catch (error) {
        console.error('Failed to load doc content:', error)
        viewMessage(messageKey, 'error', '加载文档内容失败')
      }
    },
    [viewMessage]
  )

  /* ── context menu ── */

  const handlePaneContextMenu = useCallback((event: React.MouseEvent | MouseEvent): void => {
    event.preventDefault()
    setContextMenu({
      x: 'clientX' in event ? event.clientX : 0,
      y: 'clientY' in event ? event.clientY : 0
    })
  }, [])

  // Close context menu on any click outside
  useEffect(() => {
    const handler = (): void => setContextMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  /* ── create handlers ── */

  const handleNewWikiSave = useCallback(
    async (data: {
      title: string
      summary: string | null
      image: string | null
    }): Promise<void> => {
      const messageKey = 'canvas-new-wiki'
      try {
        viewMessage(messageKey, 'loading', '正在创建知识库...')
        await (window as unknown as Window).api.wikis.add(data)
        viewMessage(messageKey, 'success', '知识库创建成功！', 2)
        setNewWikiOpen(false)
        loadData()
      } catch (error) {
        console.error('Failed to create wiki:', error)
        viewMessage(messageKey, 'error', '创建知识库失败')
      }
    },
    [viewMessage, loadData]
  )

  const handleNewDocSave = useCallback(
    async (data: {
      title: string
      image: string | null
      summary: string | null
      content: string
      tags: string[]
    }): Promise<void> => {
      const messageKey = 'canvas-new-doc'
      try {
        viewMessage(messageKey, 'loading', '正在创建文档...')
        await (window as unknown as Window).api.docs.add({
          title: data.title || '新文档',
          image: data.image,
          summary: data.summary,
          content: data.content,
          tags: data.tags.length > 0 ? JSON.stringify(data.tags) : null
        })
        viewMessage(messageKey, 'success', '文档创建成功！', 2)
        setNewDocOpen(false)
        loadData()
      } catch (error) {
        console.error('Failed to create doc:', error)
        viewMessage(messageKey, 'error', '创建文档失败')
      }
    },
    [viewMessage, loadData]
  )

  const handleNewTodoSave = useCallback(
    async (values: {
      title: string
      description: string
      due_date: string | null
      priority: number
      category: string | null
    }): Promise<void> => {
      const messageKey = 'canvas-new-todo'
      try {
        viewMessage(messageKey, 'loading', '正在添加待办事项...')
        const newTodo = { ...values, status: 0, due_date: values.due_date ?? null }
        await (window as unknown as Window).api.todoItems.add(newTodo)
        viewMessage(messageKey, 'success', '待办事项添加成功', 2)
        setNewTodoOpen(false)
        loadData()
      } catch (error) {
        console.error('Failed to create todo:', error)
        viewMessage(messageKey, 'error', '添加待办事项失败')
      }
    },
    [viewMessage, loadData]
  )

  /* ── edit wiki handlers ── */

  const handleEditWiki = useCallback((wiki: WikiRow): void => {
    setEditingWiki(wiki)
    setEditWikiOpen(true)
  }, [])

  const handleEditWikiSave = useCallback(
    async (data: {
      title: string
      summary: string | null
      image: string | null
    }): Promise<void> => {
      if (!editingWiki) return
      const messageKey = 'canvas-edit-wiki'
      try {
        viewMessage(messageKey, 'loading', '正在保存知识库...')
        await (window as unknown as Window).api.wikis.update(editingWiki.id, {
          title: data.title,
          summary: data.summary,
          image: data.image
        })
        viewMessage(messageKey, 'success', '知识库已更新', 2)
        setEditWikiOpen(false)
        setEditingWiki(null)
        loadData()
      } catch (error) {
        console.error('Failed to update wiki:', error)
        viewMessage(messageKey, 'error', '保存知识库失败')
      }
    },
    [editingWiki, viewMessage, loadData]
  )

  /* ── wiki detail handler ── */

  const handleOpenWikiDetail = useCallback((wiki: WikiRow): void => {
    setDetailWikiId(wiki.id)
    setWikiDetailOpen(true)
  }, [])

  /* ── edit todo handlers ── */

  const handleEditTodo = useCallback(
    async (todo: TodoItemRow): Promise<void> => {
      const messageKey = 'canvas-edit-todo-load'
      try {
        viewMessage(messageKey, 'loading', '正在加载待办事项...')
        const result = await (window as unknown as Window).api.todoItems.getById(todo.id)
        if (result.length > 0) {
          setEditingTodo(result[0])
          setEditTodoOpen(true)
          viewMessage(messageKey, 'success', '待办事项加载成功', 1)
        } else {
          viewMessage(messageKey, 'error', '待办事项不存在')
        }
      } catch (error) {
        console.error('Failed to load todo:', error)
        viewMessage(messageKey, 'error', '加载待办事项失败')
      }
    },
    [viewMessage]
  )

  const handleEditTodoSave = useCallback(
    async (values: TodoFormValues): Promise<void> => {
      if (!editingTodo) return
      const messageKey = 'canvas-edit-todo'
      try {
        viewMessage(messageKey, 'loading', '正在保存待办事项...')
        await (window as unknown as Window).api.todoItems.update(editingTodo.id, {
          title: values.title,
          description: values.description,
          due_date: values.due_date,
          priority: values.priority,
          status: values.status,
          category: values.category
        })
        viewMessage(messageKey, 'success', '待办事项已更新', 2)
        setEditTodoOpen(false)
        setEditingTodo(null)
        loadData()
      } catch (error) {
        console.error('Failed to update todo:', error)
        viewMessage(messageKey, 'error', '保存待办事项失败')
      }
    },
    [editingTodo, viewMessage, loadData]
  )

  /* ── edit doc handlers ── */

  const handleEditDoc = useCallback(
    async (doc: DocListItem): Promise<void> => {
      const messageKey = 'canvas-edit-doc-load'
      try {
        viewMessage(messageKey, 'loading', '正在加载文档...')
        const fullDoc = await (window as unknown as Window).api.docs.getById(doc.id)
        if (fullDoc) {
          setEditingDoc({ ...doc, content: fullDoc.content })
          setEditDocOpen(true)
          viewMessage(messageKey, 'success', '文档加载成功', 1)
        } else {
          viewMessage(messageKey, 'error', '文档不存在')
        }
      } catch (error) {
        console.error('Failed to load doc:', error)
        viewMessage(messageKey, 'error', '加载文档失败')
      }
    },
    [viewMessage]
  )

  const handleEditDocSave = useCallback(
    async (data: {
      title: string
      image: string | null
      summary: string | null
      content: string
      tags: string[]
    }): Promise<void> => {
      if (!editingDoc) return
      const messageKey = 'canvas-edit-doc'
      try {
        viewMessage(messageKey, 'loading', '正在保存文档...')
        await (window as unknown as Window).api.docs.update(editingDoc.id, {
          title: data.title,
          image: data.image,
          summary: data.summary,
          content: data.content,
          tags: data.tags.length > 0 ? JSON.stringify(data.tags) : null
        })
        viewMessage(messageKey, 'success', '文档已更新', 2)
        setEditDocOpen(false)
        setEditingDoc(null)
        loadData()
      } catch (error) {
        console.error('Failed to update doc:', error)
        viewMessage(messageKey, 'error', '保存文档失败')
      }
    },
    [editingDoc, viewMessage, loadData]
  )

  /* ════════════════════════════════════════════════
     Render
     ════════════════════════════════════════════════ */

  if (loading) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: token.colorBgLayout
        }}
      >
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onPaneContextMenu={handlePaneContextMenu}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15}
        maxZoom={3}
        colorMode={isDark ? 'dark' : 'light'}
        style={{ background: token.colorBgLayout }}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color={isDark ? '#3f3f46' : '#d4d4d8'}
        />
        <Controls
          showInteractive={false}
          style={{
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
          }}
        />
        <MiniMap
          nodeStrokeWidth={3}
          pannable
          zoomable
          style={{
            borderRadius: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
          }}
        />
      </ReactFlow>

      <WikiPreviewModal
        wiki={selectedWiki}
        open={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />

      <DocumentPreviewModal
        open={isDocPreviewOpen}
        onCancel={() => setIsDocPreviewOpen(false)}
        currentDoc={selectedDoc}
      />

      <TodoPreviewModal
        open={isTodoPreviewOpen}
        todo={selectedTodo}
        onClose={() => setIsTodoPreviewOpen(false)}
      />

      {/* Context menu overlay */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
            background: token.colorBgElevated,
            borderRadius: token.borderRadiusLG,
            boxShadow: token.boxShadowSecondary,
            padding: '4px 0',
            minWidth: 180,
            border: `1px solid ${token.colorBorderSecondary}`
          }}
        >
          <div
            onClick={() => {
              setContextMenu(null)
              setNewWikiOpen(true)
            }}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 14,
              color: token.colorText,
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = token.colorFillSecondary)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            新建知识库
          </div>
          <div
            onClick={() => {
              setContextMenu(null)
              setNewDocOpen(true)
            }}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 14,
              color: token.colorText,
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = token.colorFillSecondary)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            新建文档
          </div>
          <div
            onClick={() => {
              setContextMenu(null)
              setNewTodoOpen(true)
            }}
            style={{
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 14,
              color: token.colorText,
              transition: 'background 0.15s'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = token.colorFillSecondary)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            新建待办事项
          </div>
        </div>
      )}

      <WikiEditModal
        open={newWikiOpen}
        isNew={true}
        onSave={handleNewWikiSave}
        onCancel={() => setNewWikiOpen(false)}
      />

      <DocumentEditModal
        open={newDocOpen}
        currentDoc={null}
        onClose={() => setNewDocOpen(false)}
        onSave={handleNewDocSave}
      />

      <TodoEditModal
        editModalOpen={false}
        currentTodo={null}
        onEditClose={() => {}}
        onEditSave={async () => {}}
        addModalOpen={newTodoOpen}
        onAddClose={() => setNewTodoOpen(false)}
        onAddSave={handleNewTodoSave}
      />

      {/* Edit Wiki Modal */}
      <WikiEditModal
        open={editWikiOpen}
        isNew={false}
        initialTitle={editingWiki?.title ?? ''}
        initialSummary={editingWiki?.summary ?? ''}
        initialImage={editingWiki?.image ?? null}
        onSave={handleEditWikiSave}
        onCancel={() => {
          setEditWikiOpen(false)
          setEditingWiki(null)
        }}
      />

      {/* Wiki Detail Modal */}
      <Modal
        title="文档归档"
        open={wikiDetailOpen}
        onCancel={() => {
          setWikiDetailOpen(false)
          setDetailWikiId(undefined)
        }}
        footer={null}
        width="90vw"
        centered={true}
        styles={{ body: { padding: 0, height: 'calc(90vh - 110px)' } }}
      >
        <div className="flex flex-row h-full" style={{ height: '100%' }}>
          <WikiDetail
            wiki={wikis.find((w) => w.id === detailWikiId) ?? ({} as WikiRow)}
            onBack={() => {
              setWikiDetailOpen(false)
              setDetailWikiId(undefined)
            }}
            onEditWiki={handleEditWiki}
            showBackButton={false}
          />
        </div>
      </Modal>

      {/* Edit Todo Modal */}
      <TodoEditModal
        editModalOpen={editTodoOpen}
        currentTodo={editingTodo}
        onEditClose={() => {
          setEditTodoOpen(false)
          setEditingTodo(null)
        }}
        onEditSave={handleEditTodoSave}
        addModalOpen={false}
        onAddClose={() => {}}
        onAddSave={async () => {}}
      />

      {/* Edit Doc Modal */}
      <DocumentEditModal
        open={editDocOpen}
        currentDoc={editingDoc}
        onClose={() => {
          setEditDocOpen(false)
          setEditingDoc(null)
        }}
        onSave={handleEditDocSave}
      />
    </div>
  )
}

export default MainContent
