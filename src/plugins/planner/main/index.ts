import type { MainPluginContext } from '../../../main/plugins/context'
import { plannerIpcHandlers } from './ipc'

/**
 * planner 插件主进程入口（契约见 src/plugins/README.md）。
 *
 * - `ctx.registerIpc`：10 个 `plugin:planner:*` 通道（任务增删改查/排序 + 依赖关系），
 *   停用或卸载时随 `ctx.dispose()` 一并摘除——宿主侧无需知道计划视图的存在；
 * - 本插件没有「主进程 → 渲染层」的事件通道（无 webContents.send / safeSend），
 *   因此不需要 `ctx.registerEvent`。
 */
export function install(ctx: MainPluginContext): void {
  ctx.registerIpc(plannerIpcHandlers)
}
