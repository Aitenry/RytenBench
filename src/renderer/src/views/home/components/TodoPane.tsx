import React, { useCallback, useEffect, useState } from 'react'
import { theme, Button, Spin, Empty, App, Tag } from 'antd'
import {
  RiPlayLine,
  RiCheckLine,
  RiRefreshLine,
  RiDeleteBinLine,
  RiEditLine,
  RiTimeLine,
  RiFlag2Line,
  RiPriceTag3Line
} from '@remixicon/react'
import dayjs from 'dayjs'
import { Window } from '../../../../resource/types/window'
import { useMessage } from '@renderer/hooks/useMessage'
import TodoEditModal, { type TodoFormValues } from '@renderer/components/todo/TodoEditModal'
import type { TodoItem } from '@renderer/types/models'

interface TodoPaneProps {
  todoId: number
  /** 变更回调：更新后回传新数据；删除后回传 null */
  onChanged: (todo: TodoItem | null) => void
}

const STATUS_META: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: '待办', color: '#1677ff', bg: 'rgba(22,119,255,0.1)' },
  1: { label: '进行中', color: '#fa8c16', bg: 'rgba(250,140,22,0.12)' },
  2: { label: '已完成', color: '#52c41a', bg: 'rgba(82,196,26,0.12)' }
}

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

const TodoPane: React.FC<TodoPaneProps> = ({ todoId, onChanged }) => {
  const { token } = theme.useToken()
  const api = (window as unknown as Window).api
  const { viewMessage } = useMessage()
  const { modal } = App.useApp()

  const [todo, setTodo] = useState<TodoItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await api.todoItems.getById(todoId)
      if (result.length > 0) {
        setTodo(result[0])
      } else {
        setNotFound(true)
      }
    } catch (error) {
      console.error('Failed to load todo:', error)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [api, todoId])

  useEffect(() => {
    setNotFound(false)
    load().then()
  }, [load])

  const updateStatus = useCallback(
    async (status: number, message: string): Promise<void> => {
      const messageKey = 'todo-status'
      try {
        viewMessage(messageKey, 'loading', '正在更新状态...')
        await api.todoItems.update(todoId, { status })
        viewMessage(messageKey, 'success', message, 2)
        await load()
        const fresh = await api.todoItems.getById(todoId)
        onChanged(fresh.length > 0 ? fresh[0] : null)
      } catch (error) {
        console.error('Failed to update todo status:', error)
        viewMessage(messageKey, 'error', '更新状态失败')
      }
    },
    [api, todoId, viewMessage, load, onChanged]
  )

  const handleDelete = useCallback((): void => {
    modal.confirm({
      title: '确定要删除这条待办吗？',
      content: '删除后无法恢复。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const messageKey = 'todo-delete'
        try {
          viewMessage(messageKey, 'loading', '正在删除...')
          await api.todoItems.delete(todoId)
          viewMessage(messageKey, 'success', '已删除', 2)
          onChanged(null)
        } catch (error) {
          console.error('Failed to delete todo:', error)
          viewMessage(messageKey, 'error', '删除失败')
        }
      }
    })
  }, [api, todoId, viewMessage, onChanged, modal])

  const handleEditSave = useCallback(
    async (values: TodoFormValues): Promise<void> => {
      const messageKey = 'todo-edit'
      try {
        viewMessage(messageKey, 'loading', '正在保存待办...')
        await api.todoItems.update(todoId, {
          title: values.title,
          description: values.description,
          due_date: values.due_date,
          priority: values.priority,
          status: values.status,
          category: values.category
        })
        viewMessage(messageKey, 'success', '待办已更新', 2)
        setEditOpen(false)
        await load()
        const fresh = await api.todoItems.getById(todoId)
        onChanged(fresh.length > 0 ? fresh[0] : null)
      } catch (error) {
        console.error('Failed to update todo:', error)
        viewMessage(messageKey, 'error', '保存待办失败')
      }
    },
    [api, todoId, viewMessage, load, onChanged]
  )

  if (loading) {
    return (
      <PaneShell token={token}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%'
          }}
        >
          <Spin size="large" />
        </div>
      </PaneShell>
    )
  }

  if (notFound || !todo) {
    return (
      <PaneShell token={token}>
        <Empty description="待办不存在或已被删除" style={{ marginTop: 120 }} />
      </PaneShell>
    )
  }

  const status = STATUS_META[todo.status] ?? STATUS_META[0]
  const priorityColor = PRIORITY_COLORS[todo.priority] ?? token.colorTextTertiary
  const overdue =
    todo.status !== 2 && todo.due_date && dayjs(todo.due_date).isBefore(dayjs(), 'day')

  return (
    <PaneShell token={token}>
      <div
        className="custom-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 48px 48px',
          maxWidth: 876,
          width: '100%',
          margin: '0 auto'
        }}
      >
        {/* 标题 */}
        <div
          style={{
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1.4,
            color: token.colorText,
            textDecoration: todo.status === 2 ? 'line-through' : 'none',
            textDecorationColor: token.colorTextTertiary,
            marginBottom: 14
          }}
        >
          {todo.title}
        </div>

        {/* 状态标签行 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 18
          }}
        >
          <Tag
            bordered={false}
            style={{
              margin: 0,
              color: status.color,
              background: status.bg,
              fontSize: 12,
              padding: '1px 10px',
              borderRadius: 10
            }}
          >
            {status.label}
          </Tag>
          <Tag
            bordered={false}
            style={{
              margin: 0,
              color: priorityColor,
              background: token.colorFillTertiary,
              fontSize: 12,
              padding: '1px 10px',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            <RiFlag2Line size={12} />
            优先级 P{todo.priority}
          </Tag>
          {todo.category && (
            <Tag
              bordered={false}
              style={{
                margin: 0,
                color: token.colorTextSecondary,
                background: token.colorFillTertiary,
                fontSize: 12,
                padding: '1px 10px',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <RiPriceTag3Line size={12} />
              {todo.category}
            </Tag>
          )}
          {todo.due_date && (
            <Tag
              bordered={false}
              style={{
                margin: 0,
                color: overdue ? token.colorError : token.colorTextSecondary,
                background: overdue ? token.colorErrorBg : token.colorFillTertiary,
                fontSize: 12,
                padding: '1px 10px',
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <RiTimeLine size={12} />
              {overdue ? `已逾期 · ` : '截止 '}
              {dayjs(todo.due_date).format('YYYY-MM-DD')}
            </Tag>
          )}
        </div>

        {/* 描述 */}
        {todo.description && (
          <div
            style={{
              padding: '16px 18px',
              borderRadius: 10,
              background: token.colorFillQuaternary,
              fontSize: 14,
              lineHeight: 1.8,
              color: token.colorText,
              whiteSpace: 'pre-wrap',
              marginBottom: 20
            }}
          >
            {todo.description}
          </div>
        )}

        {/* 操作 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
          {todo.status === 0 && (
            <Button
              type="primary"
              icon={<RiPlayLine size={14} />}
              onClick={() => updateStatus(1, '已标记为进行中')}
            >
              开始任务
            </Button>
          )}
          {todo.status !== 2 && (
            <Button icon={<RiCheckLine size={14} />} onClick={() => updateStatus(2, '已完成')}>
              标记完成
            </Button>
          )}
          {todo.status === 2 && (
            <Button
              icon={<RiRefreshLine size={14} />}
              onClick={() => updateStatus(0, '已重新激活')}
            >
              重新激活
            </Button>
          )}
          <Button icon={<RiEditLine size={14} />} onClick={() => setEditOpen(true)}>
            编辑
          </Button>
          <Button danger icon={<RiDeleteBinLine size={14} />} onClick={handleDelete}>
            删除
          </Button>
        </div>

        {/* 元信息 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '10px 24px',
            paddingTop: 16,
            borderTop: `1px solid ${token.colorBorderSecondary}`
          }}
        >
          <Meta
            token={token}
            label="创建时间"
            value={dayjs(todo.created_at).format('YYYY-MM-DD HH:mm')}
          />
          <Meta
            token={token}
            label="更新时间"
            value={dayjs(todo.updated_at).format('YYYY-MM-DD HH:mm')}
          />
          {todo.started_at && (
            <Meta
              token={token}
              label="开始时间"
              value={dayjs(todo.started_at).format('YYYY-MM-DD HH:mm')}
            />
          )}
          {todo.completed_at && (
            <Meta
              token={token}
              label="完成时间"
              value={dayjs(todo.completed_at).format('YYYY-MM-DD HH:mm')}
            />
          )}
        </div>
      </div>

      <TodoEditModal
        editModalOpen={editOpen}
        currentTodo={todo}
        onEditClose={() => setEditOpen(false)}
        onEditSave={handleEditSave}
        addModalOpen={false}
        onAddClose={() => {}}
        onAddSave={async () => {}}
      />
    </PaneShell>
  )
}

/* ──────────── 通用 ──────────── */

const PaneShell: React.FC<{
  token: ReturnType<typeof theme.useToken>['token']
  children: React.ReactNode
}> = ({ token, children }) => (
  <div
    style={{
      flex: 1,
      minWidth: 0,
      minHeight: 0,
      display: 'flex',
      background: token.colorBgContainer,
      border: `1px solid ${token.colorBorderSecondary}`,
      borderRadius: 12,
      overflow: 'hidden'
    }}
  >
    {children}
  </div>
)

const Meta: React.FC<{
  token: ReturnType<typeof theme.useToken>['token']
  label: string
  value: string
}> = ({ token, label, value }) => (
  <div>
    <div style={{ fontSize: 12, color: token.colorTextTertiary, marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 13.5, color: token.colorText }}>{value}</div>
  </div>
)

export default TodoPane
