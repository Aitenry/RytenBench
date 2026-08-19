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
 * - 写入即触发 onChange（由主进程注入，广播 chat-todos-updated 事件，
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

/** 构建待办工具集（闭包绑定 topicId，保证清单归属当前对话） */
export function buildTodoTools(store: TodoStore, topicId: number): StructuredToolInterface[] {
  const todoSchema = z.object({
    content: z.string().describe('待办事项内容'),
    status: z
      .enum(['pending', 'in_progress', 'completed'])
      .describe('状态：pending 待办 / in_progress 进行中 / completed 已完成'),
    activeForm: z.string().optional().describe('进行中的具体表述（如当前正在执行的动作）')
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
          '写入/更新当前任务的待办清单。多步任务开始时先列出全部待办（均置为 pending），然后逐项推进：开始执行某一步时立即将该步更新为 in_progress，完成后再更新为 completed，再开始下一步。每步的状态变化都要及时提交，禁止等到所有步骤全部完成后再一次性更新整份清单。',
        schema: z.object({
          todos: z.array(todoSchema).describe('待办清单（整体替换）')
        })
      }
    ),
    tool(
      async () => {
        return JSON.stringify({ todos: store.get(topicId) })
      },
      {
        name: 'read_todos',
        description: '读取当前任务的待办清单。',
        schema: z.object({})
      }
    )
  ]
}
