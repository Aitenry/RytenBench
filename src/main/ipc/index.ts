import { registerMiscIpc } from './misc'
import { registerSettingsIpc } from './settings'
import { registerProviderIpc } from './provider'
import { registerDialogIpc } from './dialog'
import { registerPluginsIpc } from './plugins'

/**
 * 内置 IPC 组（主进程插件宿主消费）。
 *
 * harness 轮之后只剩 core 一组：music / planner / home / harness 四个插件都已迁到
 * `src/plugins/<id>/main/`，走 `ctx.registerIpc/registerEvent` 的新契约。
 * 本表与旧路径的 `captureIpc` 捕获机制是**过渡期残留**，下一轮（core 收尾）整体删除，
 * 改成普通的 `registerCoreIpc()`。
 *
 * 归属变更：
 * - `registerWorkspaceIpc()` 原先挂在 core 组（`workspace-*` 9 个通道）——实测只有 harness
 *   渲染层的 WorkspacePanel / FileExplorer / FileDiffView 在用，属「AI 改动复核」能力，
 *   已随 harness 插件迁到 `src/plugins/harness/main/ipc/workspace.ts`；
 * - `registerHarnessIpc()` / `registerHarnessTopicIpc()` / `registerMnemonIpc()` 同批迁走。
 */

/** core 组键名（始终注册，不受插件启停影响） */
export const CORE_IPC_GROUP = 'core'

export const builtinIpcGroups: Record<string, () => void> = {
  [CORE_IPC_GROUP]: () => {
    registerMiscIpc()
    registerSettingsIpc()
    registerDialogIpc()
    registerProviderIpc()
    registerPluginsIpc()
  }
}
