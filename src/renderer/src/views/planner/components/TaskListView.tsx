import React, { useState } from 'react'
import { theme, Button, Tooltip, App } from 'antd'
import {
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiAddLine,
  RiDeleteBinLine,
  RiEditLine,
  RiLink
} from '@remixicon/react'
import { type PlannerTreeNode, PRIORITY_MAP } from '@renderer/types/planner'

const TYPE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  project: { label: '项目', color: '#1677ff', bg: 'rgba(22,119,255,0.12)' },
  phase: { label: '阶段', color: '#722ed1', bg: 'rgba(114,46,209,0.12)' },
  task: { label: '任务', color: '#52c41a', bg: 'rgba(82,196,26,0.12)' }
}

interface Props {
  tree: PlannerTreeNode[]
  selectedId: number | null
  collapsedIds: Set<number>
  onSelect: (id: number) => void
  onToggleCollapse: (id: number) => void
  onAddTask: (parentId: number | null) => void
  onDeleteTask: (id: number) => void
  onEditTask: (task: PlannerTreeNode) => void
}

/** 列表视图：完整字段的任务清单（名称/类型/进度/工时/优先级/日期/依赖/操作） */
const TaskListView: React.FC<Props> = ({
  tree,
  selectedId,
  collapsedIds,
  onSelect,
  onToggleCollapse,
  onAddTask,
  onDeleteTask,
  onEditTask
}) => {
  const { token } = theme.useToken()
  const { modal } = App.useApp()
  const [hoveredId, setHoveredId] = useState<number | null>(null)

  const cellStyle = (width: number, right = false): React.CSSProperties => ({
    width,
    flexShrink: 0,
    textAlign: right ? 'right' : 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  })

  /* PGLite 时间字段运行时可能是 Date/数字，统一转 MM/DD */
  const formatDate = (d: unknown): string => {
    if (d == null) return '—'
    const dt = new Date(d as string | number | Date)
    if (Number.isNaN(dt.getTime())) return '—'
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    return `${mm}/${dd}`
  }

  const rows: React.ReactNode[] = []

  const renderNode = (node: PlannerTreeNode, numberPath: number[], depth: number): void => {
    const isCollapsed = collapsedIds.has(node.id)
    const hasChildren = node.children.length > 0
    const isSelected = selectedId === node.id
    const isHovered = hoveredId === node.id
    const p = PRIORITY_MAP[node.priority] ?? PRIORITY_MAP[4]
    const typeMeta = TYPE_LABELS[node.type] ?? {
      label: node.type,
      color: token.colorTextSecondary,
      bg: token.colorFillTertiary
    }

    rows.push(
      <div
        key={node.id}
        className="flex items-center cursor-pointer"
        style={{
          height: 38,
          padding: '0 12px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          background: isSelected
            ? token.colorPrimaryBg
            : isHovered
              ? token.colorFillQuaternary
              : 'transparent',
          fontSize: 13,
          gap: 8
        }}
        onMouseEnter={() => setHoveredId(node.id)}
        onMouseLeave={() => setHoveredId(null)}
        onClick={() => onSelect(node.id)}
      >
        {/* 折叠箭头 */}
        <span style={cellStyle(18)} onClick={(e) => e.stopPropagation()}>
          {hasChildren ? (
            <span
              style={{ display: 'inline-flex', cursor: 'pointer', color: token.colorTextTertiary }}
              onClick={() => onToggleCollapse(node.id)}
            >
              {isCollapsed ? <RiArrowRightSLine size={15} /> : <RiArrowDownSLine size={15} />}
            </span>
          ) : null}
        </span>
        {/* 编号 */}
        <span style={{ ...cellStyle(40), color: token.colorTextTertiary, fontSize: 12 }}>
          {numberPath.join('.')}
        </span>
        {/* 名称（按层级缩进，限制最大宽度） */}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: 360,
            paddingLeft: depth * 18,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: isSelected ? token.colorPrimary : token.colorText,
            fontSize: 12.5,
            fontWeight: depth === 0 ? 500 : 400
          }}
        >
          {node.title}
        </span>
        {/* 类型 */}
        <span
          style={{
            ...cellStyle(56),
            fontSize: 11,
            textAlign: 'center'
          }}
        >
          <span
            style={{
              display: 'inline-block',
              padding: '1px 8px',
              borderRadius: 8,
              background: typeMeta.bg,
              color: typeMeta.color,
              lineHeight: '18px'
            }}
          >
            {typeMeta.label}
          </span>
        </span>
        {/* 进度 */}
        <span style={{ ...cellStyle(110), display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 72,
              height: 6,
              borderRadius: 3,
              background: token.colorFillTertiary,
              overflow: 'hidden',
              flexShrink: 0
            }}
          >
            <span
              style={{
                display: 'block',
                height: '100%',
                width: `${Math.min(100, Math.max(0, node.progress))}%`,
                background: token.colorPrimary,
                borderRadius: 2
              }}
            />
          </span>
          <span style={{ fontSize: 12, color: token.colorTextSecondary, width: 28 }}>
            {node.progress}%
          </span>
        </span>
        {/* 工时 */}
        <span style={{ ...cellStyle(44, true), color: token.colorTextSecondary }}>
          {node.work_hours}h
        </span>
        {/* 优先级 */}
        <span style={{ ...cellStyle(44), textAlign: 'center' }}>
          <span
            style={{
              display: 'inline-block',
              minWidth: 26,
              padding: '0 5px',
              borderRadius: 4,
              background: p.rgba,
              color: p.hex,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: '17px',
              textAlign: 'center'
            }}
          >
            {p.label}
          </span>
        </span>
        {/* 日期 */}
        <span style={{ ...cellStyle(120), color: token.colorTextSecondary, fontSize: 12 }}>
          {formatDate(node.start_date)} → {formatDate(node.end_date)}
        </span>
        {/* 依赖 */}
        <span style={{ ...cellStyle(52), color: token.colorTextTertiary, textAlign: 'center' }}>
          {node.dependencies.length > 0 ? (
            <Tooltip title={`依赖 ${node.dependencies.length} 个任务`}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <RiLink size={12} />
                {node.dependencies.length}
              </span>
            </Tooltip>
          ) : (
            <span style={{ opacity: 0.4 }}>—</span>
          )}
        </span>
        {/* 操作 */}
        <span
          style={{ width: 84, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', gap: 2 }}
        >
          <div
            style={{
              display: 'flex',
              gap: 2,
              opacity: isHovered ? 1 : 0,
              transition: 'opacity 0.15s'
            }}
          >
            {node.type !== 'task' && (
              <Tooltip title="添加子任务">
                <Button
                  type="text"
                  size="small"
                  icon={<RiAddLine size={14} />}
                  style={{ width: 22, height: 22, padding: 0 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddTask(node.id)
                  }}
                />
              </Tooltip>
            )}
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<RiEditLine size={14} />}
                style={{ width: 22, height: 22, padding: 0 }}
                onClick={(e) => {
                  e.stopPropagation()
                  onEditTask(node)
                }}
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                danger
                icon={<RiDeleteBinLine size={14} />}
                style={{ width: 22, height: 22, padding: 0 }}
                onClick={(e) => {
                  e.stopPropagation()
                  // 与树视图一致的二次确认（修复：此前一行误点即删整棵子树且无撤销）
                  modal.confirm({
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
          </div>
        </span>
      </div>
    )

    if (hasChildren && !isCollapsed) {
      node.children.forEach((child, idx) => renderNode(child, [...numberPath, idx + 1], depth + 1))
    }
  }

  tree.forEach((node, i) => renderNode(node, [i + 1], 0))

  const header = (
    <div
      className="flex items-center"
      style={{
        height: 36,
        padding: '0 12px',
        borderBottom: `2px solid ${token.colorBorderSecondary}`,
        color: token.colorTextSecondary,
        fontSize: 12,
        fontWeight: 600,
        gap: 8,
        flexShrink: 0,
        userSelect: 'none'
      }}
    >
      <span style={cellStyle(18)} />
      <span style={{ ...cellStyle(40), textAlign: 'right' }}>#</span>
      <span style={{ flex: 1, minWidth: 0, maxWidth: 360 }}>任务名称</span>
      <span style={{ ...cellStyle(56), textAlign: 'center' }}>类型</span>
      <span style={cellStyle(110)}>进度</span>
      <span style={{ ...cellStyle(44, true) }}>工时</span>
      <span style={{ ...cellStyle(44), textAlign: 'center' }}>优先级</span>
      <span style={cellStyle(120)}>日期</span>
      <span style={{ ...cellStyle(52), textAlign: 'center' }}>依赖</span>
      <span style={{ width: 84, flexShrink: 0 }} />
    </div>
  )

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ flex: 1, minWidth: 0, background: token.colorBgLayout }}
    >
      {header}
      <div className="flex-1 overflow-auto custom-scrollbar">
        {rows.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-full gap-2"
            style={{ color: token.colorTextTertiary }}
          >
            <span className="text-sm">暂无项目</span>
            <Button type="link" size="small" onClick={() => onAddTask(null)}>
              创建第一个项目
            </Button>
          </div>
        ) : (
          rows
        )}
      </div>
    </div>
  )
}

export default TaskListView
