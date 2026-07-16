import React, { useState } from 'react'
import { Tag, Modal } from 'antd'
import { RiCloseFill, RiPlayFill, RiCheckFill, RiPencilLine } from '@remixicon/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { TodoItem as TodoItemRow } from '@renderer/types/models'
import type { ThemePalette } from '@renderer/types/components'
import { formatDueDate } from '../../utils/canvasUtils'

/* ──────────── React Flow node data type ──────────── */

export interface TodoNodeData extends Record<string, unknown> {
  todo: TodoItemRow
  palette: ThemePalette
  colorIndex: number
  onOpen: (todo: TodoItemRow) => void
  onEdit: (todo: TodoItemRow) => void
  onToggleInProgress: (todo: TodoItemRow) => void
  onToggleComplete: (todo: TodoItemRow) => void
  onDelete: (todo: TodoItemRow) => void
}

/** Type B: Todo sticky note */
const TodoNode: React.FC<NodeProps<Node<TodoNodeData>>> = ({ data }) => {
  const { todo, palette, colorIndex } = data
  const [hovered, setHovered] = useState(false)
  const stickyPalette = palette.stickyColors[colorIndex % palette.stickyColors.length]

  return (
    <div
      style={{ cursor: 'pointer', position: 'relative' }}
      onClick={() => data.onOpen(todo)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          width: 220,
          minHeight: 160,
          background: stickyPalette.bg,
          borderRadius: 14,
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
      </div>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0 }}>
        <button
          style={{
            position: 'absolute',
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: stickyPalette.bg,
            color: palette.textSecondary,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translate(-37px, -33px)' : 'translate(-37px, -33px) scale(0.6)',
            transition:
              'opacity 0.3s ease, transform 0.2s ease, background 0.15s ease, box-shadow 0.15s ease',
            zIndex: 2
          }}
          onClick={(e) => {
            e.stopPropagation()
            Modal.confirm({
              title: '确认删除',
              content: `确定要删除 "${todo.title}" 吗？此操作不可撤销。`,
              okText: '删除',
              cancelText: '取消',
              centered: true,
              okButtonProps: { danger: true },
              onOk: () => data.onDelete(todo)
            })
          }}
          title="删除待办事项"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#fee2e2'
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = stickyPalette.bg
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'
          }}
        >
          <RiCloseFill size={14} />
        </button>
        {todo.status !== 1 ? (
          <button
            style={{
              position: 'absolute',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: stickyPalette.bg,
              color: palette.textSecondary,
              boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
              opacity: hovered ? 1 : 0,
              transform: hovered ? 'translate(-3px, -27px)' : 'translate(-3px, -27px) scale(0.6)',
              transition:
                'opacity 0.3s ease, transform 0.2s ease, background 0.15s ease, box-shadow 0.15s ease',
              zIndex: 2
            }}
            onClick={(e) => {
              e.stopPropagation()
              Modal.confirm({
                title: '确认操作',
                content: `确定要将 "${todo.title}" 标记为进行中吗？`,
                okText: '确认',
                cancelText: '取消',
                centered: true,
                onOk: () => data.onToggleInProgress(todo)
              })
            }}
            title="标记为进行中"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#dbeafe'
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = stickyPalette.bg
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'
            }}
          >
            <RiPlayFill size={14} />
          </button>
        ) : (
          <button
            style={{
              position: 'absolute',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              background: stickyPalette.bg,
              color: palette.textSecondary,
              boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
              opacity: hovered ? 1 : 0,
              transform: hovered ? 'translate(-3px, -27px)' : 'translate(-3px, -27px) scale(0.6)',
              transition:
                'opacity 0.3s ease, transform 0.2s ease, background 0.15s ease, box-shadow 0.15s ease',
              zIndex: 2
            }}
            onClick={(e) => {
              e.stopPropagation()
              Modal.confirm({
                title: '确认操作',
                content: `确定要将 "${todo.title}" 标记为完成吗？`,
                okText: '确认',
                cancelText: '取消',
                centered: true,
                onOk: () => data.onToggleComplete(todo)
              })
            }}
            title="标记为完成"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#dcfce7'
              e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = stickyPalette.bg
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'
            }}
          >
            <RiCheckFill size={14} />
          </button>
        )}
        <button
          style={{
            position: 'absolute',
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            border: 'none',
            cursor: 'pointer',
            background: stickyPalette.bg,
            color: palette.textSecondary,
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            opacity: hovered ? 1 : 0,
            transform: hovered ? 'translate(6px, 7px)' : 'translate(6px, 7px) scale(0.6)',
            transition:
              'opacity 0.3s ease, transform 0.2s ease, background 0.15s ease, box-shadow 0.15s ease',
            zIndex: 2
          }}
          onClick={(e) => {
            e.stopPropagation()
            data.onEdit(todo)
          }}
          title="编辑待办事项"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0,0,0,0.10)'
            e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.18)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = stickyPalette.bg
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)'
          }}
        >
          <RiPencilLine size={14} />
        </button>
      </div>
    </div>
  )
}

export default React.memo(TodoNode)
