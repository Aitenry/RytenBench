import logger from 'electron-log'
import { goalStore } from './runtime/goal'
import type { TurnMeta } from './types'

/**
 * 目标轮次驱动器（goal-round-driver）— 对应 deepseek-harness 的 dsh-goal-round-driver
 *
 * 机制（适配 RytenBench 无事件总线的结构）：
 * - 用户轮次完成后调用 maybeDrive：目标 active + armed（内存武装态）且未达轮次上限时，
 *   自动发起下一轮（注入 <goal_round> 消息 + 目标来源元信息）；
 * - 轮次计数：创建轮为第 1 轮（goal.ts create 时 roundsStarted=1），
 *   自动轮在派发时结算（roundsStarted + 1，即第 2 轮起），保证轮内
 *   update_goal(complete/blocked) 的「精确命中当前目标轮」校验能匹配；
 * - 每话题互斥：同一时间一个话题至多一个自动轮在跑（用户消息被 UI 层串行化，实际不重叠）；
 * - 用户取消自动轮 → 目标 disarm（停止自动续跑，等用户要求「继续」→ resume 重新武装）；
 * - 达轮次上限 → blocked(round-limit) 并停止。
 */

/** 执行一轮对话的回调（由 IPC 层注入，复用 runChatTurn 管线） */
export type DriveTurnFn = (params: {
  topicId: number
  question: string
  turnMeta: TurnMeta
}) => Promise<{ topicId: number; cancelled: boolean }>

export class GoalRoundDriver {
  private readonly running = new Set<number>()

  isRunning(topicId: number): boolean {
    return this.running.has(topicId)
  }

  /** 轮次结束后调度：满足条件则自动发起下一轮（循环派发直至停止条件） */
  async maybeDrive(topicId: number, drive: DriveTurnFn): Promise<void> {
    if (this.running.has(topicId)) return
    // 先占位再 await（修复：此前占用点位于多个 await 之后，「守卫通过」与「占用」之间
    // 存在竞态窗口，两个并发完成点可重复 incrementRound 并双派发自动轮）
    this.running.add(topicId)
    try {
      while (await this.driveOnce(topicId, drive)) {
        // 一轮完成且未达停止条件：继续派发下一轮
      }
    } finally {
      this.running.delete(topicId)
    }
  }

  /** 检查并派发一轮；返回 true 表示本轮已派发完成且应继续检查下一轮 */
  private async driveOnce(topicId: number, drive: DriveTurnFn): Promise<boolean> {
    const goal = await goalStore.load(topicId)
    if (!goal || goal.phase !== 'active' || !goalStore.isArmed(topicId)) {
      if (goal && goal.phase === 'active' && !goalStore.isArmed(topicId)) {
        logger.info(`[GoalDriver] topicId=${topicId} 目标 active 但未武装，不自动续跑`)
      }
      return false
    }

    // 达轮次上限：标记 blocked(round-limit) 并停止
    if (goal.roundsStarted >= goal.maxGoalRounds) {
      try {
        await goalStore.update(topicId, goal.id, goal.revision, 'blocked', {
          blockedReason: {
            code: 'round-limit',
            message: `已达轮次上限（${goal.maxGoalRounds} 轮），自动停止`
          }
        })
      } catch (err) {
        logger.warn('[GoalDriver] 标记 round-limit 失败:', err)
      }
      return false
    }

    // 派发时结算：roundsStarted + 1（round = 结算后的轮次号）
    const updated = await goalStore.incrementRound(topicId)
    if (!updated || updated.phase !== 'active') return false

    const round = updated.roundsStarted
    const question = `<goal_round>
目标：${updated.objective}
（自动续跑第 ${round}/${updated.maxGoalRounds} 轮。请继续推进目标，无需向用户确认。）
- 目标已全部完成：调用 update_goal(action: "complete")；
- 遇到无法自行解决的阻塞且已进行至少 3 轮：调用 update_goal(action: "blocked", blocked_reason: { code, message })；
- 否则直接继续工作。完成后请给出本轮成果的简短说明。
</goal_round>`
    const turnMeta: TurnMeta = {
      source: 'goal-round',
      goalId: updated.id,
      goalRevision: updated.revision,
      goalRound: round,
      objective: updated.objective
    }

    logger.info(
      `[GoalDriver] 派发自动轮 topicId=${topicId} round=${round}/${updated.maxGoalRounds} goalId=${updated.id}`
    )
    try {
      const result = await drive({ topicId, question, turnMeta })
      if (result.cancelled) {
        // 用户取消自动轮：停止自动续跑（armed → disarmed），目标保持 active
        logger.info('[GoalDriver] 自动轮被用户取消，目标 disarm')
        goalStore.disarm(topicId)
        return false
      }
    } catch (err) {
      logger.warn('[GoalDriver] 自动轮执行失败，目标 disarm:', err)
      goalStore.disarm(topicId)
      return false
    }

    return true
  }
}

/** 进程级单例 */
export const goalRoundDriver = new GoalRoundDriver()
