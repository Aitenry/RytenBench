import React from 'react'
import { Modal, Divider, theme } from 'antd'
import dayjs from 'dayjs'
import type { TodoItem } from '@renderer/types/models'

/* ──────────── Types ──────────── */

export interface TodoPreviewModalProps {
  open: boolean
  todo: TodoItem | null
  onClose: () => void
}

/* ──────────── Helpers ──────────── */

const PRIORITY_COLORS: Record<number, string> = {
  0: '#f5222d',
  1: '#fa8c16',
  2: '#fadb14',
  3: '#52c41a',
  4: '#13c2c2',
  5: '#1677ff',
  6: '#2f54eb',
  7: '#722ed1'
}

const STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待办', color: '#1677ff' },
  1: { label: '进行中', color: '#fa8c16' },
  2: { label: '已完成', color: '#52c41a' }
}

/* ──────────── Component ──────────── */

const TodoPreviewModal: React.FC<TodoPreviewModalProps> = ({ open, todo, onClose }) => {
  const { token } = theme.useToken()

  if (!todo) return null

  const status = STATUS_MAP[todo.status] ?? { label: '未知', color: token.colorTextTertiary }
  const priorityColor = PRIORITY_COLORS[todo.priority] ?? token.colorTextTertiary

  const dot = (color: string): React.ReactNode => (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color
      }}
    />
  )

  return (
    <Modal title={todo.title} open={open} onCancel={onClose} width={520} centered footer={null}>
      {/* Description */}
      {todo.description && (
        <div
          style={{
            fontSize: 14,
            color: token.colorText,
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            marginBottom: 16
          }}
        >
          {todo.description}
        </div>
      )}

      {/* Priority & status line */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          marginBottom: todo.description ? 0 : 0,
          fontSize: 13,
          color: token.colorTextSecondary
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {dot(priorityColor)}
          优先级 P{todo.priority}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {dot(status.color)}
          {status.label}
        </span>
        {todo.category && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {dot(token.colorFill)}
            {todo.category}
          </span>
        )}
      </div>

      <Divider style={{ margin: '14px 0' }} />

      {/* Meta grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px 24px'
        }}
      >
        <MetaItem
          token={token}
          label="截止日期"
          value={todo.due_date ? dayjs(todo.due_date).format('YYYY-MM-DD') : '无'}
        />
        {todo.started_at && (
          <MetaItem
            token={token}
            label="开始时间"
            value={dayjs(todo.started_at).format('YYYY-MM-DD HH:mm')}
          />
        )}
        {todo.completed_at && (
          <MetaItem
            token={token}
            label="完成时间"
            value={dayjs(todo.completed_at).format('YYYY-MM-DD HH:mm')}
          />
        )}
        <MetaItem
          token={token}
          label="创建时间"
          value={dayjs(todo.created_at).format('YYYY-MM-DD HH:mm')}
        />
        <MetaItem
          token={token}
          label="更新时间"
          value={dayjs(todo.updated_at).format('YYYY-MM-DD HH:mm')}
        />
      </div>
    </Modal>
  )
}

/* ──────────── Meta item ──────────── */

interface MetaItemProps {
  token: ReturnType<typeof theme.useToken>['token']
  label: string
  value: string
}

const MetaItem: React.FC<MetaItemProps> = ({ token, label, value }) => (
  <div>
    <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 14, color: token.colorText }}>{value}</div>
  </div>
)

export default TodoPreviewModal
