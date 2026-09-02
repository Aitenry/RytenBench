import React, { useEffect } from 'react'
import { Modal, Form, Input, DatePicker, Select } from 'antd'
import dayjs from 'dayjs'
import type { TodoItem } from '@renderer/types/models'

const getStatusOptions = (currentStatus: number): { value: number; label: string }[] => {
  if (currentStatus === 1) {
    return [
      { value: 1, label: '进行中' },
      { value: 2, label: '已完成' }
    ]
  }
  return [
    { value: 0, label: '待办' },
    { value: 1, label: '进行中' },
    { value: 2, label: '已完成' }
  ]
}

/* ──────────── Types ──────────── */

export interface TodoFormValues {
  title: string
  description: string
  due_date: string | null
  priority: number
  status: number
  category: string | null
}

export interface TodoEditModalProps {
  editModalOpen: boolean
  currentTodo: TodoItem | null
  onEditClose: () => void
  onEditSave: (values: TodoFormValues) => Promise<void>

  addModalOpen: boolean
  onAddClose: () => void
  onAddSave: (values: Omit<TodoFormValues, 'status'>) => Promise<void>
}

/* ──────────── Component ──────────── */

const TodoEditModal: React.FC<TodoEditModalProps> = ({
  editModalOpen,
  currentTodo,
  onEditClose,
  onEditSave,
  addModalOpen,
  onAddClose,
  onAddSave
}) => {
  const [editForm] = Form.useForm<TodoFormValues>()
  const [addForm] = Form.useForm<Omit<TodoFormValues, 'status'>>()

  // Sync edit form when currentTodo changes
  useEffect(() => {
    if (editModalOpen && currentTodo) {
      editForm.setFieldsValue({
        title: currentTodo.title,
        description: currentTodo.description,
        due_date: currentTodo.due_date ? dayjs(currentTodo.due_date) : null,
        priority: currentTodo.priority,
        status: currentTodo.status,
        category: currentTodo.category
      } as unknown as TodoFormValues)
    }
  }, [editModalOpen, currentTodo, editForm])

  const handleEditOk = async (): Promise<void> => {
    try {
      const values = await editForm.validateFields()
      await onEditSave({
        title: values.title,
        description: values.description,
        due_date: values.due_date
          ? dayjs(values.due_date as unknown as string).format('YYYY-MM-DD')
          : null,
        priority: values.priority,
        status: values.status,
        category: values.category || null
      })
    } catch {
      // Validation failed — do nothing, form will show errors
    }
  }

  const handleAddOk = async (): Promise<void> => {
    try {
      const values = await addForm.validateFields()
      await onAddSave({
        title: values.title,
        description: values.description,
        due_date: values.due_date
          ? dayjs(values.due_date as unknown as string).format('YYYY-MM-DD')
          : null,
        priority: values.priority,
        category: values.category || null
      })
      // 修复：成功后表单不重置,下次新建预填上次内容（旧 description/priority/category 一并写入新待办）
      addForm.resetFields()
    } catch {
      // Validation failed
    }
  }

  const handleEditCancel = (): void => {
    editForm.resetFields()
    onEditClose()
  }

  const handleAddCancel = (): void => {
    addForm.resetFields()
    onAddClose()
  }

  return (
    <>
      {/* Edit / Preview Modal */}
      <Modal
        title="待办事项详情"
        open={editModalOpen}
        onOk={handleEditOk}
        onCancel={handleEditCancel}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form
          key={currentTodo?.id ?? 'edit-form-empty'}
          form={editForm}
          layout="vertical"
          initialValues={
            currentTodo
              ? {
                  title: currentTodo.title,
                  description: currentTodo.description,
                  due_date: currentTodo.due_date ? dayjs(currentTodo.due_date) : null,
                  priority: currentTodo.priority,
                  status: currentTodo.status,
                  category: currentTodo.category
                }
              : undefined
          }
        >
          {currentTodo && (
            <>
              <Form.Item
                name="title"
                label="标题"
                rules={[{ required: true, message: '请输入标题' }]}
              >
                <Input placeholder="请输入待办事项标题" />
              </Form.Item>

              <Form.Item name="description" label="描述">
                <Input.TextArea rows={4} placeholder="请输入待办事项描述" />
              </Form.Item>

              <Form.Item name="due_date" label="截止日期">
                <DatePicker
                  style={{ width: '100%' }}
                  placeholder="请选择截止日期"
                  format="YYYY-MM-DD"
                />
              </Form.Item>

              <div className="grid grid-cols-3 gap-4">
                <Form.Item name="priority" label="优先级" className="mb-0">
                  <Select placeholder="请选择优先级">
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((p) => (
                      <Select.Option key={p} value={p}>
                        P{p}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item name="status" label="状态" className="mb-0">
                  <Select placeholder="请选择状态">
                    {getStatusOptions(currentTodo.status).map((option) => (
                      <Select.Option key={option.value} value={option.value}>
                        {option.label}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item name="category" label="分类" className="mb-0">
                  <Input placeholder="请输入分类" />
                </Form.Item>
              </div>
            </>
          )}
        </Form>
      </Modal>

      {/* Add Modal */}
      <Modal
        title="添加待办事项"
        open={addModalOpen}
        onOk={handleAddOk}
        onCancel={handleAddCancel}
        width={600}
        okText="添加"
        cancelText="取消"
      >
        <Form form={addForm} layout="vertical">
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="请输入待办事项标题" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={4} placeholder="请输入待办事项描述" />
          </Form.Item>

          <Form.Item name="due_date" label="截止日期">
            <DatePicker
              style={{ width: '100%' }}
              placeholder="请选择截止日期"
              format="YYYY-MM-DD"
            />
          </Form.Item>

          <Form.Item name="priority" label="优先级">
            <Select placeholder="请选择优先级">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((p) => (
                <Select.Option key={p} value={p}>
                  P{p}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="category" label="分类">
            <Input placeholder="请输入分类" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default TodoEditModal
