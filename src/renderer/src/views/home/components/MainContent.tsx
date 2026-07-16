import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Spin, theme, Modal } from 'antd'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  type Node,
  type OnNodeDrag
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
  WikiDirectoryRow,
  DocListItem,
  DocItem as DocItemType,
  TodoItem as TodoItemRow
} from '@renderer/types/models'

import { useThemePalette } from '../hooks/useThemePalette'
import {
  WIKI_POSITIONS,
  TODO_POSITIONS,
  DOC_POSITIONS,
  getPositionForIndex
} from '../utils/canvasConstants'
import { nodeTypes } from './nodeTypes'
import CanvasContextMenu from './CanvasContextMenu'
import type { WikiNodeData } from './nodes/WikiNode'
import type { TodoNodeData } from './nodes/TodoNode'
import type { DocNodeData } from './nodes/DocNode'

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

  /* ── saved node positions from DB ── */
  const savedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  /* ── pagination state ── */
  const wikiPageRef = useRef(1)
  const todoPageRef = useRef(1)
  const docPageRef = useRef(1)
  const wikiHasMoreRef = useRef(true)
  const todoHasMoreRef = useRef(true)
  const docHasMoreRef = useRef(true)
  const loadingMoreRef = useRef(false)
  const bottomNodeYRef = useRef(0)

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
  const [wikiDetailKey, setWikiDetailKey] = useState(0)
  const [editTodoOpen, setEditTodoOpen] = useState(false)
  const [editingTodo, setEditingTodo] = useState<TodoItemRow | null>(null)
  const [editDocOpen, setEditDocOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<DocItemType | null>(null)

  /* ── doc archive modal state ── */
  const [docArchiveOpen, setDocArchiveOpen] = useState(false)
  const [archivingDoc, setArchivingDoc] = useState<DocListItem | null>(null)
  const [archiveWikis, setArchiveWikis] = useState<WikiRow[]>([])
  const [archiveDirectories, setArchiveDirectories] = useState<WikiDirectoryRow[]>([])
  const [archiveSelectedWikiId, setArchiveSelectedWikiId] = useState<number | null>(null)

  /* ── doc removed from wiki → add back to canvas ── */
  const handleDocRemovedFromWiki = useCallback(async (docId: number): Promise<void> => {
    try {
      const doc = await (window as unknown as Window).api.docs.getById(docId)
      if (doc) {
        setDocs((prev) => {
          if (prev.some((d) => d.id === doc.id)) return prev
          return [doc, ...prev]
        })
      }
    } catch (error) {
      console.error('Failed to load removed doc:', error)
    }
  }, [])

  /* ── fetch initial data ── */
  const loadInitialData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [wikiResult, todoResult, docResult, positionsResult] = await Promise.all([
        (window as unknown as Window).api.wikis.getAll(1, 10),
        (window as unknown as Window).api.todoItems.getAllPaginated(1, 10),
        (window as unknown as Window).api.docs.getAll(1, 10, -1),
        (window as unknown as Window).api.nodePositions.getAll()
      ])
      setWikis(wikiResult.items)
      setTodos(todoResult.items)
      setDocs(docResult.items)
      wikiPageRef.current = 1
      todoPageRef.current = 1
      docPageRef.current = 1
      wikiHasMoreRef.current = wikiResult.hasMore
      todoHasMoreRef.current = todoResult.hasMore
      docHasMoreRef.current = docResult.hasMore

      const posMap = new Map<string, { x: number; y: number }>()
      for (const p of positionsResult) {
        posMap.set(p.node_id, { x: p.x, y: p.y })
      }
      savedPositionsRef.current = posMap
    } catch (error) {
      console.error('Failed to load canvas data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInitialData().then()
  }, [loadInitialData])

  /* ── load next page for all types that still have more ── */
  const loadMoreData = useCallback(async () => {
    if (loadingMoreRef.current) return
    const hasMore = wikiHasMoreRef.current || todoHasMoreRef.current || docHasMoreRef.current
    if (!hasMore) return

    loadingMoreRef.current = true
    try {
      const promises: Promise<void>[] = []

      if (wikiHasMoreRef.current) {
        wikiPageRef.current++
        promises.push(
          (window as unknown as Window).api.wikis.getAll(wikiPageRef.current, 10).then((result) => {
            wikiHasMoreRef.current = result.hasMore
            setWikis((prev) => [...prev, ...result.items])
          })
        )
      }
      if (todoHasMoreRef.current) {
        todoPageRef.current++
        promises.push(
          (window as unknown as Window).api.todoItems
            .getAllPaginated(todoPageRef.current, 10)
            .then((result) => {
              todoHasMoreRef.current = result.hasMore
              setTodos((prev) => [...prev, ...result.items])
            })
        )
      }
      if (docHasMoreRef.current) {
        docPageRef.current++
        promises.push(
          (window as unknown as Window).api.docs
            .getAll(docPageRef.current, 10, -1)
            .then((result) => {
              docHasMoreRef.current = result.hasMore
              setDocs((prev) => [...prev, ...result.items])
            })
        )
      }

      await Promise.all(promises)
    } catch (error) {
      console.error('Failed to load more canvas data:', error)
    } finally {
      loadingMoreRef.current = false
    }
  }, [])

  /* ── detect canvas pan approaching bottom edge → load more ── */
  const handleMoveEnd = useCallback(
    (
      _event: React.MouseEvent | MouseEvent | TouchEvent | null,
      viewport: { x: number; y: number; zoom: number }
    ) => {
      if (!viewport) return
      const canvasBottomY = (-viewport.y + window.innerHeight) / viewport.zoom
      if (canvasBottomY > bottomNodeYRef.current - 600) {
        loadMoreData().then()
      }
    },
    [loadMoreData]
  )

  /* ── build nodes from data whenever data or palette changes ── */

  useEffect(() => {
    const savedPositions = savedPositionsRef.current

    const wikiNodes: Node<WikiNodeData>[] = wikis.map((wiki, i) => ({
      id: `wiki-${wiki.id}`,
      type: 'wiki',
      position: savedPositions.get(`wiki-${wiki.id}`) ?? getPositionForIndex(WIKI_POSITIONS, i),
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
      position: savedPositions.get(`todo-${todo.id}`) ?? getPositionForIndex(TODO_POSITIONS, i),
      data: {
        todo,
        palette,
        colorIndex: i,
        onOpen: handleOpenTodoPreview,
        onEdit: handleEditTodo,
        onToggleInProgress: handleToggleInProgress,
        onToggleComplete: handleToggleComplete,
        onDelete: handleDeleteTodo
      }
    }))

    const docNodes: Node<DocNodeData>[] = docs.map((doc, i) => ({
      id: `doc-${doc.id}`,
      type: 'doc',
      position: savedPositions.get(`doc-${doc.id}`) ?? getPositionForIndex(DOC_POSITIONS, i),
      data: {
        doc,
        palette,
        onOpen: handleOpenDocPreview,
        onEdit: handleEditDoc,
        onDelete: handleDeleteDoc,
        onArchive: handleOpenDocArchive
      }
    }))

    const allNodes = [...wikiNodes, ...todoNodes, ...docNodes]
    if (allNodes.length > 0) {
      bottomNodeYRef.current = Math.max(...allNodes.map((n) => n.position.y)) + 200
    }
    setNodes(allNodes)
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
      tags: string | null
      image: string | null
    }): Promise<void> => {
      const messageKey = 'canvas-new-wiki'
      try {
        viewMessage(messageKey, 'loading', '正在创建知识库...')
        await (window as unknown as Window).api.wikis.add(data)
        viewMessage(messageKey, 'success', '知识库创建成功！', 2)
        setNewWikiOpen(false)
        await loadInitialData(false)
      } catch (error) {
        console.error('Failed to create wiki:', error)
        viewMessage(messageKey, 'error', '创建知识库失败')
      }
    },
    [viewMessage, loadInitialData]
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
        await loadInitialData(false)
      } catch (error) {
        console.error('Failed to create doc:', error)
        viewMessage(messageKey, 'error', '创建文档失败')
      }
    },
    [viewMessage, loadInitialData]
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
        await loadInitialData(false)
      } catch (error) {
        console.error('Failed to create todo:', error)
        viewMessage(messageKey, 'error', '添加待办事项失败')
      }
    },
    [viewMessage, loadInitialData]
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
      tags: string | null
      image: string | null
    }): Promise<void> => {
      if (!editingWiki) return
      const messageKey = 'canvas-edit-wiki'
      try {
        viewMessage(messageKey, 'loading', '正在保存知识库...')
        await (window as unknown as Window).api.wikis.update(editingWiki.id, {
          title: data.title,
          summary: data.summary,
          tags: data.tags,
          image: data.image
        })
        viewMessage(messageKey, 'success', '知识库已更新', 2)
        setEditWikiOpen(false)
        setEditingWiki(null)
        await loadInitialData(false)
      } catch (error) {
        console.error('Failed to update wiki:', error)
        viewMessage(messageKey, 'error', '保存知识库失败')
      }
    },
    [editingWiki, viewMessage, loadInitialData]
  )

  const handleOpenWikiDetail = useCallback((wiki: WikiRow): void => {
    setDetailWikiId(wiki.id)
    setWikiDetailKey((prev) => prev + 1)
    setWikiDetailOpen(true)
  }, [])

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
        await loadInitialData(false)
      } catch (error) {
        console.error('Failed to update todo:', error)
        viewMessage(messageKey, 'error', '保存待办事项失败')
      }
    },
    [editingTodo, viewMessage, loadInitialData]
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
        await loadInitialData(false)
      } catch (error) {
        console.error('Failed to update doc:', error)
        viewMessage(messageKey, 'error', '保存文档失败')
      }
    },
    [editingDoc, viewMessage, loadInitialData]
  )

  /* ── todo status & delete handlers ── */

  const handleToggleInProgress = useCallback(
    async (todo: TodoItemRow): Promise<void> => {
      if (todo.status === 1) {
        viewMessage('todo-in-progress', 'warning', '进行中的任务只能标记为完成，不能退回待办状态')
        return
      }
      const messageKey = 'canvas-todo-progress'
      try {
        viewMessage(messageKey, 'loading', '正在更新状态...')
        await (window as unknown as Window).api.todoItems.update(todo.id, { status: 1 })
        viewMessage(messageKey, 'success', '已标记为进行中', 2)
        await loadInitialData(false)
      } catch (error) {
        console.error('Failed to update todo progress:', error)
        viewMessage(messageKey, 'error', '更新状态失败')
      }
    },
    [viewMessage, loadInitialData]
  )

  const handleToggleComplete = useCallback(
    async (todo: TodoItemRow): Promise<void> => {
      const newStatus = todo.status === 2 ? 0 : 2
      const messageKey = 'canvas-todo-complete'
      try {
        viewMessage(messageKey, 'loading', '正在更新状态...')
        await (window as unknown as Window).api.todoItems.update(todo.id, { status: newStatus })
        viewMessage(
          messageKey,
          'success',
          `待办事项已${todo.status === 2 ? '重新激活' : '标记为完成'}`,
          2
        )
        await loadInitialData(false)
      } catch (error) {
        console.error('Failed to update todo completion:', error)
        viewMessage(messageKey, 'error', '更新状态失败')
      }
    },
    [viewMessage, loadInitialData]
  )

  const handleDeleteTodo = useCallback(
    async (todo: TodoItemRow): Promise<void> => {
      const messageKey = 'canvas-todo-delete'
      try {
        viewMessage(messageKey, 'loading', '正在删除...')
        await (window as unknown as Window).api.todoItems.delete(todo.id)
        viewMessage(messageKey, 'success', '已删除', 2)
        await loadInitialData(false)
      } catch (error) {
        console.error('Failed to delete todo:', error)
        viewMessage(messageKey, 'error', '删除失败')
      }
    },
    [viewMessage, loadInitialData]
  )

  /* ── doc delete & archive handlers ── */

  const handleDeleteDoc = useCallback(
    async (doc: DocListItem): Promise<void> => {
      const messageKey = 'canvas-doc-delete'
      try {
        viewMessage(messageKey, 'loading', '正在删除文档...')
        await (window as unknown as Window).api.docs.delete(doc.id)
        viewMessage(messageKey, 'success', '文档已删除', 2)
        setDocs((prev) => prev.filter((d) => d.id !== doc.id))
      } catch (error) {
        console.error('Failed to delete doc:', error)
        viewMessage(messageKey, 'error', '删除文档失败')
      }
    },
    [viewMessage]
  )

  const handleOpenDocArchive = useCallback(async (doc: DocListItem): Promise<void> => {
    setArchivingDoc(doc)
    setArchiveSelectedWikiId(null)
    setArchiveDirectories([])
    try {
      const result = await (window as unknown as Window).api.wikis.getAll(1, 100)
      setArchiveWikis(result.items)
    } catch (error) {
      console.error('Failed to load wikis:', error)
    }
    setDocArchiveOpen(true)
  }, [])

  const handleSelectArchiveWiki = useCallback(async (wikiId: number): Promise<void> => {
    setArchiveSelectedWikiId(wikiId)
    try {
      const dirs = await (window as unknown as Window).api.wikis.getDirectories(wikiId)
      setArchiveDirectories(dirs)
    } catch (error) {
      console.error('Failed to load directories:', error)
    }
  }, [])

  const handleArchiveDocToDirectory = useCallback(
    async (directoryId: number): Promise<void> => {
      if (!archivingDoc) return
      const messageKey = 'canvas-doc-archive'
      try {
        viewMessage(messageKey, 'loading', '正在归档文档...')
        await (window as unknown as Window).api.wikis.addNoteToDirectory(
          directoryId,
          archivingDoc.id
        )
        viewMessage(messageKey, 'success', '文档归档成功！', 2)
        setDocArchiveOpen(false)
        setDocs((prev) => prev.filter((d) => d.id !== archivingDoc.id))
        setArchivingDoc(null)
      } catch (error) {
        console.error('Failed to archive doc:', error)
        viewMessage(messageKey, 'error', '归档文档失败')
      }
    },
    [archivingDoc, viewMessage]
  )

  /* ── node drag stop: save position to DB ── */

  const handleNodeDragStop: OnNodeDrag = useCallback((_event, node) => {
    const nodeId = node.id
    const x = node.position.x
    const y = node.position.y
    ;(window as unknown as Window).api.nodePositions
      .save(nodeId, x, y)
      .catch((err) => console.error('Failed to save node position:', err))
  }, [])

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
        onNodeDragStop={handleNodeDragStop}
        onPaneContextMenu={handlePaneContextMenu}
        onMoveEnd={handleMoveEnd}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15}
        maxZoom={3}
        colorMode={isDark ? 'dark' : 'light'}
        proOptions={{ hideAttribution: true }}
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
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onNewDoc={() => setNewDocOpen(true)}
          onNewWiki={() => setNewWikiOpen(true)}
          onNewTodo={() => setNewTodoOpen(true)}
        />
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
        initialTags={editingWiki?.tags ?? ''}
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
        width="calc(100vw - 60px)"
        centered={true}
        styles={{ body: { padding: 0, height: 'calc(100vh - 130px)' } }}
      >
        <div className="flex flex-row h-full" style={{ height: '100%' }}>
          <WikiDetail
            key={`${detailWikiId}-${wikiDetailKey}`}
            wiki={wikis.find((w) => w.id === detailWikiId) ?? ({} as WikiRow)}
            onEditWiki={handleEditWiki}
            onDocRemoved={handleDocRemovedFromWiki}
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

      {/* Doc Archive Modal */}
      <Modal
        title={`归档「${archivingDoc?.title ?? ''}」到知识库目录`}
        open={docArchiveOpen}
        onCancel={() => {
          setDocArchiveOpen(false)
          setArchivingDoc(null)
        }}
        footer={null}
        width={420}
      >
        <div style={{ display: 'flex', gap: 12, height: 300 }}>
          <div
            style={{ flex: 1, overflow: 'auto', borderRight: '1px solid #f0f0f0', paddingRight: 8 }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>选择知识库</div>
            {archiveWikis.map((wiki) => (
              <div
                key={wiki.id}
                onClick={() => handleSelectArchiveWiki(wiki.id)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  marginBottom: 4,
                  background: archiveSelectedWikiId === wiki.id ? '#e6f4ff' : 'transparent',
                  color: archiveSelectedWikiId === wiki.id ? '#1677ff' : 'inherit'
                }}
              >
                {wiki.title}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>选择目录</div>
            {!archiveSelectedWikiId ? (
              <div style={{ color: '#999', fontSize: 13 }}>请先选择知识库</div>
            ) : archiveDirectories.length === 0 ? (
              <div style={{ color: '#999', fontSize: 13 }}>该知识库暂无目录</div>
            ) : (
              archiveDirectories.map((dir) => (
                <div
                  key={dir.id}
                  onClick={() => handleArchiveDocToDirectory(dir.id)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    marginBottom: 4,
                    background: 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f5f5f5'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {dir.name}
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default MainContent
