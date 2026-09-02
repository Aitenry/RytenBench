import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import logger from 'electron-log'
import {
  getGoalByTopic,
  upsertGoal,
  deleteGoalByTopic,
  type GoalRow
} from '../../database/mapper/goal'

/**
 * 对话目标系统（goal）— 对应 deepseek-harness 的 dsh-goal / dsh-tool-goal 体系
 *
 * 机制（参考 DSH，适配 RytenBench 按 topicId 组织的对话）：
 * - 每个话题至多一个当前目标（单目标语义）；revision 每次变更 +1，工具更新
 *   必须携带 {goal_id, revision}（CAS 乐观并发，过期即拒 GOAL_STALE_REVISION）；
 * - 状态机：active ⇄ paused / → blocked / → complete；blocked 仅可从 active 进入；
 * - activation（armed/disarmed）为内存态：armed 才允许轮次驱动器自动续跑；
 *   进程重启一律 disarmed（激活态不持久化），用户要求「继续」→ resume 重新武装；
 * - authority 执行期校验：create/edit/pause/resume 须「人类直接请求」（本轮为用户
 *   消息发起）；complete/blocked 接受「人类直接请求」或「精确命中当前目标轮」
 *   （自动续跑轮注入的 goal 来源）；自主轮 blocked 另须 roundsStarted ≥ 3。
 */

/** 目标视图（工具输出与前端展示共用） */
export interface GoalView {
  id: string
  revision: number
  objective: string
  phase: 'active' | 'paused' | 'blocked' | 'complete'
  roundsStarted: number
  maxGoalRounds: number
  blockedReason?: { code: string; message: string }
  /** 内存态：armed=自动续跑已武装 / disarmed=停止自动续跑 */
  activation: 'armed' | 'disarmed'
}

/** 阻塞原因（DSH 使用稳定小写 kebab code 分类） */
export interface GoalBlockedReason {
  code: string
  message: string
}

/** 更新动作（与 DSH update_goal 一致） */
export type GoalUpdateAction = 'edit' | 'pause' | 'resume' | 'complete' | 'blocked'

/** 自主轮（模型自报）允许 blocked 的最小已进行轮数（DSH 默认阈值） */
export const MIN_ROUNDS_FOR_BLOCK = 3
/** 默认轮次上限（DSH goal 默认值） */
export const DEFAULT_MAX_GOAL_ROUNDS = 256

/** 本轮来源（经 graph configurable.turnSource 注入） */
export type TurnSource = 'user' | 'goal-round'

/** 目标轮来源信息（自动续跑轮由驱动器注入，用于 complete/blocked 的轮级权威校验） */
export interface GoalRoundSource {
  goalId: string
  revision: number
  round: number
}

/** 目标工具调用的 configurable 快照 */
interface GoalToolConfig {
  turnSource?: TurnSource
  goalRound?: GoalRoundSource
}

export type GoalUpdateListener = (topicId: number, goal: GoalView | null) => void

/** 目标存储（进程级单例，按 topicId 隔离；PGlite 持久化 + 内存 armed 态） */
export class GoalStore {
  private readonly cache = new Map<number, GoalView>()
  private readonly armedTopics = new Set<number>()

  /** 变更回调（主进程注入，广播 chat-goal-updated） */
  onChange?: GoalUpdateListener

  private static fromRow(row: GoalRow): GoalView {
    let blockedReason: GoalView['blockedReason']
    if (row.blocked_reason) {
      try {
        blockedReason = JSON.parse(row.blocked_reason) as GoalBlockedReason
      } catch {
        blockedReason = { code: 'unknown', message: row.blocked_reason }
      }
    }
    return {
      id: row.goal_id,
      revision: row.revision,
      objective: row.objective,
      phase: row.phase,
      roundsStarted: row.rounds_started,
      maxGoalRounds: row.max_goal_rounds,
      blockedReason,
      activation: 'disarmed'
    }
  }

  /** 读取话题当前目标（DB → 缓存）；armed 态按内存 Set 叠加 */
  async load(topicId: number): Promise<GoalView | null> {
    const cached = this.cache.get(topicId)
    if (cached) {
      return { ...cached, activation: this.armedTopics.has(topicId) ? 'armed' : 'disarmed' }
    }
    try {
      const row = await getGoalByTopic(topicId)
      if (!row) return null
      const view = GoalStore.fromRow(row)
      this.cache.set(topicId, view)
      return { ...view, activation: 'disarmed' }
    } catch (err) {
      logger.error('[Goal] 读取目标失败:', err)
      return null
    }
  }

  /** 持久化并刷新缓存、广播变更 */
  private async persist(topicId: number, view: GoalView): Promise<GoalView> {
    await upsertGoal({
      topic_id: topicId,
      goal_id: view.id,
      revision: view.revision,
      objective: view.objective,
      phase: view.phase,
      rounds_started: view.roundsStarted,
      max_goal_rounds: view.maxGoalRounds,
      blocked_reason: view.blockedReason ? JSON.stringify(view.blockedReason) : null
    })
    this.cache.set(topicId, view)
    logger.info(
      `[Goal] 目标已持久化 topicId=${topicId} id=${view.id} phase=${view.phase} round=${view.roundsStarted}/${view.maxGoalRounds} revision=${view.revision}`
    )
    this.onChange?.(topicId, { ...view, activation: this.isArmed(topicId) ? 'armed' : 'disarmed' })
    return view
  }

  /** CAS 校验：目标 id + revision 必须与当前一致 */
  private assertCurrent(goalId: string, revision: number, view: GoalView | null): GoalView {
    if (!view) throw new Error('当前话题没有目标。请先用 create_goal 创建。')
    if (view.id !== goalId || view.revision !== revision) {
      throw new Error(
        `目标已变更（GOAL_STALE_REVISION）：当前 revision=${view.revision}，你携带的是 ${revision}。请先 get_goal 获取最新状态。`
      )
    }
    return view
  }

  /**
   * 创建目标：仅「无目标」或「已有目标已完成」时可创建（DSH create 语义）。
   * 成功后武装自动续跑（armed）。
   * roundsStarted 从 1 起算：创建目标的这一轮（用户轮）即第 1 轮——
   * 若模型在同一轮内直接完成目标，轮次显示为 1 而非恒 0；
   * 自动续跑轮由驱动器在派发时依次递增（2、3、…）。
   */
  async create(
    topicId: number,
    objective: string,
    maxGoalRounds = DEFAULT_MAX_GOAL_ROUNDS
  ): Promise<GoalView> {
    const current = await this.load(topicId)
    if (current && current.phase !== 'complete') {
      throw new Error(
        `当前已有进行中的目标（phase=${current.phase}）。请先完成/阻塞该目标，或对现有目标使用 update_goal。`
      )
    }
    const view: GoalView = {
      id: `goal-${randomUUID()}`,
      revision: 1,
      objective: objective.trim(),
      phase: 'active',
      roundsStarted: 1,
      maxGoalRounds,
      activation: 'armed'
    }
    const persisted = await this.persist(topicId, view)
    // 持久化成功后再武装（修复：先改内存态后落库,落库失败会留下 armed 但无目标的假状态）
    this.armedTopics.add(topicId)
    logger.info(
      `[Goal] 目标已创建 topicId=${topicId} id=${view.id}（maxGoalRounds=${maxGoalRounds}，创建轮计为第 1 轮）`
    )
    return persisted
  }

  /** 更新目标（CAS + 状态机转移；authority 由调用方（工具层）先行校验） */
  async update(
    topicId: number,
    goalId: string,
    revision: number,
    action: GoalUpdateAction,
    fields?: {
      objective?: string
      maxGoalRounds?: number
      blockedReason?: GoalBlockedReason
    }
  ): Promise<GoalView> {
    const current = await this.load(topicId)
    // 浅拷贝后再修改（修复：此前直接改 load 返回的缓存对象——persist 失败时缓存已携带
    // 未落库的假状态，后续 load/CAS 读到脏数据）
    const base = this.assertCurrent(goalId, revision, current)
    const view: GoalView = { ...base }
    let armChange: 'add' | 'delete' | null = null

    switch (action) {
      case 'edit': {
        if (fields?.objective != null) view.objective = fields.objective.trim()
        if (fields?.maxGoalRounds != null && fields.maxGoalRounds > 0) {
          view.maxGoalRounds = fields.maxGoalRounds
        }
        break
      }
      case 'pause': {
        if (view.phase !== 'active') throw new Error(`当前 phase=${view.phase}，不能暂停。`)
        view.phase = 'paused'
        armChange = 'delete'
        break
      }
      case 'resume': {
        if (view.phase === 'complete') throw new Error('已完成的目标不能恢复。')
        if (view.roundsStarted >= view.maxGoalRounds) {
          throw new Error(`已达轮次上限（${view.maxGoalRounds}），不能恢复。`)
        }
        view.phase = 'active'
        view.blockedReason = undefined
        armChange = 'add'
        break
      }
      case 'complete': {
        if (view.phase === 'complete') throw new Error('目标已完成。')
        view.phase = 'complete'
        armChange = 'delete'
        break
      }
      case 'blocked': {
        if (view.phase !== 'active') throw new Error(`当前 phase=${view.phase}，不能标记阻塞。`)
        view.phase = 'blocked'
        view.blockedReason = fields?.blockedReason ?? {
          code: 'unspecified',
          message: '（未提供原因）'
        }
        armChange = 'delete'
        break
      }
      default:
        throw new Error(`未知 action: ${action}`)
    }

    view.revision += 1
    const persisted = await this.persist(topicId, view)
    // 落库成功后再应用武装态变更（修复：先改内存态后落库，失败时状态分歧）
    if (armChange === 'add') {
      this.armedTopics.add(topicId)
    } else if (armChange === 'delete') {
      this.armedTopics.delete(topicId)
    }
    return persisted
  }

  /** 自动续跑轮次结算：roundsStarted + 1（驱动器在轮次完成后调用） */
  async incrementRound(topicId: number): Promise<GoalView | null> {
    const current = await this.load(topicId)
    if (!current || current.phase !== 'active') return current
    // 拷贝后修改（修复：直接改缓存对象，persist 失败留下未落库的假状态）
    return this.persist(topicId, {
      ...current,
      roundsStarted: current.roundsStarted + 1,
      revision: current.revision + 1
    })
  }

  /** 话题删除时清理目标（DB + 缓存 + 武装态） */
  async delete(topicId: number): Promise<void> {
    this.cache.delete(topicId)
    this.armedTopics.delete(topicId)
    try {
      await deleteGoalByTopic(topicId)
    } catch (err) {
      logger.error('[Goal] 删除目标失败:', err)
    }
  }

  isArmed(topicId: number): boolean {
    return this.armedTopics.has(topicId)
  }

  arm(topicId: number): void {
    this.armedTopics.add(topicId)
  }

  disarm(topicId: number): void {
    this.armedTopics.delete(topicId)
  }
}

/** 进程级单例：跨请求共享（与 todoStore 同一模式） */
export const goalStore = new GoalStore()

/** 从工具 config 提取本轮来源信息 */
function readToolConfig(config?: Record<string, unknown>): GoalToolConfig {
  const c = (config ?? {}) as unknown as GoalToolConfig
  return { turnSource: c.turnSource, goalRound: c.goalRound }
}

/** 是否「人类直接请求」：本轮由用户消息发起（自动续跑轮为 goal-round 来源） */
function isDirectHuman(cfg: GoalToolConfig): boolean {
  return cfg.turnSource !== 'goal-round'
}

/** 是否精确命中当前目标轮（自动续跑轮携带的 goal 来源与当前目标全等） */
function isExactGoalRound(cfg: GoalToolConfig, goal: GoalView): boolean {
  if (cfg.turnSource !== 'goal-round' || !cfg.goalRound) return false
  return (
    cfg.goalRound.goalId === goal.id &&
    cfg.goalRound.revision === goal.revision &&
    cfg.goalRound.round === goal.roundsStarted
  )
}

/** 目标视图 → 工具返回文本（JSON 序列化，模型与前端共用） */
function formatGoal(view: GoalView | null): string {
  if (!view) return JSON.stringify({ goal: null })
  return JSON.stringify({ goal: view })
}

/**
 * 构建目标工具集（仅注入主代理；子代理不持有目标工具）。
 * authority 校验在工具执行期完成（参考 dsh-tool-goal）。
 */
export function buildGoalTools(store: GoalStore, topicId: number): StructuredToolInterface[] {
  const getCurrent = (): Promise<GoalView | null> => store.load(topicId)

  return [
    tool(
      async ({ objective, max_goal_rounds }, config) => {
        const cfg = readToolConfig((config?.configurable ?? {}) as Record<string, unknown>)
        if (!isDirectHuman(cfg)) {
          return 'create_goal 需要人类直接请求（当前为自动续跑轮，无权创建新目标）。'
        }
        try {
          const view = await store.create(topicId, objective, max_goal_rounds)
          return formatGoal(view)
        } catch (err) {
          return `创建目标失败: ${(err as Error).message}`
        }
      },
      {
        name: 'create_goal',
        description:
          '创建一个长期目标：跨多轮自动推进（每轮完成后自动续跑，直至完成、阻塞或达到轮次上限）。一次只能存在一个进行中的目标；已有目标须先 complete/blocked 才能创建新目标。仅当用户明确表达长期任务意图时使用；简单问答不要创建。',
        schema: z.object({
          objective: z.string().describe('目标的具体描述（要完成的客观成果，可被独立验证）'),
          max_goal_rounds: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(`自动续跑的轮次上限（默认 ${DEFAULT_MAX_GOAL_ROUNDS}）`)
        })
      }
    ),
    tool(
      async () => {
        try {
          const view = await getCurrent()
          return formatGoal(view)
        } catch (err) {
          return `读取目标失败: ${(err as Error).message}`
        }
      },
      {
        name: 'get_goal',
        description: '读取当前话题的目标状态（id/revision/phase/轮次等）。',
        schema: z.object({})
      }
    ),
    tool(
      async ({ goal_id, revision, action, objective, max_goal_rounds, blocked_reason }, config) => {
        const cfg = readToolConfig((config?.configurable ?? {}) as Record<string, unknown>)
        try {
          const current = await getCurrent()
          if (!current) return '当前话题没有目标。请先用 create_goal 创建。'

          // authority：edit/pause/resume 仅限人类直接请求；
          // complete/blocked 允许人类直接请求或精确命中当前目标轮（自动续跑轮）
          const direct = isDirectHuman(cfg)
          const exactRound = isExactGoalRound(cfg, current)
          if (action === 'edit' || action === 'pause' || action === 'resume') {
            if (!direct) {
              return `${action} 需要人类直接请求（自动续跑轮无权执行该操作；如确需调整，请在用户消息中说明）。`
            }
          } else if (action === 'complete' || action === 'blocked') {
            if (!direct && !exactRound) {
              return `${action} 无权执行：既非人类直接请求，也非当前目标轮（goal/revision/round 不匹配）。`
            }
            if (action === 'blocked' && !direct && current.roundsStarted < MIN_ROUNDS_FOR_BLOCK) {
              return `自动标记 blocked 至少需要已进行 ${MIN_ROUNDS_FOR_BLOCK} 轮（当前 ${current.roundsStarted} 轮）。若确已无法推进，请在最终回答中向用户说明，由用户决定暂停或调整目标。`
            }
          }

          const view = await store.update(topicId, goal_id, revision, action, {
            objective,
            maxGoalRounds: max_goal_rounds,
            blockedReason: blocked_reason
              ? { code: blocked_reason.code, message: blocked_reason.message }
              : undefined
          })

          // 自主轮 complete/blocked：注入收尾指引（参考 DSH wrapup 指令，不硬截断）
          if (!direct && exactRound && (action === 'complete' || action === 'blocked')) {
            const wrapup =
              action === 'complete'
                ? '目标已标记完成。请在最终回答中给出简短收尾：完成成果、关键证据与后续建议。'
                : `目标已标记阻塞（${view.blockedReason?.code ?? 'unspecified'}）。请在最终回答中向用户说明阻塞原因与可行的下一步。`
            return `${formatGoal(view)}\n\n${wrapup}`
          }
          return formatGoal(view)
        } catch (err) {
          return `更新目标失败: ${(err as Error).message}`
        }
      },
      {
        name: 'update_goal',
        description:
          '更新当前目标：edit（修改目标描述/轮次上限）、pause（暂停）、resume（恢复并继续自动推进）、complete（标记完成）、blocked（标记阻塞，需提供原因）。必须携带 goal_id 与最新 revision（先 get_goal 获取）。edit/pause/resume 仅限人类直接请求；complete/blocked 在自动续跑轮中可直接执行（blocked 需已进行至少 3 轮）。',
        schema: z.object({
          goal_id: z.string().describe('目标 ID（由 create_goal / get_goal 返回）'),
          revision: z
            .number()
            .int()
            .positive()
            .describe('当前 revision（过期会被拒绝，先 get_goal）'),
          action: z
            .enum(['edit', 'pause', 'resume', 'complete', 'blocked'])
            .describe('要执行的操作'),
          objective: z.string().optional().describe('（edit 时）新的目标描述'),
          max_goal_rounds: z
            .number()
            .int()
            .positive()
            .optional()
            .describe('（edit 时）新的轮次上限'),
          blocked_reason: z
            .object({
              code: z
                .string()
                .describe('稳定的小写 kebab 分类，如 round-limit / model-reported / user-paused'),
              message: z.string().describe('阻塞原因说明')
            })
            .optional()
            .describe('（blocked 时）阻塞原因')
        })
      }
    )
  ]
}
