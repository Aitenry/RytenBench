import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'
import type { PlannerTreeNode } from '../../database/mapper/planner'

// ============================================================================
// Shared helpers
// ============================================================================

/** 递归计算节点（含子节点）的聚合完成进度（按工时加权平均），与前端 GanttChart 一致 */
function computeAggregateProgress(node: PlannerTreeNode): number {
  if (node.children.length === 0) return node.progress

  let totalWeight = 0
  let weightedProgress = 0

  for (const child of node.children) {
    const childProgress = computeAggregateProgress(child)
    if (child.work_hours > 0) {
      weightedProgress += child.work_hours * childProgress
      totalWeight += child.work_hours
    }
  }

  if (totalWeight === 0) return node.progress
  return Math.round(weightedProgress / totalWeight)
}

const TYPE_LABELS: Record<string, string> = { project: '项目', phase: '阶段', task: '任务' }

// ============================================================================
// Handlers
// ============================================================================

async function listPlannerTasksHandler(params: { type?: string }): Promise<string> {
  const { getTaskTree } = await import('../../database/mapper/planner')
  const tree = await getTaskTree()
  if (!tree.length) return '还没有规划任务。'

  const flatNodes: { node: PlannerTreeNode; aggregateProgress: number }[] = []

  function walk(nodes: PlannerTreeNode[]): void {
    for (const node of nodes) {
      flatNodes.push({ node, aggregateProgress: computeAggregateProgress(node) })
      walk(node.children)
    }
  }

  walk(tree)

  const filtered = params.type
    ? flatNodes.filter(({ node }) => node.type === params.type)
    : flatNodes

  if (!filtered.length) return '还没有规划任务。'

  const lines = [`**规划任务列表**（共 ${filtered.length} 项）\n`]
  for (const { node, aggregateProgress } of filtered) {
    const type = TYPE_LABELS[node.type] ?? node.type
    const indent = '  '.repeat(node.depth)
    lines.push(`${indent}  [${node.id}] ${node.title}`)
    lines.push(
      `${indent}    类型：${type} | 进度：${aggregateProgress}% | 工时：${node.work_hours}h | 优先级：P${node.priority}`
    )
    if (node.start_date || node.end_date) {
      lines.push(
        `${indent}    日期：${[node.start_date, node.end_date].filter(Boolean).join(' → ')}`
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function getPlannerTreeHandler(): Promise<string> {
  const { getTaskTree } = await import('../../database/mapper/planner')
  const tree = await getTaskTree()
  if (!tree.length) return '还没有规划任务。'
  const lines = ['**规划任务树**\n']

  function renderNode(node: (typeof tree)[0], depth: number): void {
    const indent = '  '.repeat(depth)
    const progress = computeAggregateProgress(node)
    const type = TYPE_LABELS[node.type] ?? node.type
    lines.push(
      `${indent}- ${node.title} [${progress}%] (${type}, ${node.work_hours}h, P${node.priority})`
    )
    if (node.children) {
      for (const child of node.children) renderNode(child, depth + 1)
    }
  }

  for (const node of tree) renderNode(node, 0)
  return lines.join('\n')
}

const VALID_TYPES = ['project', 'phase', 'task'] as const

async function createTaskHandler(params: {
  title?: string
  type?: string
  parent_id?: number | null
  progress?: number
  work_hours?: number
  priority?: number
  start_date?: string
  end_date?: string
}): Promise<string> {
  const { addTask, getTaskTree } = await import('../../database/mapper/planner')

  // ── 必填校验 ──
  if (!params.title?.trim()) return '标题不能为空。'
  if (!params.type || !(VALID_TYPES as readonly string[]).includes(params.type)) {
    return `类型不能为空，支持：${VALID_TYPES.join(', ')}`
  }
  if (params.progress === undefined || params.progress === null) return '进度不能为空（可设为 0）。'
  if (params.progress < 0 || params.progress > 100) return '进度范围 0-100。'
  if (params.work_hours === undefined || params.work_hours === null) return '工时不能为空。'
  if (params.work_hours < 0) return '工时不能为负数。'
  if (params.priority === undefined || params.priority === null) return '优先级不能为空。'
  if (params.priority < 0 || params.priority > 7) {
    return `无效优先级 P${params.priority}，有效范围：P0–P7。`
  }
  if (!params.start_date)
    return '开始日期不能为空（格式 YYYY-MM-DDTHH:mm:ss，如 2026-07-20T09:00:00）。'
  if (!params.end_date)
    return '结束日期不能为空（格式 YYYY-MM-DDTHH:mm:ss，如 2026-07-27T18:00:00）。'

  // ── 父级时间范围约束（与前端 TaskModal 一致）──
  if (params.parent_id) {
    const { getTaskById } = await import('../../database/mapper/planner')
    const parent = await getTaskById(params.parent_id)
    if (parent && parent.start_date && parent.end_date) {
      const pStart = new Date(parent.start_date).getTime()
      const pEnd = new Date(parent.end_date).getTime()
      const tStart = new Date(params.start_date!).getTime()
      const tEnd = new Date(params.end_date!).getTime()
      if (tStart < pStart) {
        return `开始日期不能早于父级「${parent.title}」的开始日期（${parent.start_date}）`
      }
      if (tEnd > pEnd) {
        return `结束日期不能晚于父级「${parent.title}」的结束日期（${parent.end_date}）`
      }
    }
  }

  // ── 项目/阶段不能设置进度，由子节点聚合计算 ──
  if (params.type === 'project' || params.type === 'phase') {
    params.progress = 0
  }

  const priority = params.priority

  const id = await addTask({
    parent_id: params.parent_id ?? null,
    title: params.title,
    type: params.type,
    progress: params.progress,
    work_hours: params.work_hours,
    priority,
    start_date: params.start_date,
    end_date: params.end_date,
    sort_order: 0
  })

  const tree = await getTaskTree()

  // 查找新建节点的路径用于展示
  function findPath(nodes: PlannerTreeNode[], targetId: number, prefix: string[]): string[] | null {
    for (const n of nodes) {
      const path = [...prefix, n.title]
      if (n.id === targetId) return path
      const found = findPath(n.children, targetId, path)
      if (found) return found
    }
    return null
  }

  const path = findPath(tree, id, []) ?? [params.title]
  return `已创建${TYPE_LABELS[params.type] ?? params.type}：[${id}] ${path.join(' > ')}`
}

async function updateTaskHandler(params: {
  id?: number
  title?: string
  progress?: number
  work_hours?: number
  priority?: number
  start_date?: string
  end_date?: string
}): Promise<string> {
  const { updateTask, getTaskById } = await import('../../database/mapper/planner')

  // ── 必填校验 ──
  if (params.id === undefined || params.id === null) return '任务 ID 不能为空。'
  if (!params.title?.trim()) return '标题不能为空。'
  if (params.progress === undefined || params.progress === null) return '进度不能为空（可设为 0）。'
  if (params.progress < 0 || params.progress > 100) return '进度范围 0-100。'
  if (params.work_hours === undefined || params.work_hours === null) return '工时不能为空。'
  if (params.work_hours < 0) return '工时不能为负数。'
  if (params.priority === undefined || params.priority === null) return '优先级不能为空。'
  if (params.priority < 0 || params.priority > 7) {
    return `无效优先级 P${params.priority}，有效范围：P0–P7。`
  }
  if (!params.start_date)
    return '开始日期不能为空（格式 YYYY-MM-DDTHH:mm:ss，如 2026-07-20T09:00:00）。'
  if (!params.end_date)
    return '结束日期不能为空（格式 YYYY-MM-DDTHH:mm:ss，如 2026-07-27T18:00:00）。'

  const existing = await getTaskById(params.id)
  if (!existing) return `未找到 ID 为 ${params.id} 的任务。`

  // ── 项目/阶段不能设置进度，由子节点聚合计算 ──
  if (
    (existing.type === 'project' || existing.type === 'phase') &&
    params.progress !== undefined &&
    params.progress !== existing.progress
  ) {
    return `「${TYPE_LABELS[existing.type]}」类型的进度由子节点聚合计算，不能手动修改。如需更新其他字段，请保持 progress=${existing.progress}。`
  }

  // ── 父级时间范围约束（与前端 TaskModal 一致）──
  if (existing.parent_id) {
    const parent = await getTaskById(existing.parent_id)
    if (parent && parent.start_date && parent.end_date) {
      const pStart = new Date(parent.start_date).getTime()
      const pEnd = new Date(parent.end_date).getTime()
      const tStart = new Date(params.start_date!).getTime()
      const tEnd = new Date(params.end_date!).getTime()
      if (tStart < pStart) {
        return `开始日期不能早于父级「${parent.title}」的开始日期（${parent.start_date}）`
      }
      if (tEnd > pEnd) {
        return `结束日期不能晚于父级「${parent.title}」的结束日期（${parent.end_date}）`
      }
    }
  }

  const updates: Record<string, unknown> = {
    title: params.title,
    progress: Math.max(0, Math.min(100, params.progress)),
    work_hours: params.work_hours,
    priority: params.priority,
    start_date: params.start_date,
    end_date: params.end_date
  }

  await updateTask(params.id, updates as Parameters<typeof updateTask>[1])
  const parts = Object.entries(updates).map(([k, v]) => `${k}=${v}`)
  return `已更新任务 [${params.id}] "${existing.title}"：${parts.join(', ')}`
}

async function deleteTaskHandler(params: { id: number }): Promise<string> {
  const { deleteTask, getTaskTree } = await import('../../database/mapper/planner')

  const tree = await getTaskTree()

  function findNode(nodes: PlannerTreeNode[], targetId: number): PlannerTreeNode | null {
    for (const n of nodes) {
      if (n.id === targetId) return n
      const found = findNode(n.children, targetId)
      if (found) return found
    }
    return null
  }

  const node = findNode(tree, params.id)
  if (!node) return `未找到 ID 为 ${params.id} 的任务。`

  // 统计将被级联删除的子节点数
  function countDescendants(n: PlannerTreeNode): number {
    let count = n.children.length
    for (const c of n.children) count += countDescendants(c)
    return count
  }

  const childCount = countDescendants(node)

  await deleteTask(params.id)
  const detail = childCount > 0 ? `（含 ${childCount} 个子任务）` : ''
  return `已删除${TYPE_LABELS[node.type] ?? node.type}：[${params.id}] "${node.title}"${detail}`
}

async function manageDepsHandler(params: {
  subcommand: string
  taskId?: number
  dependsOnTaskId?: number
}): Promise<string> {
  const { addDependency, deleteDependency, getAllDependencies, getTaskTree } =
    await import('../../database/mapper/planner')

  switch (params.subcommand) {
    case 'list': {
      const deps = await getAllDependencies()
      if (!deps.length) return '还没有任务依赖关系。'
      const tree = await getTaskTree()

      function getTitle(nodes: PlannerTreeNode[], id: number): string {
        for (const n of nodes) {
          if (n.id === id) return n.title
          const found = getTitle(n.children, id)
          if (found) return found
        }
        return `#${id}`
      }

      const lines = ['**依赖关系列表**\n']
      for (const d of deps) {
        lines.push(
          `  [${d.task_id}] ${getTitle(tree, d.task_id)} ← [${d.depends_on_task_id}] ${getTitle(tree, d.depends_on_task_id)}`
        )
      }
      return lines.join('\n')
    }

    case 'add': {
      if (!params.taskId || !params.dependsOnTaskId) {
        return '添加依赖需要提供 taskId 和 dependsOnTaskId'
      }
      if (params.taskId === params.dependsOnTaskId) {
        return '任务不能依赖自身。'
      }
      await addDependency(params.taskId, params.dependsOnTaskId)
      return `已添加依赖：[${params.taskId}] → [${params.dependsOnTaskId}]（[${params.taskId}] 依赖 [${params.dependsOnTaskId}]）`
    }

    case 'delete': {
      if (!params.taskId || !params.dependsOnTaskId) {
        return '删除依赖需要提供 taskId 和 dependsOnTaskId'
      }
      const ok = await deleteDependency(params.taskId, params.dependsOnTaskId)
      return ok
        ? `已删除依赖：[${params.taskId}] → [${params.dependsOnTaskId}]`
        : `未找到依赖：[${params.taskId}] → [${params.dependsOnTaskId}]`
    }

    default:
      return `未知子命令：${params.subcommand}。支持：list, add, delete`
  }
}

// ============================================================================
// Tool Builder
// ============================================================================

export function buildManagePlannerTool(): StructuredToolInterface {
  return tool(
    async ({ command, ...params }) => {
      switch (command) {
        case 'list':
          return listPlannerTasksHandler(params as Parameters<typeof listPlannerTasksHandler>[0])
        case 'tree':
          return getPlannerTreeHandler()
        case 'create':
          return createTaskHandler(params as Parameters<typeof createTaskHandler>[0])
        case 'update':
          return updateTaskHandler(params as Parameters<typeof updateTaskHandler>[0])
        case 'delete':
          return deleteTaskHandler(params as Parameters<typeof deleteTaskHandler>[0])
        case 'deps':
          return manageDepsHandler(params as Parameters<typeof manageDepsHandler>[0])
        default:
          return `未知命令：${command}。支持：list, tree, create, update, delete, deps`
      }
    },
    {
      name: 'manage_planner',
      description:
        '管理规划任务（甘特图）。\n' +
        '  命令：\n' +
        '    list - 列出所有规划任务，可选 type(project/phase/task) 按类型筛选\n' +
        '    tree - 获取层级任务树，含聚合进度、类型、工时、优先级\n' +
        '    create - 创建任务。必填：title, type, progress, work_hours, priority(P0–P7), start_date, end_date；可选：parent_id。日期格式 YYYY-MM-DDTHH:mm:ss。注意：项目/阶段的进度自动置为 0，由子节点聚合计算\n' +
        '    update - 更新任务。必填：id, title, progress, work_hours, priority, start_date, end_date。日期格式同上。注意：项目/阶段不能修改进度，需保持原值\n' +
        '    delete - 删除任务及其所有子任务，需要 id\n' +
        '    deps - 管理依赖关系，子命令：list（列出所有）, add（需要 taskId, dependsOnTaskId）, delete（需要 taskId, dependsOnTaskId）',
      schema: z.object({
        command: z
          .enum(['list', 'tree', 'create', 'update', 'delete', 'deps'])
          .describe('操作类型'),
        // list / tree
        type: z
          .string()
          .optional()
          .describe('[list] 筛选类型 / [create 必填] 任务类型：project/phase/task'),
        // create
        title: z.string().optional().describe('[create/update 必填] 任务标题'),
        parent_id: z.number().nullable().optional().describe('[create] 父任务 ID，顶层任务不传'),
        // create / update 共享
        progress: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe('[create/update 必填] 完成进度 0-100。项目/阶段自动置 0（由子节点聚合）'),
        work_hours: z.number().min(0).optional().describe('[create/update 必填] 工时（小时）'),
        priority: z
          .number()
          .min(0)
          .max(7)
          .optional()
          .describe('[create/update 必填] 优先级 P0(最高)–P7(最低)'),
        start_date: z
          .string()
          .optional()
          .describe(
            '[create/update 必填] 开始日期时间 YYYY-MM-DDTHH:mm:ss，如 2026-07-20T09:00:00'
          ),
        end_date: z
          .string()
          .optional()
          .describe(
            '[create/update 必填] 结束日期时间 YYYY-MM-DDTHH:mm:ss，如 2026-07-27T18:00:00'
          ),
        // update / delete / deps
        id: z.number().optional().describe('[update/delete] 任务 ID'),
        // deps
        subcommand: z.enum(['list', 'add', 'delete']).optional().describe('[deps] 子命令'),
        taskId: z.number().optional().describe('[deps add/delete] 任务 ID'),
        dependsOnTaskId: z.number().optional().describe('[deps add/delete] 所依赖的任务 ID')
      })
    }
  )
}
