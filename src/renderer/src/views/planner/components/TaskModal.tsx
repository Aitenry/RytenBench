import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Modal, Input, Select, Slider, InputNumber, DatePicker, Form, Alert } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import type { PlannerTreeNode } from '@renderer/types/planner'

const { RangePicker } = DatePicker

interface TaskValues {
  title: string
  type: string
  progress: number
  work_hours: number
  priority: number
  start_date: string | null
  end_date: string | null
}

interface Props {
  open: boolean
  parentId: number | null
  editTask: PlannerTreeNode | null
  tree: PlannerTreeNode[]
  onOk: (values: TaskValues, editId: number | null) => void
  onCancel: () => void
}

const PRIORITY_OPTIONS = [
  { value: 0, label: 'P0' },
  { value: 1, label: 'P1' },
  { value: 2, label: 'P2' },
  { value: 3, label: 'P3' },
  { value: 4, label: 'P4' },
  { value: 5, label: 'P5' },
  { value: 6, label: 'P6' },
  { value: 7, label: 'P7' }
]

/** 在树中查找指定ID的节点 */
function findNode(tree: PlannerTreeNode[], id: number): PlannerTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return null
}

/** 计算节点下所有子孙节点的工时总和 */
function sumDescendantWorkHours(node: PlannerTreeNode): number {
  let sum = 0
  for (const child of node.children) {
    sum += child.work_hours
    sum += sumDescendantWorkHours(child)
  }
  return sum
}

const AddTaskModal: React.FC<Props> = ({ open, parentId, editTask, tree, onOk, onCancel }) => {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('task')
  const [progress, setProgress] = useState(0)
  const [workHours, setWorkHours] = useState(8)
  const [priority, setPriority] = useState(4)
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  const isEdit = editTask !== null

  // 获取父节点信息
  const parentNode = useMemo(() => {
    if (parentId === null) return null
    return findNode(tree, parentId)
  }, [tree, parentId])

  // 获取编辑节点的子节点工时总和
  const childWorkHoursSum = useMemo(() => {
    if (!editTask) return 0
    return sumDescendantWorkHours(editTask)
  }, [editTask])

  // 获取编辑节点的父节点（编辑时需要从 editTask.parent_id 查找）
  const editParentNode = useMemo(() => {
    if (!editTask || editTask.parent_id === null) return null
    return findNode(tree, editTask.parent_id)
  }, [tree, editTask])

  // 时间范围的约束节点：新建时用 parentNode，编辑时用 editParentNode
  const constrainingNode = editTask ? editParentNode : parentNode

  // RangePicker disabledDate：只能在约束节点的时间范围内选择
  const disabledDate = useCallback(
    (current: Dayjs): boolean => {
      if (!constrainingNode || !constrainingNode.start_date || !constrainingNode.end_date) {
        return false
      }
      const start = dayjs(constrainingNode.start_date).startOf('day')
      const end = dayjs(constrainingNode.end_date).endOf('day')
      return current.isBefore(start) || current.isAfter(end)
    },
    [constrainingNode]
  )

  // RangePicker 打开时默认定位到约束区间起点
  const defaultPickerValue = useMemo<[Dayjs, Dayjs] | undefined>(() => {
    if (!constrainingNode || !constrainingNode.start_date || !constrainingNode.end_date) {
      return undefined
    }
    return [dayjs(constrainingNode.start_date), dayjs(constrainingNode.end_date)]
  }, [constrainingNode])

  // 根据时间范围计算工时上限
  const maxWorkHours = useMemo(() => {
    if (!dateRange) return undefined
    const days = dateRange[1].startOf('day').diff(dateRange[0].startOf('day'), 'day') + 1
    return days * 8
  }, [dateRange])

  useEffect(() => {
    if (open) {
      setValidationError(null)
      if (editTask) {
        setTitle(editTask.title)
        setType(editTask.type)
        setProgress(editTask.progress)
        setWorkHours(editTask.work_hours)
        setPriority(editTask.priority ?? 4)
        setDateRange(
          editTask.start_date && editTask.end_date
            ? [dayjs(editTask.start_date), dayjs(editTask.end_date)]
            : null
        )
      } else {
        setTitle('')
        setType(parentId === null ? 'project' : 'task')
        setProgress(0)
        setWorkHours(8)
        setPriority(4)
        setDateRange(null)
      }
    }
  }, [open, editTask])

  /** 验证必填项与约束，返回错误信息或 null */
  const validate = (): string | null => {
    // 0. 必填校验
    if (!title.trim()) return '名称不能为空。'
    if (!type) return '类型不能为空。'
    if (workHours === undefined || workHours === null || workHours <= 0)
      return '工时不能为空或为 0。'
    if (priority === undefined || priority === null) return '优先级不能为空。'
    if (!dateRange || !dateRange[0] || !dateRange[1]) return '时间范围不能为空。'

    const startDate = dateRange[0]
    const endDate = dateRange[1]

    // 1. 工时上限规则：基于时间范围天数，每天最大 8 小时
    const days = endDate.startOf('day').diff(startDate.startOf('day'), 'day') + 1
    const maxHours = days * 8
    if (workHours > maxHours) {
      return `时间范围跨越 ${days} 天，工时最大仅允许 ${maxHours} 小时`
    }

    // 2. 时间范围层级约束：子级必须在父级时间范围内
    if (constrainingNode && constrainingNode.start_date && constrainingNode.end_date) {
      const pStart = dayjs(constrainingNode.start_date)
      const pEnd = dayjs(constrainingNode.end_date)
      if (startDate.isBefore(pStart, 'day')) {
        return `开始日期不能早于父级开始日期（${pStart.format('YYYY-MM-DD')}）`
      }
      if (endDate.isAfter(pEnd, 'day')) {
        return `结束日期不能晚于父级结束日期（${pEnd.format('YYYY-MM-DD')}）`
      }
    }

    // 3. 层级工时总量约束
    if (isEdit && editTask) {
      // 编辑阶段：其下所有任务工时之和不得超过阶段总工时
      if (editTask.type === 'phase' && workHours < childWorkHoursSum) {
        return `阶段总工时（${workHours}h）不能小于其下所有任务工时之和（${childWorkHoursSum}h）`
      }
      // 编辑项目：其下所有阶段工时之和不得超过项目总工时
      if (editTask.type === 'project') {
        const childPhaseSum = editTask.children.reduce(
          (sum, c) => sum + (c.type === 'phase' ? c.work_hours : 0),
          0
        )
        if (workHours < childPhaseSum) {
          return `项目总工时（${workHours}h）不能小于其下所有阶段工时之和（${childPhaseSum}h）`
        }
      }
    }

    // 4. 添加子任务时，不能超过父级工时上限
    if (!isEdit && parentNode) {
      if (parentNode.type === 'phase') {
        const existedSum = sumDescendantWorkHours(parentNode)
        if (existedSum + workHours > parentNode.work_hours) {
          return `该阶段下所有任务工时之和（${existedSum + workHours}h）将超过阶段总工时（${parentNode.work_hours}h）`
        }
      }
      if (parentNode.type === 'project' && type === 'phase') {
        const existedPhaseSum = parentNode.children.reduce(
          (sum, c) => sum + (c.type === 'phase' ? c.work_hours : 0),
          0
        )
        if (existedPhaseSum + workHours > parentNode.work_hours) {
          return `该项目下所有阶段工时之和（${existedPhaseSum + workHours}h）将超过项目总工时（${parentNode.work_hours}h）`
        }
      }
    }

    return null
  }

  const handleOk = (): void => {
    const error = validate()
    if (error) {
      setValidationError(error)
      return
    }

    setValidationError(null)
    onOk(
      {
        title: title.trim(),
        type,
        progress,
        work_hours: workHours,
        priority,
        start_date: dateRange![0].format('YYYY-MM-DDTHH:mm:ss'),
        end_date: dateRange![1].format('YYYY-MM-DDTHH:mm:ss')
      },
      isEdit ? editTask!.id : null
    )
  }

  const getTitle = (): string => {
    if (isEdit) return '编辑任务'
    if (parentId !== null) return '添加子任务'
    return '新建项目'
  }

  /** 根据上下文确定可用的类型选项 */
  const getTypeOptions = (): { value: string; label: string }[] => {
    if (isEdit) {
      // 编辑时保持原类型
      return [{ value: editTask!.type, label: getTypeLabel(editTask!.type) }]
    }
    if (parentId === null) {
      // 顶层：允许所有类型
      return [
        { value: 'project', label: '项目' },
        { value: 'phase', label: '阶段' },
        { value: 'task', label: '任务' }
      ]
    }
    // 子任务：仅允许任务或阶段
    return [
      { value: 'task', label: '任务' },
      { value: 'phase', label: '阶段' }
    ]
  }

  const getTypeLabel = (t: string): string => {
    const map: Record<string, string> = {
      project: '项目',
      phase: '阶段',
      task: '任务'
    }
    return map[t] ?? t
  }

  const typeOptions = getTypeOptions()

  return (
    <Modal
      title={getTitle()}
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="确定"
      cancelText="取消"
      width={420}
      destroyOnClose
    >
      <Form layout="vertical" size="small">
        {validationError && (
          <Alert
            type="error"
            message={validationError}
            showIcon
            closable
            style={{ marginBottom: 12 }}
            onClose={() => setValidationError(null)}
          />
        )}

        <Form.Item label="名称" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入名称"
            onPressEnter={handleOk}
          />
        </Form.Item>

        {(isEdit || parentId !== null) && (
          <Form.Item label="类型">
            <Select value={type} onChange={(v) => setType(v)} disabled={isEdit}>
              {typeOptions.map((opt) => (
                <Select.Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        )}

        {type !== 'project' && type !== 'phase' && isEdit && (
          <Form.Item label={`进度 (${progress}%)`}>
            <Slider
              min={0}
              max={100}
              value={progress}
              onChange={setProgress}
              tooltip={{ formatter: (v) => `${v}%` }}
            />
          </Form.Item>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Form.Item label="工时" className="mb-0">
            <InputNumber
              className="w-full"
              min={0}
              max={maxWorkHours}
              value={workHours}
              onChange={(v) => setWorkHours(v ?? 0)}
              addonAfter="工时"
            />
          </Form.Item>

          <Form.Item label="优先级" className="mb-0">
            <Select value={priority} onChange={setPriority} placeholder="请选择优先级">
              {PRIORITY_OPTIONS.map((opt) => (
                <Select.Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </div>

        <Form.Item label="时间范围" required>
          <RangePicker
            className="w-full"
            showTime
            value={dateRange}
            onChange={(v) => setDateRange(v as [Dayjs, Dayjs] | null)}
            disabledDate={disabledDate}
            defaultPickerValue={defaultPickerValue}
            placeholder={['开始时间', '结束时间']}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default AddTaskModal
