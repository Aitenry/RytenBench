import { tool } from '@langchain/core/tools'
import type { StructuredToolInterface } from '@langchain/core/tools'
import * as z from 'zod/v4'
import { getActiveWorkspaceId } from '../../database/workspace-context'

// ============================================================================
// Todo Handlers
// ============================================================================

async function listTodosHandler(params: {
  status?: number
  priority?: number
  page?: number
  pageSize?: number
}): Promise<string> {
  const { getAllTodoItems, getTodoItemsPaginated } = await import('../../database/mapper/todo')
  const { page = 1, pageSize = 20, status, priority } = params
  let items: Array<{
    id: number
    title: string
    status: number
    priority: number
    due_date: string | null
    category: string | null
  }>
  if (status !== undefined || priority !== undefined || page > 1) {
    const result = await getTodoItemsPaginated(getActiveWorkspaceId(), page, pageSize)
    items = result.items
  } else {
    items = await getAllTodoItems(getActiveWorkspaceId())
  }
  if (status !== undefined) items = items.filter((t) => t.status === status)
  if (priority !== undefined) items = items.filter((t) => t.priority === priority)
  if (!items.length) return '没有找到待办事项。'
  const statusLabels = ['待办', '进行中', '已完成']
  const priorityLabels = ['', 'P0-紧急', 'P1-高', 'P2-中', 'P3-低']
  const lines = [`**待办列表**（共 ${items.length} 项）\n`]
  for (const t of items) {
    const s = statusLabels[t.status] ?? `状态${t.status}`
    const p = priorityLabels[t.priority] ?? `P${t.priority}`
    lines.push(`  [${t.id}] ${t.title}`)
    const meta: string[] = [`状态：${s}`, `优先级：${p}`]
    if (t.due_date) meta.push(`截止：${t.due_date}`)
    if (t.category) meta.push(`分类：${t.category}`)
    lines.push(`    ${meta.join(' | ')}`)
    lines.push('')
  }
  return lines.join('\n')
}

async function addTodoHandler(params: {
  title: string
  description?: string
  priority?: number
  due_date?: string
  category?: string
}): Promise<string> {
  const { addTodoItem, getTodoItemById } = await import('../../database/mapper/todo')
  const newId = await addTodoItem(getActiveWorkspaceId(), {
    title: params.title,
    description: params.description || '',
    due_date: params.due_date || null,
    priority: params.priority ?? 2,
    status: 0,
    category: params.category || null,
    completed_at: null,
    started_at: null
  })
  const rows = await getTodoItemById(newId)
  const todo = rows[0]
  return `已创建待办：[${todo.id}] ${todo.title}（优先级 P${todo.priority}${todo.due_date ? `，截止 ${todo.due_date}` : ''}）`
}

async function updateTodoHandler(params: {
  id: number
  title?: string
  description?: string
  status?: number
  priority?: number
  due_date?: string | null
  category?: string
}): Promise<string> {
  const { updateTodoItem, getTodoItemById } = await import('../../database/mapper/todo')
  const rows = await getTodoItemById(params.id)
  if (!rows.length) return `未找到 ID 为 ${params.id} 的待办事项。`
  const existing = rows[0]
  const updates: Record<string, unknown> = {}
  if (params.title !== undefined) updates.title = params.title
  if (params.description !== undefined) updates.description = params.description
  if (params.status !== undefined) updates.status = params.status
  if (params.priority !== undefined) updates.priority = params.priority
  if (params.due_date !== undefined) updates.due_date = params.due_date
  if (params.category !== undefined) updates.category = params.category
  updates.updated_at = new Date().toISOString()
  await updateTodoItem(params.id, updates as Parameters<typeof updateTodoItem>[1])
  return `已更新待办 [${params.id}] ${params.title ?? existing.title}`
}

async function deleteTodoHandler(params: { id: number }): Promise<string> {
  const { deleteTodoItem, getTodoItemById } = await import('../../database/mapper/todo')
  const rows = await getTodoItemById(params.id)
  if (!rows.length) return `未找到 ID 为 ${params.id} 的待办事项。`
  await deleteTodoItem(params.id)
  return `已删除待办 [${params.id}] ${rows[0].title}`
}

// ============================================================================
// Tool Builder
// ============================================================================

export function buildManageTodosTool(): StructuredToolInterface {
  return tool(
    async ({ command, ...params }) => {
      switch (command) {
        case 'list':
          return listTodosHandler(params as Parameters<typeof listTodosHandler>[0])
        case 'add':
          return addTodoHandler(params as Parameters<typeof addTodoHandler>[0])
        case 'update':
          return updateTodoHandler(params as Parameters<typeof updateTodoHandler>[0])
        case 'delete':
          return deleteTodoHandler(params as Parameters<typeof deleteTodoHandler>[0])
        default:
          return `未知命令：${command}。支持：list, add, update, delete`
      }
    },
    {
      name: 'manage_todos',
      description:
        '管理待办事项。\n' +
        '  命令：\n' +
        '    list - 列出待办，可选 status(0=待办/1=进行中/2=已完成), priority(1=紧急/2=高/3=中/4=低), page, pageSize\n' +
        '    add - 创建待办，需要 title，可选 description, priority, due_date(YYYY-MM-DD), category\n' +
        '    update - 更新待办，需要 id，可选 title, description, status, priority, due_date, category\n' +
        '    delete - 删除待办，需要 id',
      schema: z.object({
        command: z.enum(['list', 'add', 'update', 'delete']).describe('操作类型'),
        // list 参数
        status: z.number().optional().describe('[list] 筛选状态：0=待办, 1=进行中, 2=已完成'),
        priority: z
          .number()
          .optional()
          .describe('[list/add/update] 优先级：1=紧急, 2=高, 3=中, 4=低'),
        page: z.number().optional().default(1).describe('[list] 页码'),
        pageSize: z.number().optional().default(20).describe('[list] 每页条数'),
        // add/update 参数
        id: z.number().optional().describe('[update/delete] 待办 ID'),
        title: z.string().optional().describe('[add/update] 待办标题'),
        description: z.string().optional().describe('[add/update] 详细描述'),
        due_date: z.string().optional().describe('[add/update] 截止日期，格式 YYYY-MM-DD'),
        category: z.string().optional().describe('[add/update] 分类标签，如"工作"、"个人"')
      })
    }
  )
}
