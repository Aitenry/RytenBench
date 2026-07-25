import React, { useCallback, useState } from 'react'
import { Button, Modal, Tooltip, theme } from 'antd'
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiAddLine,
  RiDeleteBinLine,
  RiEditLine
} from '@remixicon/react'
import { type PlannerTreeNode, PRIORITY_MAP } from '@renderer/types/planner'

interface Props {
  tree: PlannerTreeNode[]
  selectedId: number | null
  collapsedIds: Set<number>
  onSelect: (id: number) => void
  onToggleCollapse: (id: number) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  onAddTask: (parentId: number | null) => void
  onDeleteTask: (id: number) => void
  onEditTask: (task: PlannerTreeNode) => void
}

const TaskTree: React.FC<Props> = ({
  tree,
  selectedId,
  collapsedIds,
  onSelect,
  onToggleCollapse,
  scrollRef,
  onAddTask,
  onDeleteTask,
  onEditTask
}) => {
  const [hoveredId, setHoveredId] = useState<number | null>(null)
  const { token } = theme.useToken()

  const renderRow = useCallback(
    (node: PlannerTreeNode, numberPath: number[]): React.ReactNode => {
      const isCollapsed = collapsedIds.has(node.id)
      const isSelected = selectedId === node.id
      const hasChildren = node.children.length > 0
      const indent = node.depth * 20
      const isHovered = hoveredId === node.id
      const numberStr = numberPath.join('.')
      const priorityInfo = PRIORITY_MAP[node.priority ?? 4] ?? PRIORITY_MAP[4]
      const canAddChild = node.type !== 'task'

      const rows: React.ReactNode[] = [
        <div
          key={node.id}
          className="flex items-center cursor-pointer select-none shrink-0 relative group"
          style={{
            height: 36,
            paddingLeft: 8 + indent,
            paddingRight: 2,
            color: token.colorText,
            background: isSelected ? token.colorPrimaryBg : 'transparent',
            borderBottom: `1px solid ${token.colorBorderSecondary}`
          }}
          onClick={() => onSelect(node.id)}
          onMouseEnter={() => setHoveredId(node.id)}
          onMouseLeave={() => setHoveredId((prev) => (prev === node.id ? null : prev))}
        >
          {/* 折叠图标 */}
          <span
            className="flex items-center justify-center shrink-0"
            style={{ width: 18, height: 18, cursor: hasChildren ? 'pointer' : 'default' }}
            onClick={(e) => {
              if (hasChildren) {
                e.stopPropagation()
                onToggleCollapse(node.id)
              }
            }}
          >
            {hasChildren &&
              (isCollapsed ? (
                <RiArrowRightSLine size={14} color={token.colorTextTertiary} />
              ) : (
                <RiArrowDownSLine size={14} color={token.colorTextTertiary} />
              ))}
          </span>

          {/* 序号 */}
          <span
            className="shrink-0 text-xs mr-2"
            style={{ color: token.colorTextTertiary, textAlign: 'right', flexShrink: 0 }}
          >
            {numberStr}
          </span>

          {/* 任务名称 */}
          <div
            style={{ flex: '0 0 120px', display: 'flex', alignItems: 'center', maxWidth: 120 }}
            title={node.title}
          >
            <span className="truncate font-semibold text-sm"> {node.title} </span>
            {/* 优先级标签 */}
            <span
              className="mr-2"
              style={{
                color: priorityInfo.hex,
                fontWeight: 600,
                padding: '0 3px',
                borderRadius: 3,
                marginLeft: 3,
                fontSize: 10,
                background: priorityInfo.rgba,
                lineHeight: '14px'
              }}
            >
              {priorityInfo.label}
            </span>
          </div>

          {/* 工时 */}
          {!isHovered && (
            <span
              className="shrink-0 text-xs ml-auto"
              style={{ width: 48, textAlign: 'right', color: token.colorTextSecondary }}
            >
              {node.work_hours}h
            </span>
          )}

          {/* hover 时显示操作按钮 */}
          {isHovered && (
            <span
              className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 shrink-0"
              style={{
                background: isSelected ? token.colorPrimaryBg : token.colorBgContainer,
                paddingLeft: 4,
                borderRadius: 4
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {canAddChild && (
                <Tooltip title="添加子任务">
                  <Button
                    type="text"
                    size="small"
                    icon={<RiAddLine size={12} />}
                    style={{ width: 20, height: 20, padding: 0 }}
                    onClick={() => onAddTask(node.id)}
                  />
                </Tooltip>
              )}
              <Tooltip title="编辑">
                <Button
                  type="text"
                  size="small"
                  icon={<RiEditLine size={12} />}
                  style={{ width: 20, height: 20, padding: 0 }}
                  onClick={() => onEditTask(node)}
                />
              </Tooltip>
              <Tooltip title="删除">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<RiDeleteBinLine size={12} />}
                  style={{ width: 20, height: 20, padding: 0 }}
                  onClick={() => {
                    Modal.confirm({
                      title: '删除任务',
                      content: `确定删除「${node.title}」及其所有子任务吗？`,
                      okText: '删除',
                      cancelText: '取消',
                      okButtonProps: { danger: true },
                      onOk: () => onDeleteTask(node.id)
                    })
                  }}
                />
              </Tooltip>
            </span>
          )}
        </div>
      ]

      // 子节点（展开状态）
      if (hasChildren && !isCollapsed) {
        node.children.forEach((child, childIdx) => {
          const childRows = renderRow(child, [...numberPath, childIdx + 1])
          if (Array.isArray(childRows)) {
            rows.push(...childRows)
          } else {
            rows.push(childRows)
          }
        })
      }

      return rows
    },
    [
      collapsedIds,
      selectedId,
      hoveredId,
      token,
      onSelect,
      onToggleCollapse,
      onAddTask,
      onDeleteTask,
      onEditTask
    ]
  )

  const allRows: React.ReactNode[] = []
  tree.forEach((node, i) => {
    const r = renderRow(node, [i + 1])
    if (Array.isArray(r)) {
      allRows.push(...r)
    } else {
      allRows.push(r)
    }
  })

  return (
    <div
      className="flex flex-col shrink-0 overflow-hidden"
      style={{
        width: 300,
        borderRight: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgLayout
      }}
    >
      {/* 表头 + 添加按钮 */}
      <div
        className="flex items-center shrink-0 px-2 text-xs font-semibold"
        style={{
          height: 36,
          borderBottom: `2px solid ${token.colorBorderSecondary}`,
          color: token.colorTextSecondary
        }}
      >
        <span style={{ width: 18 }} />
        <span className="shrink-0" style={{ textAlign: 'right' }}>
          #
        </span>
        <span style={{ flex: '0 0 120px' }}>任务名称</span>
        <span className="ml-auto mr-2" style={{ width: 48, textAlign: 'right' }}>
          工时
        </span>
      </div>

      {/* 列表 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {allRows.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full gap-2"
            style={{ color: token.colorTextTertiary }}
          >
            <span className="text-sm">暂无任务</span>
            <Button type="link" size="small" onClick={() => onAddTask(null)}>
              创建第一个任务
            </Button>
          </div>
        ) : (
          allRows
        )}
      </div>
    </div>
  )
}

export default TaskTree
