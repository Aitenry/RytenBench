import React, { useEffect, useState, useCallback, useRef } from 'react'
import { theme, Spin } from 'antd'
import Toolbar from './components/Toolbar'
import TaskTree from './components/TaskTree'
import GanttChart from './components/GanttChart'
import AddTaskModal from './components/TaskModal'
import type { PlannerTreeNode } from '@renderer/types/planner'

const Index: React.FC = () => {
  const {
    token: { colorBgContainer }
  } = theme.useToken()

  const [tree, setTree] = useState<PlannerTreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set())
  const [viewMode, setViewMode] = useState<'list' | 'gantt'>('gantt')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addParentId, setAddParentId] = useState<number | null>(null)
  const [editingTask, setEditingTask] = useState<PlannerTreeNode | null>(null)

  const treeScrollRef = useRef<HTMLDivElement | null>(null)
  const ganttRef = useRef<HTMLDivElement | null>(null)

  const loadTree = useCallback(async () => {
    const data = await window.api.planner.tasks.getTree()
    setTree(data)
    return data
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const data = await window.api.planner.tasks.getTree()
        setTree(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // 工作区切换：重新加载任务树，并清空旧工作区的选中/折叠状态
  useEffect(() => {
    const handleWorkspaceChanged = (): void => {
      setSelectedId(null)
      setCollapsedIds(new Set())
      loadTree().catch(console.error)
    }
    window.addEventListener('workspace-changed', handleWorkspaceChanged)
    return () => window.removeEventListener('workspace-changed', handleWorkspaceChanged)
  }, [loadTree])

  const handleToggleCollapse = useCallback((id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleSelect = useCallback((id: number) => {
    setSelectedId((prev) => (prev === id ? null : id))
  }, [])

  const handleOpenAddModal = useCallback((parentId: number | null, editTask?: PlannerTreeNode) => {
    setAddParentId(parentId)
    setEditingTask(editTask ?? null)
    setAddModalOpen(true)
  }, [])

  const handleAddTask = useCallback(
    async (
      values: {
        title: string
        type: string
        progress: number
        work_hours: number
        priority: number
        start_date: string | null
        end_date: string | null
      },
      editId: number | null
    ) => {
      if (editId !== null) {
        await window.api.planner.tasks.update(editId, values)
      } else {
        await window.api.planner.tasks.add({
          ...values,
          parent_id: addParentId,
          sort_order: 0
        })
      }
      setAddModalOpen(false)
      setEditingTask(null)
      await loadTree()
    },
    [addParentId, loadTree]
  )

  const handleDeleteTask = useCallback(
    async (id: number) => {
      await window.api.planner.tasks.delete(id)
      if (selectedId === id) setSelectedId(null)
      await loadTree()
    },
    [selectedId, loadTree]
  )

  if (loading) {
    return (
      <div className="h-full flex-1 flex items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div
      className="h-full flex-1 flex flex-col overflow-hidden"
      style={{ background: colorBgContainer }}
    >
      {/* 顶部工具栏 */}
      <Toolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onAddTask={() => handleOpenAddModal(null)}
      />

      {/* 主体区域：树 + 甘特图 */}
      <div className="flex-1 flex flex-row overflow-hidden">
        {/* 左侧任务树 */}
        <TaskTree
          tree={tree}
          selectedId={selectedId}
          collapsedIds={collapsedIds}
          onSelect={handleSelect}
          onToggleCollapse={handleToggleCollapse}
          scrollRef={treeScrollRef}
          onAddTask={handleOpenAddModal}
          onDeleteTask={handleDeleteTask}
          onEditTask={(task) => handleOpenAddModal(task.parent_id, task)}
        />

        {/* 中间甘特图 */}
        <GanttChart
          tree={tree}
          selectedId={selectedId}
          collapsedIds={collapsedIds}
          onSelect={handleSelect}
          ganttRef={ganttRef}
          treeScrollRef={treeScrollRef}
        />
      </div>

      {/* 添加任务弹窗 */}
      <AddTaskModal
        open={addModalOpen}
        parentId={addParentId}
        editTask={editingTask}
        tree={tree}
        onOk={handleAddTask}
        onCancel={() => {
          setAddModalOpen(false)
          setEditingTask(null)
        }}
      />
    </div>
  )
}

export default Index
