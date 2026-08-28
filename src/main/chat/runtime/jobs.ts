import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import logger from 'electron-log'

/**
 * 后台任务系统（jobs）— 对应 deepseek-harness 的 dsh-jobs / dsh-tool-jobs 体系
 *
 * 机制（参考 DSH，适配 RytenBench 按 topicId 组织的对话）：
 * - 进程级注册表：ID 形如 `<kind>-N`（kind=subagent/workflow/…）；
 * - owner 隔离按 topicId：模型工具只能看到本话题的任务；
 * - job_output 流式增量读取（单消费游标）：每次返回上次以来的新增输出，
 *   终态时返回最终输出（幂等）并标记 reported；
 * - wait 语义：阻塞至终态或超时，超时不取消任务、返回当前快照（[status: running]）；
 * - kill：先取消再置 stopping → 终态 killed；已终态返回 already-finished；
 * - settlement first-wins：先提交终态并释放等待者，后广播。
 */

export type JobStatus = 'running' | 'stopping' | 'completed' | 'killed' | 'failed'

/** 任务快照（模型工具与前端共用） */
export interface JobSnapshot {
  id: string
  kind: string
  label: string
  status: JobStatus
  detail?: string
  startedAt: number
  finishedAt?: number
}

interface JobRecord extends JobSnapshot {
  topicId: number
  outputFrames: string[]
  cancelFn?: (reason?: string) => void
  /** 输出游标（job_output 已读取到的帧位置） */
  cursor: number
  /** 终态输出是否已被 job_output 取走 */
  reported: boolean
  settleResolvers: Array<() => void>
}

/** 任务句柄：运行者用它推送输出与结算 */
export interface JobHandle {
  id: string
  /** 追加一段输出（触发等待者） */
  appendOutput: (text: string) => void
  /** 请求取消（由 kill 调用；运行者应尽快结束） */
  cancel: (reason?: string) => void
  /** 结算（first-wins）：completed / failed / killed（取消路径由运行者结算） */
  settle: (status: 'completed' | 'failed' | 'killed', output?: string, error?: string) => void
}

export type JobsUpdateListener = (topicId: number, jobs: JobSnapshot[]) => void

/** 后台任务注册表（进程级单例，按 topicId 隔离） */
export class JobsRegistry {
  private readonly jobs = new Map<string, JobRecord>()
  private readonly counters = new Map<string, number>()

  /** 变更回调（主进程注入，广播 chat-jobs-updated） */
  onChange?: JobsUpdateListener

  /** 启动任务：返回句柄（ID 自动分配 `<kind>-N`；idOverride 用于会话型任务复用固定 ID） */
  start(topicId: number, kind: string, label: string, idOverride?: string): JobHandle {
    const id =
      idOverride ??
      ((): string => {
        const n = (this.counters.get(kind) ?? 0) + 1
        this.counters.set(kind, n)
        return `${kind}-${n}`
      })()
    if (idOverride) {
      const match = /^(.+)-(\d+)$/.exec(idOverride)
      if (match) {
        const n = Number(match[2])
        if (Number.isFinite(n) && n > (this.counters.get(match[1]) ?? 0)) {
          this.counters.set(match[1], n)
        }
      }
    }
    const record: JobRecord = {
      id,
      kind,
      label,
      status: 'running',
      startedAt: Date.now(),
      topicId,
      outputFrames: [],
      cursor: 0,
      reported: false,
      settleResolvers: []
    }
    this.jobs.set(id, record)
    this.broadcast(topicId)
    return {
      id,
      appendOutput: (text) => {
        if (record.status !== 'running') return
        record.outputFrames.push(text)
        this.wakeWaiters(record)
      },
      cancel: (reason) => {
        record.cancelFn?.(reason)
      },
      settle: (status, output, error) => {
        if (record.status !== 'running' && record.status !== 'stopping') return // first-wins
        if (output) record.outputFrames.push(output)
        record.status = status
        record.finishedAt = Date.now()
        if (error) record.detail = error
        this.wakeWaiters(record)
        this.broadcast(topicId)
        logger.info(`[Jobs] 任务 ${id} 结算为 ${status}`)
      }
    }
  }

  /** 绑定取消回调（运行者在启动时注册） */
  attachCancel(id: string, fn: (reason?: string) => void): void {
    const record = this.jobs.get(id)
    if (record) record.cancelFn = fn
  }

  /** 话题内任务快照列表 */
  list(topicId: number): JobSnapshot[] {
    return [...this.jobs.values()].filter((j) => j.topicId === topicId).map((j) => this.snapshot(j))
  }

  get(id: string): JobSnapshot | undefined {
    const record = this.jobs.get(id)
    return record ? this.snapshot(record) : undefined
  }

  /** 增量读取：返回上次以来的新增输出；终态时返回最终输出（幂等，标记 reported） */
  read(id: string, topicId: number): { text: string; job: JobSnapshot | undefined } {
    const record = this.jobs.get(id)
    if (!record || record.topicId !== topicId) {
      return { text: `任务 ${id} 不存在或不属于当前话题。`, job: undefined }
    }
    const frames = record.outputFrames.slice(record.cursor)
    record.cursor = record.outputFrames.length
    let text = frames.join('\n')
    const terminal = record.status !== 'running' && record.status !== 'stopping'
    if (terminal && !record.reported) {
      record.reported = true
      if (!text) text = record.detail ?? `（任务已${record.status}）`
    }
    return { text, job: this.snapshot(record) }
  }

  /** 等待任务至终态或超时（超时不取消任务） */
  async wait(
    id: string,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<{ text: string; job: JobSnapshot | undefined; timedOut: boolean }> {
    const record = this.jobs.get(id)
    if (!record) return { text: `任务 ${id} 不存在。`, job: undefined, timedOut: false }
    const terminal = (r: JobRecord): boolean => r.status !== 'running' && r.status !== 'stopping'
    if (terminal(record)) return { ...this.read(id, record.topicId), timedOut: false }
    const deadline = Date.now() + timeoutMs
    while (!terminal(record) && Date.now() < deadline && !signal?.aborted) {
      await new Promise<void>((resolve) => {
        record.settleResolvers.push(resolve)
        setTimeout(resolve, Math.min(250, Math.max(10, deadline - Date.now())))
      })
    }
    if (!terminal(record)) {
      return {
        text: this.read(id, record.topicId).text,
        job: this.snapshot(record),
        timedOut: true
      }
    }
    return { ...this.read(id, record.topicId), timedOut: false }
  }

  /** 终止任务：已终态返回 already-finished；否则 cancel + stopping → killed */
  kill(
    id: string,
    topicId: number,
    reason?: string
  ): {
    outcome: 'cancellation-requested' | 'already-finished' | 'not-found'
    job: JobSnapshot | undefined
  } {
    const record = this.jobs.get(id)
    if (!record || record.topicId !== topicId) {
      return { outcome: 'not-found', job: undefined }
    }
    const terminal = record.status !== 'running' && record.status !== 'stopping'
    if (terminal) return { outcome: 'already-finished', job: this.snapshot(record) }
    record.status = 'stopping'
    record.detail = reason || '（用户请求终止）'
    record.cancelFn?.(reason)
    // 运行者应在 cancel 后自行 settle(killed)；兜底：5 秒后仍未结算则强制 killed
    setTimeout(() => {
      const current = this.jobs.get(id)
      if (current && (current.status === 'stopping' || current.status === 'running')) {
        current.status = 'killed'
        current.finishedAt = Date.now()
        this.wakeWaiters(current)
        this.broadcast(current.topicId)
        logger.warn(`[Jobs] 任务 ${id} 取消超时，强制 killed`)
      }
    }, 5000)
    this.broadcast(topicId)
    return { outcome: 'cancellation-requested', job: this.snapshot(record) }
  }

  /** 话题删除时清理任务（先全部 kill） */
  clearTopic(topicId: number): void {
    for (const record of [...this.jobs.values()]) {
      if (record.topicId !== topicId) continue
      if (record.status === 'running' || record.status === 'stopping') {
        record.cancelFn?.('话题已删除')
        record.status = 'killed'
        record.finishedAt = Date.now()
      }
      this.jobs.delete(record.id)
    }
  }

  private snapshot(record: JobRecord): JobSnapshot {
    return {
      id: record.id,
      kind: record.kind,
      label: record.label,
      status: record.status,
      detail: record.detail,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt
    }
  }

  private wakeWaiters(record: JobRecord): void {
    while (record.settleResolvers.length > 0) {
      record.settleResolvers.shift()?.()
    }
  }

  private broadcast(topicId: number): void {
    this.onChange?.(topicId, this.list(topicId))
  }
}

/** 进程级单例 */
export const jobsRegistry = new JobsRegistry()

/** job_output 默认/上限等待时间（对齐 DSH：默认 30s、上限 10min） */
export const JOB_WAIT_DEFAULT_MS = 30_000
export const JOB_WAIT_MAX_MS = 600_000

/** 构建后台任务工具集（仅注入主代理；任务归属当前话题） */
export function buildJobTools(registry: JobsRegistry, topicId: number): StructuredToolInterface[] {
  return [
    tool(
      async ({ job_id, wait, timeout_ms }, config) => {
        if (wait) {
          const timeout = Math.min(JOB_WAIT_MAX_MS, Math.max(1, timeout_ms ?? JOB_WAIT_DEFAULT_MS))
          const result = await registry.wait(job_id, timeout, config?.signal ?? undefined)
          const text = result.text || `（任务 ${job_id} 暂无新输出）`
          const statusLine = result.timedOut
            ? '\n[status: running]'
            : `\n[status: ${result.job?.status ?? 'unknown'}]`
          return `${text}${statusLine}`
        }
        const { text, job } = registry.read(job_id, topicId)
        const statusLine = job ? `\n[status: ${job.status}]` : ''
        return `${text || `（任务 ${job_id} 暂无新输出）`}${statusLine}`
      },
      {
        name: 'job_output',
        description:
          '读取后台任务的最新输出（自上次读取以来的增量）。wait=true 时阻塞等待任务进入终态或超时（超时不取消任务，返回当前快照并标注 [status: running]）。',
        schema: z.object({
          job_id: z.string().describe('任务 ID（由启动任务的工具返回，如 subagent-1）'),
          wait: z
            .boolean()
            .optional()
            .describe(
              `是否等待任务完成（默认 false 立即返回；等待上限 ${JOB_WAIT_MAX_MS / 1000} 秒）`
            ),
          timeout_ms: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              `wait=true 时的等待毫秒数（默认 ${JOB_WAIT_DEFAULT_MS}，上限 ${JOB_WAIT_MAX_MS}）`
            )
        })
      }
    ),
    tool(
      async () => {
        return JSON.stringify({ jobs: registry.list(topicId) })
      },
      {
        name: 'job_list',
        description: '列出当前话题的全部后台任务（含运行中与已终态）及其状态。',
        schema: z.object({})
      }
    ),
    tool(
      async ({ job_id, reason }) => {
        const { outcome, job } = registry.kill(job_id, topicId, reason)
        return JSON.stringify({ outcome, job: job ?? null })
      },
      {
        name: 'job_kill',
        description: '终止一个后台任务（请求取消；任务可能已完成则返回 already-finished）。',
        schema: z.object({
          job_id: z.string().describe('要终止的任务 ID'),
          reason: z.string().optional().describe('终止原因（可选）')
        })
      }
    )
  ]
}
