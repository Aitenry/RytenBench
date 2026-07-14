import React, { useState, useEffect, useRef } from 'react'
import { Modal } from 'antd'
import { RiCheckFill, RiCloseFill, RiAddFill, RiPlayFill } from '@remixicon/react'
import { Window } from '../../../../resource/types/window'
import { useMessage } from '../../../hooks/useMessage'
import TodoEditModal from '@renderer/components/todo/TodoEditModal'
import type { TodoItem } from '@renderer/types/models'
import type { TodoListProps } from '@renderer/types/components'

const TodoList: React.FC<TodoListProps> = ({ initialTodos = [] }) => {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [removingIds, setRemovingIds] = useState<Set<number>>(new Set())
  const [initialLoad, setInitialLoad] = useState(true)
  const [initialAnimationsComplete, setInitialAnimationsComplete] = useState(false)
  const [previewModalVisible, setPreviewModalVisible] = useState(false)
  const [addModalVisible, setAddModalVisible] = useState(false)
  const activeInitialAnimationCount = useRef(0)
  const [currentTodo, setCurrentTodo] = useState<TodoItem | null>(null)
  const { viewMessage } = useMessage()

  // 排序函数
  const sortTodos = (todoList: TodoItem[]): TodoItem[] => {
    return [...todoList].sort((a, b) => {
      // 首先按优先级排序，优先级数字越小优先级越高
      if (a.priority !== b.priority) {
        return a.priority - b.priority
      }

      // 如果优先级相同，按截止日期排序，快过期的在前面
      if (a.due_date && b.due_date) {
        const dateA = new Date(a.due_date)
        const dateB = new Date(b.due_date)
        return dateA.getTime() - dateB.getTime()
      } else if (a.due_date) {
        return -1
      } else if (b.due_date) {
        return 1
      }
      return 0
    })
  }

  // 过滤不同状态的待办事项并排序
  const activeTodos = sortTodos(todos.filter((todo) => todo.status !== 2)) // 非已完成
  const completedTodos = sortTodos(todos.filter((todo) => todo.status === 2))

  // 处理初始加载动画
  useEffect(() => {
    if (initialLoad && activeTodos.length > 0) {
      setInitialLoad(false)
      activeInitialAnimationCount.current = activeTodos.length

      activeTodos.forEach((todo, index) => {
        setTimeout(() => {
          const element = document.querySelector(`[data-todo-id="${todo.id}"]`) as HTMLElement
          if (element) {
            element.classList.remove('hidden')
            element.classList.add('animate__animated', 'animate__fadeInRight')
          }

          activeInitialAnimationCount.current--

          // 添加延迟确保动画完全执行完毕
          if (activeInitialAnimationCount.current <= 0) {
            setTimeout(() => {
              setInitialAnimationsComplete(true)
            }, 700) // 给动画留出完成时间
          }
        }, index * 200)
      })
    }
  }, [activeTodos, initialLoad])

  useEffect(() => {
    setTodos(initialTodos)
  }, [initialTodos])

  const toggleComplete = async (id: number): Promise<void> => {
    const todo = todos.find((t) => t.id === id)
    if (todo) {
      try {
        // 切换状态：0->2, 1->2, 2->0
        const newStatus = todo.status === 2 ? 0 : 2
        const success = await (window as unknown as Window).api.todoItems.update(id, {
          status: newStatus
        })
        if (success) {
          setTodos((prevTodos) =>
            sortTodos(prevTodos.map((t) => (t.id === id ? { ...t, status: newStatus } : t)))
          )
          viewMessage(
            'todo-complete',
            'success',
            `待办事项已${todo.status === 2 ? '重新激活' : '标记为完成'}`
          )
        } else {
          viewMessage('todo-complete-fail', 'error', '更新状态失败')
        }
      } catch (error) {
        console.error('Failed to update todo completion status:', error)
        viewMessage('todo-complete-error', 'error', '更新状态失败')
      }
    }
  }

  const toggleInProgress = async (id: number): Promise<void> => {
    const todo = todos.find((t) => t.id === id)
    if (todo) {
      try {
        // 如果当前是进行中状态，不允许切换回待办状态
        if (todo.status === 1) {
          viewMessage('todo-in-progress', 'warning', '进行中的任务只能标记为完成，不能退回待办状态')
          return
        }

        // 只有当状态为待办（0）时才能切换为进行中（1）
        const newStatus = todo.status === 0 ? 1 : todo.status
        const success = await (window as unknown as Window).api.todoItems.update(id, {
          status: newStatus
        })
        if (success) {
          setTodos((prevTodos) =>
            sortTodos(prevTodos.map((t) => (t.id === id ? { ...t, status: newStatus } : t)))
          )
          viewMessage('todo-in-progress', 'success', `待办事项已标记为进行中`)
        } else {
          viewMessage('todo-in-progress-fail', 'error', '更新状态失败')
        }
      } catch (error) {
        console.error('Failed to update todo in-progress status:', error)
        viewMessage('todo-in-progress-error', 'error', '更新状态失败')
      }
    }
  }

  const removeTodo = async (id: number): Promise<void> => {
    try {
      const success = await (window as unknown as Window).api.todoItems.delete(id)
      if (success) {
        // 添加到移除动画队列
        setRemovingIds((prev) => new Set(prev).add(id))

        // 获取要移除的DOM元素并应用动画
        const element = document.querySelector(`[data-todo-id="${id}"]`) as HTMLElement
        if (element) {
          // 清除当前所有动画类，然后添加移除动画
          element.classList.remove(
            'animate__animated',
            'animate__fadeInRight',
            'animate__bounceOutLeft'
          )
          element.classList.add('animate__animated', 'animate__bounceOutLeft')

          // 监听动画结束事件
          const handleAnimationEnd = (): void => {
            setTodos((prevTodos) => sortTodos(prevTodos.filter((todo) => todo.id !== id)))
            setRemovingIds((prev) => {
              const newSet = new Set(prev)
              newSet.delete(id)
              return newSet
            })
          }

          element.addEventListener('animationend', handleAnimationEnd, { once: true })
        } else {
          // 如果找不到DOM元素，直接移除数据
          setTodos((prevTodos) => sortTodos(prevTodos.filter((todo) => todo.id !== id)))
          setRemovingIds((prev) => {
            const newSet = new Set(prev)
            newSet.delete(id)
            return newSet
          })
        }
        viewMessage('todo-delete', 'success', '待办事项删除成功')
      } else {
        viewMessage('todo-delete-fail', 'error', '删除待办事项失败')
      }
    } catch (error) {
      console.error('Failed to delete todo:', error)
      viewMessage('todo-delete-error', 'error', '删除待办事项失败')
    }
  }

  const openPreviewModal = (todo: TodoItem): void => {
    setCurrentTodo(todo)
    setPreviewModalVisible(true)
  }

  const openAddModal = (): void => {
    setAddModalVisible(true)
  }

  const handleEditSave = async (values: {
    title: string
    description: string
    due_date: string | null
    priority: number
    status: number
    category: string | null
  }): Promise<void> => {
    const messageKey = 'todo-update'
    if (!currentTodo) return
    // 检查是否尝试将进行中的任务改为待办状态
    if (currentTodo.status === 1 && values.status === 0) {
      viewMessage(messageKey, 'error', '进行中的任务不能退回待办状态')
      return
    }
    viewMessage(messageKey, 'loading', '正在更新代办事项...')
    try {
      const success = await (window as unknown as Window).api.todoItems.update(currentTodo.id, {
        title: values.title,
        description: values.description,
        due_date: values.due_date,
        priority: values.priority,
        status: values.status,
        category: values.category
      })
      if (success) {
        setTodos((prevTodos) =>
          sortTodos(
            prevTodos.map((todo) =>
              todo.id === currentTodo.id
                ? { ...todo, ...values, due_date: values.due_date ?? todo.due_date }
                : todo
            )
          )
        )
        setPreviewModalVisible(false)
        setCurrentTodo(null)
        viewMessage(messageKey, 'success', '待办事项更新成功！', 2)
      } else {
        viewMessage(messageKey, 'error', '更新待办事项失败！', 2)
      }
    } catch (error) {
      console.error('Failed to update todo:', error)
      viewMessage(messageKey, 'error', '更新待办事项失败')
    }
  }

  const handleAddSave = async (values: {
    title: string
    description: string
    due_date: string | null
    priority: number
    category: string | null
  }): Promise<void> => {
    const messageKey = 'todo-add'
    viewMessage(messageKey, 'loading', '正在添加待办事项...')
    try {
      const newTodo = {
        ...values,
        status: 0,
        due_date: values.due_date ?? null
      }
      const newId = await (window as unknown as Window).api.todoItems.add(newTodo)
      const todoWithId: TodoItem = {
        ...newTodo,
        id: newId,
        due_date: newTodo.due_date,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
        started_at: null
      }
      setTodos((prevTodos) => sortTodos([...prevTodos, todoWithId]))
      setAddModalVisible(false)
      viewMessage(messageKey, 'success', '待办事项添加成功')
    } catch (error) {
      console.error('Failed to add todo:', error)
      viewMessage(messageKey, 'error', '添加待办事项失败')
    }
  }

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '无截止日期'
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric'
    })
  }

  const getPriorityColor = (priority: number): string => {
    // 从 P0 到 P7，P0 为最高优先级
    if (priority === 0) return 'border-l-red-500 bg-red-50' // P0: 最高优先级
    if (priority === 1) return 'border-l-orange-500 bg-orange-50' // P1: 高优先级
    if (priority === 2) return 'border-l-yellow-500 bg-yellow-50' // P2: 中优先级
    if (priority === 3) return 'border-l-green-500 bg-green-50' // P3-P5: 低优先级
    return 'border-l-gray-500 bg-gray-50 dark:bg-gray-800 dark:border-l-gray-600' // P6+: 最低优先级
  }

  const getPriorityBadgeColor = (priority: number): string => {
    if (priority === 0) return 'bg-red-200 text-red-800' // P0: 最高优先级
    if (priority === 1) return 'bg-orange-200 text-orange-800' // P1: 高优先级
    if (priority === 2) return 'bg-yellow-200 text-yellow-800' // P2: 中优先级
    if (priority === 3) return 'bg-green-200 text-green-800' // P3-P5: 低优先级
    return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200' // P6+: 最低优先级
  }

  const getPriorityText = (priority: number): string => {
    return `P${priority}`
  }

  const getStatusText = (status: number): string => {
    if (status === 0) return '待办'
    if (status === 1) return '进行中'
    if (status === 2) return '已完成'
    return '未知'
  }

  const getStatusColor = (status: number): string => {
    if (status === 0) return 'bg-blue-200 text-blue-800' // 原版样式
    if (status === 1) return 'bg-yellow-200 text-yellow-800' // 原版样式
    if (status === 2) return 'bg-green-200 text-green-800' // 原版样式
    return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
  }

  const getDaysUntilDue = (due_date: string | null): { text: string; color: string } => {
    if (!due_date) return { text: '无截止日期', color: 'text-gray-500 dark:text-gray-400' }

    const today = new Date()
    const due = new Date(due_date)
    const diffTime = due.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return { text: '已过期', color: 'text-red-500' }
    if (diffDays === 0) return { text: '今天到期', color: 'text-orange-500' }
    if (diffDays <= 3) return { text: `${diffDays}天后到期`, color: 'text-yellow-500' }
    return { text: `${diffDays}天后到期`, color: 'text-gray-500 dark:text-gray-400' }
  }

  return (
    <div className="p-3 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">待办事项</h2>
        <div className="flex items-center space-x-2">
          <span className="bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full">
            {activeTodos.length} 项
          </span>
          <button
            onClick={openAddModal}
            className={`
              w-7 h-7 rounded-full bg-blue-100 text-blue-500
              flex items-center justify-center
              hover:bg-blue-200 hover:text-blue-600 transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-blue-300 focus:ring-opacity-50
            `}
          >
            <RiAddFill size={14} />
          </button>
        </div>
      </div>

      {/* 滚动容器 */}
      <div
        className="flex-1 overflow-x-hidden overflow-y-auto p-2 space-y-3 custom-scrollbar"
        style={{ maxHeight: 'calc(100vh - 40px)' }}
      >
        {activeTodos.map((todo) => {
          const daysInfo = getDaysUntilDue(todo.due_date)
          const isRemoving = removingIds.has(todo.id)

          return (
            <div
              key={todo.id}
              data-todo-id={todo.id}
              className={`
                  group relative rounded-lg border-l-4 shadow-sm hover:shadow-md
                  transition-all duration-300 overflow-hidden cursor-pointer
                  ${getPriorityColor(todo.priority)}
                  animate__animated
                  ${isRemoving ? 'animate__bounceOutLeft' : `${initialAnimationsComplete ? '' : 'hidden'}`}
                `}
              onClick={(e) => {
                // 防止点击按钮时触发卡片点击事件
                if (!(e.target as Element).closest('button')) {
                  openPreviewModal(todo)
                }
              }}
            >
              <div className="p-3 relative z-20">
                <div className="flex items-start justify-between mb-1">
                  <h3 className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[70%]">
                    {todo.title}
                  </h3>
                  <div className="flex space-x-1">
                    {/* 进行中按钮 */}
                    {todo.status !== 1 && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation() // 阻止事件冒泡
                          Modal.confirm({
                            title: '确认操作',
                            content: `确定要 "${todo.title}" 标记为进行中吗？`,
                            okText: '确认',
                            cancelText: '取消',
                            centered: true,
                            onOk: async () => {
                              await toggleInProgress(todo.id)
                            }
                          })
                        }}
                        className="ml-1 p-1 rounded-full transition-all duration-200 bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500 hover:bg-blue-300 hover:text-white"
                      >
                        <RiPlayFill size={14} />
                      </button>
                    )}
                    {/* 完成按钮 */}
                    {todo.status === 1 && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation() // 阻止事件冒泡
                          // 显示确认对话框
                          Modal.confirm({
                            title: '确认操作',
                            content: `确定要 "${todo.title}" ${todo.status === 2 ? '重新激活' : '标记为完成'}吗？`,
                            okText: '确认',
                            cancelText: '取消',
                            centered: true,
                            onOk: async () => {
                              await toggleComplete(todo.id)
                            }
                          })
                        }}
                        className="ml-1 p-1 rounded-full transition-all duration-200 bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500 hover:bg-green-200 hover:text-green-500"
                      >
                        <RiCheckFill size={14} />
                      </button>
                    )}
                    {/* 删除按钮 */}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation() // 阻止事件冒泡
                        // 显示删除确认对话框
                        Modal.confirm({
                          title: '确认删除',
                          content: `确定要删除 "${todo.title}" 吗？此操作不可撤销。`,
                          okText: '删除',
                          cancelText: '取消',
                          centered: true,
                          okButtonProps: { danger: true },
                          onOk: async () => {
                            await removeTodo(todo.id)
                          }
                        })
                      }}
                      className={`
                          ml-1 p-1 rounded-full transition-all duration-200
                          bg-gray-200 text-gray-400 dark:bg-gray-700 dark:text-gray-500 hover:bg-red-200 hover:text-red-500
                        `}
                    >
                      <RiCloseFill size={14} />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                  {todo.description}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${getPriorityBadgeColor(todo.priority)}`}
                    >
                      {getPriorityText(todo.priority)}
                    </span>
                    <span className={`text-xs ${daysInfo.color}`}>{formatDate(todo.due_date)}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(todo.status)}`}
                    >
                      {getStatusText(todo.status)}
                    </span>
                    {todo.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                        {todo.category}
                      </span>
                    )}
                    <span className={`text-xs ${daysInfo.color}`}>{daysInfo.text}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 已完成事项计数 */}
      <div className="pt-2 text-center border-t border-gray-100 dark:border-gray-700">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          已完成:{' '}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {completedTodos.length}
          </span>{' '}
          项
        </span>
      </div>

      <TodoEditModal
        editModalOpen={previewModalVisible}
        currentTodo={currentTodo}
        onEditClose={() => {
          setPreviewModalVisible(false)
          setCurrentTodo(null)
        }}
        onEditSave={handleEditSave}
        addModalOpen={addModalVisible}
        onAddClose={() => setAddModalVisible(false)}
        onAddSave={handleAddSave}
      />
    </div>
  )
}

export default TodoList
