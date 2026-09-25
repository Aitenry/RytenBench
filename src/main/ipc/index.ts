import { registerMiscIpc } from './misc'
import { registerSettingsIpc } from './settings'
import { registerHarnessIpc } from './harness'
import { registerHarnessTopicIpc } from './harness-topic'
import { registerMnemonIpc } from './mnemon'
import { registerWorkspaceIpc } from './workspace'
import { registerProviderIpc } from './provider'
import { registerDialogIpc } from './dialog'
import { registerPluginsIpc } from './plugins'

/**
 * 内置 IPC 组（主进程插件宿主消费）。
 * - core 组始终注册（shell 骨架与全局能力）；
 * - 插件组随对应插件启用/停用注册/注销（经 plugins/host.ts 的 captureIpc 捕获通道后回滚）。
 *
 * music / planner / home 已迁到自包含插件目录（`src/plugins/<id>/main/`，走 ctx.registerIpc
 * 的新契约），因此不再有这三个分组——新迁移的插件都不要在这里登记通道。
 * 剩下的旧路径分组只有 harness（含 harness/harness-topic/mnemon）。
 *
 * 归属变更：`registerGraphIpc()` 原先挂在 core 组常驻（理由是渲染层
 * `BuildProgressProvider` 无条件订阅图谱构建进度事件）；graph 已随 home 插件迁走，
 * 由 home 的 `ctx.registerIpc/registerEvent` 按启停注册。渲染层订阅改为可失败降级
 * （见 providers/BuildProgressProvider.tsx），停用 home 不再白屏。
 */

/** core 组键名（始终注册，不受插件启停影响） */
export const CORE_IPC_GROUP = 'core'

export const builtinIpcGroups: Record<string, () => void> = {
  [CORE_IPC_GROUP]: () => {
    registerMiscIpc()
    registerSettingsIpc()
    registerDialogIpc()
    registerProviderIpc()
    registerWorkspaceIpc()
    registerPluginsIpc()
  },
  harness: () => {
    registerHarnessIpc()
    registerHarnessTopicIpc()
    registerMnemonIpc()
  }
}
