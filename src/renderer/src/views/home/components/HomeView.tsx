import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { theme, Spin, App } from 'antd'
import type { Editor } from '@tiptap/react'
import { Window } from '../../../../resource/types/window'
import { useMessage } from '@renderer/hooks/useMessage'
import type { DocListItem, TodoItem as TodoItemRow, WikiRow } from '@renderer/types/models'
import WikiEditModal from '@renderer/components/wiki/WikiEditModal'
import TodoEditModal from '@renderer/components/todo/TodoEditModal'
import DocTreePanel from './DocTreePanel'
import BreadcrumbBar, { type BreadcrumbItem } from './BreadcrumbBar'
import DocEditorPane, { type DocMeta } from './DocEditorPane'
import TodoPane from './TodoPane'
import EmptyDashboard from './EmptyDashboard'
import OutlinePanel from './OutlinePanel'
import ArchiveDocModal from './ArchiveDocModal'
// 知识图谱按需加载（echarts 体积较大，避免拖慢首屏）
const GraphView = lazy(() => import('@renderer/components/graph/GraphView'))
import type { Selection } from '../types'

const HomeView: React.FC = () => {
  const { token } = theme.useToken()
  const api = (window as unknown as Window).api
  const { viewMessage } = useMessage()
  const { modal } = App.useApp()

  /* ── 数据 ── */
  /** 全部文档（用于树内标题解析与搜索） */
  const [allDocs, setAllDocs] = useState<DocListItem[]>([])
  /** 未归档文档（文档库分区只显示这些） */
  const [standaloneDocs, setStandaloneDocs] = useState<DocListItem[]>([])
  const [todos, setTodos] = useState<TodoItemRow[]>([])
  const [wikis, setWikis] = useState<WikiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [treeRefreshKey, setTreeRefreshKey] = useState(0)

  /* ── 选中状态 ── */
  const [selection, setSelection] = useState<Selection>(null)

  /* ── 右侧面板联动 ── */
  const [docEditor, setDocEditor] = useState<Editor | null>(null)
  const [docMeta, setDocMeta] = useState<DocMeta | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  /* ── 面板宽度（可拖拽） ── */
  const [treeWidth, setTreeWidth] = useState(252)
  const [outlineWidth, setOutlineWidth] = useState(236)
  const dragRef = useRef<{ type: 'tree' | 'outline'; startX: number; startW: number } | null>(null)

  const handleDragStart = useCallback(
    (type: 'tree' | 'outline') =>
      (e: React.MouseEvent): void => {
        e.preventDefault()
        dragRef.current = {
          type,
          startX: e.clientX,
          startW: type === 'tree' ? treeWidth : outlineWidth
        }
        document.body.classList.add('home-resizing')
        const onMove = (ev: MouseEvent): void => {
          const drag = dragRef.current
          if (!drag) return
          const delta = ev.clientX - drag.startX
          if (drag.type === 'tree') {
            setTreeWidth(Math.min(420, Math.max(200, drag.startW + delta)))
          } else {
            setOutlineWidth(Math.min(420, Math.max(180, drag.startW - delta)))
          }
        }
        const onUp = (): void => {
          dragRef.current = null
          document.body.classList.remove('home-resizing')
          window.removeEventListener('mousemove', onMove)
          window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
      },
    [treeWidth, outlineWidth]
  )

  /* ── 新建文档后标题聚焦 ── */
  const [focusTitleDocId, setFocusTitleDocId] = useState<number | null>(null)
  useEffect(() => {
    if (selection?.kind !== 'doc') setFocusTitleDocId(null)
  }, [selection])

  /* ── 弹窗状态 ── */
  const [newWikiOpen, setNewWikiOpen] = useState(false)
  const [newTodoOpen, setNewTodoOpen] = useState(false)
  const [editWiki, setEditWiki] = useState<WikiRow | null>(null)
  const [archiveDoc, setArchiveDoc] = useState<DocListItem | null>(null)

  /* ── 加载数据 ── */
  const loadAll = useCallback(async (): Promise<void> => {
    try {
      // 分页拉全量（修复：此前硬编码 300 条截断,超出部分在树/搜索/仪表盘不可达且无入口）
      const fetchAllDocs = async (excludeWikiId?: number): Promise<DocListItem[]> => {
        const items: DocListItem[] = []
        let page = 1
        for (;;) {
          const result = await api.docs.getAll(page, 500, excludeWikiId)
          items.push(...result.items)
          if (!result.hasMore || page > 200) break
          page += 1
        }
        return items
      }
      const fetchAllWikis = async (): Promise<WikiRow[]> => {
        const items: WikiRow[] = []
        let page = 1
        for (;;) {
          const result = await api.wikis.getAll(page, 500)
          items.push(...result.items)
          if (!result.hasMore || page > 200) break
          page += 1
        }
        return items
      }
      const [allResult, standaloneResult, todoResult, wikiResult] = await Promise.all([
        /* 全部文档：树内标题解析与搜索 */
        fetchAllDocs(),
        /* exclude=-1：只取未归档（未关联任何知识库目录）的文档 */
        fetchAllDocs(-1),
        api.todoItems.getAll(),
        fetchAllWikis()
      ])
      setAllDocs(allResult)
      setStandaloneDocs(standaloneResult)
      setTodos(todoResult)
      setWikis(wikiResult)
    } catch (error) {
      console.error('Failed to load home data:', error)
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    loadAll().then()
  }, [loadAll])

  /* ── 图谱构建完成通知 → 直达该知识库的图谱视图（BuildProgressProvider 派发） ── */
  useEffect(() => {
    const handleOpenGraph = (e: Event): void => {
      const detail = (e as CustomEvent<{ wikiId: number }>).detail
      if (detail && typeof detail.wikiId === 'number') {
        setSelection({ kind: 'wiki-graph', wikiId: detail.wikiId })
      }
    }
    window.addEventListener('open-wiki-graph', handleOpenGraph)
    return () => window.removeEventListener('open-wiki-graph', handleOpenGraph)
  }, [])

  /* ── 工作区切换：清空选中、失效树缓存并重载数据 ── */
  useEffect(() => {
    const handleWorkspaceChanged = (): void => {
      setSelection(null)
      setTreeRefreshKey((k) => k + 1)
      loadAll().then()
    }
    window.addEventListener('workspace-changed', handleWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', handleWorkspaceChanged)
  }, [loadAll])

  /* ── 新建文档：直接创建并打开编辑器（无弹窗，Notion 式交互） ── */
  const handleCreateDoc = useCallback(async (): Promise<void> => {
    const messageKey = 'home-new-doc'
    try {
      viewMessage(messageKey, 'loading', '正在创建文档...')
      const docId = await api.docs.add({
        title: '未命名文档',
        image: null,
        summary: null,
        content: '',
        tags: null
      })
      viewMessage(messageKey, 'success', '文档创建成功', 1)
      await loadAll()
      setSelection({ kind: 'doc', docId })
      setFocusTitleDocId(docId)
    } catch (error) {
      console.error('Failed to create doc:', error)
      viewMessage(messageKey, 'error', '创建文档失败')
    }
  }, [api, viewMessage, loadAll])

  /* ── 在知识库目录中新建文档（直接打开编辑器） ── */
  const handleCreateDocInDirectory = useCallback(
    async (directoryId: number, context?: { wikiId: number; dirName: string }): Promise<void> => {
      const messageKey = 'home-new-doc-dir'
      try {
        viewMessage(messageKey, 'loading', '正在创建文档...')
        const docId = await api.docs.add({
          title: '未命名文档',
          image: null,
          summary: null,
          content: '',
          tags: null
        })
        await api.wikis.addNoteToDirectory(directoryId, docId)
        viewMessage(messageKey, 'success', '文档创建成功', 1)
        await loadAll()
        setTreeRefreshKey((k) => k + 1)
        setSelection({
          kind: 'doc',
          docId,
          source: context
            ? {
                wikiId: context.wikiId,
                dirId: directoryId,
                dirName: context.dirName,
                wikiTitle: wikis.find((w) => w.id === context.wikiId)?.title
              }
            : undefined
        })
        setFocusTitleDocId(docId)
      } catch (error) {
        console.error('Failed to create doc in directory:', error)
        viewMessage(messageKey, 'error', '创建文档失败')
      }
    },
    [api, viewMessage, loadAll, wikis]
  )

  /* ── 从本地文件导入文档到知识库目录 ── */
  const handleImportDocToDirectory = useCallback(
    async (directoryId: number, context?: { wikiId: number; dirName: string }): Promise<void> => {
      const messageKey = 'home-import-doc'
      try {
        const imported = await api.docs.importDocument()
        if (!imported) return // 用户取消文件选择
        viewMessage(messageKey, 'loading', '正在导入文档...')
        const docId = await api.docs.add({
          title: imported.title,
          image: null,
          summary: null,
          content: imported.content,
          tags: null
        })
        await api.wikis.addNoteToDirectory(directoryId, docId)
        viewMessage(messageKey, 'success', '文档导入成功', 2)
        await loadAll()
        setTreeRefreshKey((k) => k + 1)
        setSelection({
          kind: 'doc',
          docId,
          source: context
            ? {
                wikiId: context.wikiId,
                dirId: directoryId,
                dirName: context.dirName,
                wikiTitle: wikis.find((w) => w.id === context.wikiId)?.title
              }
            : undefined
        })
      } catch (error) {
        console.error('Failed to import doc to directory:', error)
        viewMessage(messageKey, 'error', '导入文档失败')
      }
    },
    [api, viewMessage, loadAll, wikis]
  )

  /* ── 新建待办 ── */
  const handleNewTodoSave = useCallback(
    async (values: {
      title: string
      description: string
      due_date: string | null
      priority: number
      category: string | null
    }): Promise<void> => {
      const messageKey = 'home-new-todo'
      try {
        viewMessage(messageKey, 'loading', '正在添加待办事项...')
        const todoId = await api.todoItems.add({
          ...values,
          status: 0,
          due_date: values.due_date ?? null
        })
        viewMessage(messageKey, 'success', '待办事项添加成功', 2)
        setNewTodoOpen(false)
        await loadAll()
        setSelection({ kind: 'todo', todoId })
      } catch (error) {
        console.error('Failed to create todo:', error)
        viewMessage(messageKey, 'error', '添加待办事项失败')
      }
    },
    [api, viewMessage, loadAll]
  )

  /* ── 新建 / 编辑知识库 ── */
  const handleNewWikiSave = useCallback(
    async (data: {
      title: string
      summary: string | null
      tags: string | null
      image: string | null
    }): Promise<void> => {
      const messageKey = 'home-new-wiki'
      try {
        viewMessage(messageKey, 'loading', '正在创建知识库...')
        await api.wikis.add(data)
        viewMessage(messageKey, 'success', '知识库创建成功！', 2)
        setNewWikiOpen(false)
        await loadAll()
      } catch (error) {
        console.error('Failed to create wiki:', error)
        viewMessage(messageKey, 'error', '创建知识库失败')
      }
    },
    [api, viewMessage, loadAll]
  )

  const handleEditWikiSave = useCallback(
    async (data: {
      title: string
      summary: string | null
      tags: string | null
      image: string | null
    }): Promise<void> => {
      if (!editWiki) return
      const messageKey = 'home-edit-wiki'
      try {
        viewMessage(messageKey, 'loading', '正在保存知识库...')
        await api.wikis.update(editWiki.id, data)
        viewMessage(messageKey, 'success', '知识库已更新', 2)
        setEditWiki(null)
        await loadAll()
        setTreeRefreshKey((k) => k + 1)
      } catch (error) {
        console.error('Failed to update wiki:', error)
        viewMessage(messageKey, 'error', '保存知识库失败')
      }
    },
    [api, viewMessage, loadAll, editWiki]
  )

  /* 删除知识库（来自树 ⋯ 菜单） */
  const handleDeleteWiki = useCallback(
    (wiki: WikiRow): void => {
      modal.confirm({
        title: `确定要删除知识库「${wiki.title}」吗？`,
        content: '删除后知识库及其目录结构将被移除，目录中的文档不会被删除。',
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          const messageKey = 'home-delete-wiki'
          try {
            viewMessage(messageKey, 'loading', '正在删除知识库...')
            await api.wikis.delete(wiki.id)
            viewMessage(messageKey, 'success', '知识库已删除', 2)
            /* 若正在查看该知识库的图谱视图（整库或文档子图），删除后回到仪表盘 */
            setSelection((sel) =>
              sel?.kind === 'wiki-graph' && sel.wikiId === wiki.id
                ? null
                : sel?.kind === 'doc-graph' && sel.wikiId === wiki.id
                  ? null
                  : sel
            )
            await loadAll()
            setTreeRefreshKey((k) => k + 1)
          } catch (error) {
            console.error('Failed to delete wiki:', error)
            viewMessage(messageKey, 'error', '删除知识库失败')
          }
        }
      })
    },
    [api, viewMessage, loadAll, modal]
  )

  /* ── 文档保存 / 删除 / 归档 ── */
  const handleDocSaved = useCallback((docId: number, title: string): void => {
    const patch = (d: DocListItem): DocListItem =>
      d.id === docId ? { ...d, title, updated_at: new Date().toISOString() } : d
    setAllDocs((prev) => prev.map(patch))
    setStandaloneDocs((prev) => prev.map(patch))
  }, [])

  /* 删除文档（来自树 ⋯ 菜单） */
  const handleDeleteDoc = useCallback(
    (doc: DocListItem): void => {
      modal.confirm({
        title: `确定要删除文档「${doc.title}」吗？`,
        content: '删除后无法恢复。',
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          const messageKey = 'home-delete-doc'
          try {
            viewMessage(messageKey, 'loading', '正在删除文档...')
            await api.docs.delete(doc.id)
            viewMessage(messageKey, 'success', '文档已删除', 2)
            setSelection((sel) =>
              sel?.kind === 'doc' && sel.docId === doc.id
                ? null
                : sel?.kind === 'doc-graph' && sel.docId === doc.id
                  ? null
                  : sel
            )
            await loadAll()
            setTreeRefreshKey((k) => k + 1)
          } catch (error) {
            console.error('Failed to delete doc:', error)
            viewMessage(messageKey, 'error', '删除文档失败')
          }
        }
      })
    },
    [api, viewMessage, loadAll, modal]
  )

  const handleArchived = useCallback(async (): Promise<void> => {
    await loadAll()
    setTreeRefreshKey((k) => k + 1)
    // 修复：归档正在编辑的文档后,文档从「文档库」分区消失但编辑器仍停留,树中无选中态
    // 且看不到归属——关闭编辑器回到仪表盘
    if (selection?.kind === 'doc') {
      setSelection(null)
    }
  }, [loadAll, selection])

  /* 树内操作改变了文档与目录的关联（删除目录/从目录移除）→ 刷新文档列表 */
  const handleTreeDocsChanged = useCallback((): void => {
    loadAll().then()
  }, [loadAll])

  /* ── 待办变更 ── */
  const handleTodoChanged = useCallback(
    (todo: TodoItemRow | null): void => {
      loadAll().then()
      if (!todo) setSelection(null)
    },
    [loadAll]
  )

  /* ── 面包屑（仅展示路径，点击首页可回到仪表盘） ── */
  const breadcrumbItems = useMemo((): BreadcrumbItem[] => {
    const items: BreadcrumbItem[] = [{ label: '首页', onClick: () => setSelection(null) }]
    if (!selection) return items
    if (selection.kind === 'doc') {
      const doc = allDocs.find((d) => d.id === selection.docId)
      if (selection.source) {
        const wiki = wikis.find((w) => w.id === selection.source?.wikiId)
        items.push({ label: wiki?.title ?? '知识库' })
        if (selection.source.dirId != null) {
          items.push({ label: selection.source.dirName ?? '目录' })
        }
      } else {
        items.push({ label: '文档库' })
      }
      items.push({ label: doc?.title ?? `文档 ${selection.docId}` })
    } else if (selection.kind === 'wiki-graph') {
      const wiki = wikis.find((w) => w.id === selection.wikiId)
      items.push({ label: wiki?.title ?? '知识库' })
      items.push({ label: '知识图谱' })
    } else if (selection.kind === 'doc-graph') {
      const wiki = wikis.find((w) => w.id === selection.wikiId)
      const doc = allDocs.find((d) => d.id === selection.docId)
      items.push({ label: wiki?.title ?? '知识库' })
      items.push({ label: doc?.title ?? `文档 ${selection.docId}` })
      items.push({ label: '知识图谱' })
    } else {
      const todo = todos.find((t) => t.id === selection.todoId)
      items.push({ label: '待办' })
      items.push({ label: todo?.title ?? `待办 ${selection.todoId}` })
    }
    return items
  }, [selection, allDocs, todos, wikis])

  /* ── 中间主区内容 ── */
  const renderCenter = (): React.ReactNode => {
    if (loading) {
      return (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Spin size="large" />
        </div>
      )
    }
    if (!selection) {
      return (
        <EmptyDashboard
          docs={standaloneDocs}
          todos={todos}
          wikis={wikis}
          onOpenDoc={(docId) => setSelection({ kind: 'doc', docId })}
          onOpenTodo={(todoId) => setSelection({ kind: 'todo', todoId })}
          onCreateDoc={handleCreateDoc}
          onCreateTodo={() => setNewTodoOpen(true)}
          onCreateWiki={() => setNewWikiOpen(true)}
        />
      )
    }
    if (selection.kind === 'doc') {
      return (
        <DocEditorPane
          key={selection.docId}
          docId={selection.docId}
          onSaved={handleDocSaved}
          onMetaChange={setDocMeta}
          onEditorReady={setDocEditor}
          scrollRef={scrollRef}
          autofocusTitle={focusTitleDocId === selection.docId}
        />
      )
    }
    if (selection.kind === 'wiki-graph' || selection.kind === 'doc-graph') {
      const wiki = wikis.find((w) => w.id === selection.wikiId)
      if (!wiki) {
        return (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <span style={{ color: token.colorTextTertiary, fontSize: 13 }}>
              知识库不存在或已被删除
            </span>
          </div>
        )
      }
      /* 文档级子图：带 initialDocFilter，key 用 docId 保证切换文档时重建筛选 */
      return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <Suspense
            fallback={
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Spin size="small" />
              </div>
            }
          >
            <GraphView
              key={
                selection.kind === 'doc-graph'
                  ? `doc-graph-${selection.docId}`
                  : `wiki-graph-${selection.wikiId}`
              }
              selectedWiki={wiki}
              initialDocFilter={selection.kind === 'doc-graph' ? [selection.docId] : undefined}
              onOpenDocInEditor={(docId) =>
                setSelection({
                  kind: 'doc',
                  docId,
                  source: { wikiId: wiki.id, wikiTitle: wiki.title }
                })
              }
            />
          </Suspense>
        </div>
      )
    }
    return (
      <TodoPane key={selection.todoId} todoId={selection.todoId} onChanged={handleTodoChanged} />
    )
  }

  /* ── 无卡片外壳的视图：首页仪表盘与知识图谱，与左右侧栏融为一体（无边框、无圆角） ── */
  const frameless = !selection || selection.kind === 'wiki-graph' || selection.kind === 'doc-graph'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: token.colorBgLayout,
        boxSizing: 'border-box',
        minHeight: 0
      }}
    >
      {/* 左侧文档树（可拖拽调宽） */}
      <DocTreePanel
        width={treeWidth}
        docs={standaloneDocs}
        allDocs={allDocs}
        todos={todos}
        wikis={wikis}
        selection={selection}
        onSelect={setSelection}
        onCreateDoc={handleCreateDoc}
        onCreateTodo={() => setNewTodoOpen(true)}
        onCreateWiki={() => setNewWikiOpen(true)}
        onEditWiki={setEditWiki}
        onDeleteWiki={handleDeleteWiki}
        onOpenGraph={(wiki) => setSelection({ kind: 'wiki-graph', wikiId: wiki.id })}
        onOpenDocGraph={(wikiId, docId) => setSelection({ kind: 'doc-graph', wikiId, docId })}
        onDeleteDoc={handleDeleteDoc}
        onArchiveDoc={setArchiveDoc}
        onCreateDocInDirectory={handleCreateDocInDirectory}
        onImportDocToDirectory={handleImportDocToDirectory}
        onDocsChanged={handleTreeDocsChanged}
        refreshKey={treeRefreshKey}
      />
      <div className="home-col-resizer" onMouseDown={handleDragStart('tree')} />

      {/* 中间主区：整体一张卡片（面包屑 + 内容），参考 Chat 主区结构。
          首页仪表盘与知识图谱视图无卡片外壳（无边框、无圆角），与左右侧栏融为一体；
          文档/待办等具体内容才是独立卡片（有边框、有圆角） */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          background: token.colorBgContainer,
          border: frameless ? 'none' : `1px solid ${token.colorBorderSecondary}`,
          borderRadius: frameless ? 0 : 12,
          overflow: 'hidden'
        }}
      >
        <BreadcrumbBar items={breadcrumbItems} />
        {renderCenter()}
      </div>

      {/* 右侧大纲 / 属性（编辑器就绪后才挂载，key 保证每次切换文档重建订阅） */}
      {selection?.kind === 'doc' && docEditor && (
        <>
          <div className="home-col-resizer" onMouseDown={handleDragStart('outline')} />
          <OutlinePanel
            key={selection.docId}
            width={outlineWidth}
            editor={docEditor}
            scrollRef={scrollRef}
            meta={docMeta ?? undefined}
          />
        </>
      )}

      {/* ── 弹窗 ── */}
      <WikiEditModal
        open={newWikiOpen}
        isNew={true}
        onSave={handleNewWikiSave}
        onCancel={() => setNewWikiOpen(false)}
      />

      <WikiEditModal
        open={editWiki !== null}
        isNew={false}
        initialTitle={editWiki?.title ?? ''}
        initialSummary={editWiki?.summary ?? ''}
        initialTags={editWiki?.tags ?? ''}
        initialImage={editWiki?.image ?? null}
        onSave={handleEditWikiSave}
        onCancel={() => setEditWiki(null)}
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

      <ArchiveDocModal
        open={archiveDoc !== null}
        doc={archiveDoc}
        wikis={wikis}
        onArchived={handleArchived}
        onClose={() => setArchiveDoc(null)}
      />
    </div>
  )
}

export default HomeView
