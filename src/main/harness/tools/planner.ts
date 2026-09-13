import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'
import type { PlannerTreeNode } from '../../database/mapper/planner'
import { mainFormat, mainPlural } from '../../i18n'
import { getPlannerToolTexts } from '../../i18n/tool-results-planner'

// ============================================================================
// Shared helpers
// ============================================================================

/** 递归计算节点（含子节点）的聚合完成进度（按工时加权平均），与前端 GanttChart 一致 */
function computeAggregateProgress(node: PlannerTreeNode): number {
  // progress / work_hours 库列为可空（DEFAULT 0），null 按 0 处理
  if (node.children.length === 0) return node.progress ?? 0

  let totalWeight = 0
  let weightedProgress = 0

  for (const child of node.children) {
    const childProgress = computeAggregateProgress(child)
    const childHours = child.work_hours ?? 0
    if (childHours > 0) {
      weightedProgress += childHours * childProgress
      totalWeight += childHours
    }
  }

  if (totalWeight === 0) return node.progress ?? 0
  return Math.round(weightedProgress / totalWeight)
}

// ============================================================================
// Handlers
// ============================================================================

async function listPlannerTasksHandler(params: { type?: string }): Promise<string> {
  const tr = getPlannerToolTexts()
  const { getTaskTree } = await import('../../database/mapper/planner')
  const tree = await getTaskTree()
  if (!tree.length) return tr.common.noTasks

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

  if (!filtered.length) return tr.common.noTasks

  const lines = [
    mainPlural(tr.planner.listHeader_one, tr.planner.listHeader_other, filtered.length)
  ]
  for (const { node, aggregateProgress } of filtered) {
    const type = typeLabel(tr, node.type)
    const indent = '  '.repeat(node.depth)
    lines.push(`${indent}  [${node.id}] ${node.title}`)
    lines.push(
      `${indent}    ${mainFormat(tr.planner.meta, {
        type,
        progress: aggregateProgress,
        hours: node.work_hours,
        priority: node.priority
      })}`
    )
    if (node.start_date || node.end_date) {
      lines.push(
        `${indent}    ${mainFormat(tr.planner.dateRange, {
          range: [node.start_date, node.end_date].filter(Boolean).join(' → ')
        })}`
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function getPlannerTreeHandler(): Promise<string> {
  const tr = getPlannerToolTexts()
  const { getTaskTree } = await import('../../database/mapper/planner')
  const tree = await getTaskTree()
  if (!tree.length) return tr.common.noTasks
  const lines = [tr.planner.treeHeader]

  function renderNode(node: (typeof tree)[0], depth: number): void {
    const indent = '  '.repeat(depth)
    const progress = computeAggregateProgress(node)
    const type = typeLabel(tr, node.type)
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

/** 任务类型标签；未知类型原样回退（词条 unknown 即 {{type}}），避免把数据当文案 */
function typeLabel(tr: ReturnType<typeof getPlannerToolTexts>, type: string): string {
  const key = (VALID_TYPES as readonly string[]).includes(type) ? type : 'unknown'
  return mainFormat(tr.typeLabels[key as keyof typeof tr.typeLabels], { type })
}

/** update 回显里的字段名；未在词条表里的 key 原样输出（数据不是文案） */
function fieldLabel(tr: ReturnType<typeof getPlannerToolTexts>, key: string): string {
  const labels = tr.planner.fieldLabels as Record<string, string>
  return labels[key] ?? key
}

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
  const tr = getPlannerToolTexts()
  const { addTask, getTaskTree } = await import('../../database/mapper/planner')

  // ── 必填校验 ──
  if (!params.title?.trim()) return tr.planner.validation.titleRequired
  if (!params.type || !(VALID_TYPES as readonly string[]).includes(params.type)) {
    return mainFormat(tr.planner.validation.typeRequired, { types: VALID_TYPES.join(', ') })
  }
  if (params.progress === undefined || params.progress === null)
    return tr.planner.validation.progressRequired
  if (params.progress < 0 || params.progress > 100) return tr.planner.validation.progressRange
  if (params.work_hours === undefined || params.work_hours === null)
    return tr.planner.validation.workHoursRequired
  if (params.work_hours < 0) return tr.planner.validation.workHoursNegative
  if (params.priority === undefined || params.priority === null)
    return tr.planner.validation.priorityRequired
  if (params.priority < 0 || params.priority > 7) {
    return mainFormat(tr.planner.validation.priorityRange, { priority: params.priority })
  }
  if (!params.start_date)
    return mainFormat(tr.planner.validation.startRequired, { example: '2026-07-20T09:00:00' })
  if (!params.end_date)
    return mainFormat(tr.planner.validation.endRequired, { example: '2026-07-27T18:00:00' })
  // 时间倒挂校验（修复：此前允许结束早于开始,甘特图出现倒挂任务）
  if (new Date(params.start_date).getTime() > new Date(params.end_date).getTime()) {
    return tr.planner.validation.endBeforeStart
  }

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
        return mainFormat(tr.planner.validation.parentStartBound, {
          parentTitle: parent.title,
          parentStart: parent.start_date
        })
      }
      if (tEnd > pEnd) {
        return mainFormat(tr.planner.validation.parentEndBound, {
          parentTitle: parent.title,
          parentEnd: parent.end_date
        })
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
  return mainFormat(tr.planner.created, {
    type: typeLabel(tr, params.type),
    id,
    path: path.join(' > ')
  })
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
  const tr = getPlannerToolTexts()
  const { updateTask, getTaskById } = await import('../../database/mapper/planner')

  // ── 部分更新语义（修复：此前 schema 全 optional 却强制全字段必填,模型只传 id+改项
  // 即被判「进度不能为空」,需多轮往返）──
  if (params.id === undefined || params.id === null) return tr.planner.validation.taskIdRequired
  if (params.title !== undefined && !params.title.trim()) return tr.planner.validation.titleRequired
  if (params.progress !== undefined && (params.progress < 0 || params.progress > 100))
    return tr.planner.validation.progressRange
  if (params.work_hours !== undefined && params.work_hours < 0)
    return tr.planner.validation.workHoursNegative
  if (params.priority !== undefined && (params.priority < 0 || params.priority > 7)) {
    return mainFormat(tr.planner.validation.priorityRange, { priority: params.priority })
  }

  const existing = await getTaskById(params.id)
  if (!existing) return mainFormat(tr.planner.validation.taskNotFound, { id: params.id })

  // ── 项目/阶段不能设置进度，由子节点聚合计算 ──
  if (
    (existing.type === 'project' || existing.type === 'phase') &&
    params.progress !== undefined &&
    params.progress !== existing.progress
  ) {
    return mainFormat(tr.planner.aggregateProgress, {
      type: typeLabel(tr, existing.type),
      progress: existing.progress
    })
  }

  const effStart = params.start_date ?? existing.start_date
  const effEnd = params.end_date ?? existing.end_date

  // ── 时间倒挂 + 父级时间范围约束（修复：此前不校验自身 start<=end）──
  if (effStart && effEnd) {
    if (new Date(effStart).getTime() > new Date(effEnd).getTime()) {
      return tr.planner.validation.endBeforeStart
    }
    if (existing.parent_id) {
      const parent = await getTaskById(existing.parent_id)
      if (parent && parent.start_date && parent.end_date) {
        const pStart = new Date(parent.start_date).getTime()
        const pEnd = new Date(parent.end_date).getTime()
        if (new Date(effStart).getTime() < pStart) {
          return mainFormat(tr.planner.validation.parentStartBound, {
            parentTitle: parent.title,
            parentStart: parent.start_date
          })
        }
        if (new Date(effEnd).getTime() > pEnd) {
          return mainFormat(tr.planner.validation.parentEndBound, {
            parentTitle: parent.title,
            parentEnd: parent.end_date
          })
        }
      }
    }
  }

  const updates: Record<string, unknown> = {}
  if (params.title !== undefined) updates.title = params.title
  if (params.progress !== undefined) updates.progress = Math.max(0, Math.min(100, params.progress))
  if (params.work_hours !== undefined) updates.work_hours = params.work_hours
  if (params.priority !== undefined) updates.priority = params.priority
  if (params.start_date !== undefined) updates.start_date = params.start_date
  if (params.end_date !== undefined) updates.end_date = params.end_date

  if (Object.keys(updates).length === 0) return tr.planner.validation.fieldsRequired

  await updateTask(params.id, updates as Parameters<typeof updateTask>[1])
  const parts = Object.entries(updates).map(([k, v]) => `${fieldLabel(tr, k)}=${v}`)
  return mainFormat(tr.planner.updated, {
    id: params.id,
    title: existing.title,
    fields: parts.join(', ')
  })
}

async function deleteTaskHandler(params: { id: number }): Promise<string> {
  const tr = getPlannerToolTexts()
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
  if (!node) return mainFormat(tr.planner.validation.taskNotFound, { id: params.id })

  // 统计将被级联删除的子节点数
  function countDescendants(n: PlannerTreeNode): number {
    let count = n.children.length
    for (const c of n.children) count += countDescendants(c)
    return count
  }

  const childCount = countDescendants(node)

  await deleteTask(params.id)
  const detail =
    childCount > 0
      ? mainPlural(tr.planner.deletedChildren_one, tr.planner.deletedChildren_other, childCount)
      : ''
  return mainFormat(tr.planner.deleted, {
    type: typeLabel(tr, node.type),
    id: params.id,
    title: node.title,
    detail
  })
}

async function manageDepsHandler(params: {
  subcommand: string
  taskId?: number
  dependsOnTaskId?: number
}): Promise<string> {
  const tr = getPlannerToolTexts()
  const { addDependency, deleteDependency, getAllDependencies, getTaskTree } =
    await import('../../database/mapper/planner')

  switch (params.subcommand) {
    case 'list': {
      const deps = await getAllDependencies()
      if (!deps.length) return tr.planner.deps.empty
      const tree = await getTaskTree()

      function getTitle(nodes: PlannerTreeNode[], id: number): string {
        for (const n of nodes) {
          if (n.id === id) return n.title
          const found = getTitle(n.children, id)
          if (found) return found
        }
        return `#${id}`
      }

      const lines = [tr.planner.deps.header]
      for (const d of deps) {
        lines.push(
          `  [${d.task_id}] ${getTitle(tree, d.task_id)} ← [${d.depends_on_task_id}] ${getTitle(tree, d.depends_on_task_id)}`
        )
      }
      return lines.join('\n')
    }

    case 'add': {
      if (!params.taskId || !params.dependsOnTaskId) {
        return tr.planner.deps.addNeedsIds
      }
      if (params.taskId === params.dependsOnTaskId) {
        return tr.planner.deps.selfDependency
      }
      await addDependency(params.taskId, params.dependsOnTaskId)
      return mainFormat(tr.planner.deps.added, {
        taskId: params.taskId,
        dependsOnTaskId: params.dependsOnTaskId
      })
    }

    case 'delete': {
      if (!params.taskId || !params.dependsOnTaskId) {
        return tr.planner.deps.deleteNeedsIds
      }
      const ok = await deleteDependency(params.taskId, params.dependsOnTaskId)
      return ok
        ? mainFormat(tr.planner.deps.removed, {
            taskId: params.taskId,
            dependsOnTaskId: params.dependsOnTaskId
          })
        : mainFormat(tr.planner.deps.notFound, {
            taskId: params.taskId,
            dependsOnTaskId: params.dependsOnTaskId
          })
    }

    default:
      return mainFormat(tr.common.unknownSubcommand, {
        subcommand: params.subcommand,
        supported: 'list, add, delete'
      })
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
          return mainFormat(getPlannerToolTexts().common.unknownCommand, {
            command,
            supported: 'list, tree, create, update, delete, deps'
          })
      }
    },
    {
      name: 'manage_planner',
      description:
        'Manage planner tasks (Gantt chart).\n' +
        '  Commands:\n' +
        '    list - List all planner tasks; the optional type (project/phase/task) filters by task type\n' +
        '    tree - Get the hierarchical task tree with aggregated progress, type, work hours, and priority\n' +
        '    create - Create a task. Required: title, type, progress, work_hours, priority (P0–P7), start_date, end_date; optional: parent_id. Date format YYYY-MM-DDTHH:mm:ss. Note: project/phase progress is forced to 0 and aggregated from child nodes\n' +
        '    update - Update a task. Required: id, title, progress, work_hours, priority, start_date, end_date. Same date format as above. Note: project/phase progress cannot be modified and must keep its current value\n' +
        '    delete - Delete a task and all of its subtasks; requires id\n' +
        '    deps - Manage task dependencies; subcommands: list (list all), add (requires taskId, dependsOnTaskId), delete (requires taskId, dependsOnTaskId)',
      schema: z.object({
        command: z
          .enum(['list', 'tree', 'create', 'update', 'delete', 'deps'])
          .describe('Operation type'),
        // list / tree
        type: z
          .string()
          .optional()
          .describe('[list] Filter by task type / [create required] Task type: project/phase/task'),
        // create
        title: z.string().optional().describe('[create/update required] Task title'),
        parent_id: z
          .number()
          .nullable()
          .optional()
          .describe('[create] Parent task ID; omit for a top-level task'),
        // create / update 共享
        progress: z
          .number()
          .min(0)
          .max(100)
          .optional()
          .describe(
            '[create/update required] Completion progress 0-100. project/phase is forced to 0 (aggregated from children)'
          ),
        work_hours: z.number().min(0).optional().describe('[create/update required] Work hours'),
        priority: z
          .number()
          .min(0)
          .max(7)
          .optional()
          .describe('[create/update required] Priority P0 (highest)–P7 (lowest)'),
        start_date: z
          .string()
          .optional()
          .describe(
            '[create/update required] Start date-time YYYY-MM-DDTHH:mm:ss, e.g. 2026-07-20T09:00:00'
          ),
        end_date: z
          .string()
          .optional()
          .describe(
            '[create/update required] End date-time YYYY-MM-DDTHH:mm:ss, e.g. 2026-07-27T18:00:00'
          ),
        // update / delete / deps
        id: z.number().optional().describe('[update/delete] Task ID'),
        // deps
        subcommand: z.enum(['list', 'add', 'delete']).optional().describe('[deps] Subcommand'),
        taskId: z.number().optional().describe('[deps add/delete] Task ID'),
        dependsOnTaskId: z
          .number()
          .optional()
          .describe('[deps add/delete] ID of the task it depends on')
      })
    }
  )
}
