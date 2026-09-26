import type { MainPluginContext } from '../../../main/plugins/context'
import { PLUGIN_PURGE } from '../../../main/plugins/contributions'
import { HARNESS_TOOL_CONTRIBUTION } from '../../../main/plugins/tool-contract'
import { plannerIpcHandlers } from './ipc'
import { purgePlannerData } from './purge'
import { plannerToolContributions } from './tools'

/**
 * planner 插件主进程入口（契约见 src/plugins/README.md）。
 *
 * - `ctx.registerIpc`：10 个 `plugin:planner:*` 通道（任务增删改查/排序 + 依赖关系），
 *   停用或卸载时随 `ctx.dispose()` 一并摘除——宿主侧无需知道计划视图的存在；
 * - `ctx.contribute(HARNESS_TOOL_CONTRIBUTION, …)`：本插件自己的 AI 工具
 *   （`manage_planner`，实现在 `./tools.ts`，读的是本插件的 mapper）经 harness 的工具
 *   贡献点注册给模型；插件停用时贡献一并摘除，工具集里自然不再有它；
 * - `ctx.contribute(PLUGIN_PURGE, …)`：卸载时「不保留数据」由宿主回调，删本插件的
 *   任务/依赖行（实现见 `./purge.ts`）。core 因此不需要知道任何计划表名。
 * - 本插件没有「主进程 → 渲染层」的事件通道（无 webContents.send / safeSend），
 *   因此不需要 `ctx.registerEvent`。
 */
export function install(ctx: MainPluginContext): void {
  ctx.registerIpc(plannerIpcHandlers)
  for (const tool of plannerToolContributions) ctx.contribute(HARNESS_TOOL_CONTRIBUTION, tool)
  ctx.contribute(PLUGIN_PURGE, { run: purgePlannerData, label: '计划任务与依赖关系' })
}
