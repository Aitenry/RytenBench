import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'

/**
 * 待办工具集 — 对话中模型制定的任务计划（write_todos / read_todos）
 *
 * schema 与前端渲染契约保持一致：
 *   { todos: [{ content, status: "pending"|"in_progress"|"completed", activeForm }] }
 *
 * 生命周期（2026-08-20 重构）：
 * - 进程级单例（跨请求、跨轮次存在）：模型在多轮对话中持续用 write_todos 维护计划，
 *   后续轮次 read_todos 仍能读到（原实现每请求一个实例、运行结束清空，计划无法跨轮）；
 * - 按 topicId 隔离：每个对话话题一份清单，互不串扰；
 * - 写入即触发 onChange（由主进程注入，广播 harness-todos-updated 事件，
 *   驱动输入框上方的进行中任务卡片实时更新）。
 */

export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

export type TodoUpdateListener = (topicId: number, todos: TodoItem[]) => void

/** 对话待办存储（进程级单例，按 topicId 隔离） */
export class TodoStore {
  private readonly itemsByTopic = new Map<number, TodoItem[]>()

  /** 变更回调（主进程注入，用于向渲染进程广播） */
  onChange?: TodoUpdateListener

  set(topicId: number, todos: TodoItem[]): TodoItem[] {
    this.itemsByTopic.set(topicId, todos)
    this.onChange?.(topicId, todos)
    return todos
  }

  get(topicId: number): TodoItem[] {
    return this.itemsByTopic.get(topicId) ?? []
  }

  /** 删除话题时清理对应清单 */
  clear(topicId: number): void {
    this.itemsByTopic.delete(topicId)
  }
}

/** 进程级单例：跨请求共享，供 Runtime 与主进程广播使用 */
export const todoStore = new TodoStore()

/**
 * 收尾清单：把仍停在 in_progress 的项结为 completed（未写入时返回 null）。
 *
 * 为什么需要它：清单是模型自己写的，而收尾书写并不可靠——2026-09-18 实例：工作全部做完、
 * 回答也交付了，最后一次 write_todos 仍留一项 in_progress，卡片于是永远停在
 * 「5/6 已完成 · 1 进行中」。清单描述的是「本轮的任务」，本轮正常交付就不该再有进行中。
 *
 * 调用方负责判定「本轮算不算正常结束」（用户停止 / 流失败 / 挂着提问 / 目标续跑轮都不算），
 * 这里只做状态收敛；写入走 store.set，因此照常广播 harness-todos-updated。
 */
export function closeOutInProgress(
  store: TodoStore,
  topicId: number
): { completed: number; total: number } | null {
  const todos = store.get(topicId)
  if (!todos.some((t) => t.status === 'in_progress')) return null
  const closed = todos.map((t) =>
    t.status === 'in_progress' ? { ...t, status: 'completed' as const } : t
  )
  store.set(topicId, closed)
  return { completed: closed.filter((t) => t.status === 'completed').length, total: closed.length }
}

/** 构建待办工具集（闭包绑定 topicId，保证清单归属当前对话） */
export function buildTodoTools(store: TodoStore, topicId: number): StructuredToolInterface[] {
  const todoSchema = z.object({
    content: z.string().describe('Content of the todo item'),
    status: z
      .enum(['pending', 'in_progress', 'completed'])
      .describe('Status: pending / in_progress / completed'),
    activeForm: z
      .string()
      .optional()
      .describe('Present-tense phrasing of the work in progress (the action being performed now)')
  })

  return [
    tool(
      async ({ todos }) => {
        const normalized = todos.map((t) => ({
          content: t.content,
          status: t.status ?? 'pending',
          activeForm: t.activeForm
        }))
        store.set(topicId, normalized)
        return JSON.stringify({ todos: store.get(topicId) })
      },
      {
        name: 'write_todos',
        description:
          'Write or update the todo list for the current task. For multi-step work, list every todo up front (all pending), then advance one item at a time: set an item to in_progress the moment you start it, set it to completed when it is done, and only then start the next item. Submit each status change as it happens; never wait until every step is finished and then update the whole list at once. Before you write the final answer for the turn, the list must reflect the final state: close out every finished item with completed, and leave an item in_progress only when the turn really stops mid-work (for example you are asking the user something).',
        schema: z.object({
          todos: z.array(todoSchema).describe('The todo list (replaces the previous list entirely)')
        })
      }
    ),
    tool(
      async () => {
        return JSON.stringify({ todos: store.get(topicId) })
      },
      {
        name: 'read_todos',
        description: 'Read the todo list for the current task.',
        schema: z.object({})
      }
    )
  ]
}
