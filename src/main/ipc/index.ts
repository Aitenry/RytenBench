import { registerMiscIpc } from './misc'
import { registerSettingsIpc } from './settings'
import { registerProviderIpc } from './provider'
import { registerDialogIpc } from './dialog'
import { registerPluginsIpc } from './plugins'

/**
 * core（外壳）IPC：窗口杂项 / 系统设置与锁屏 / 模型 Provider / 对话框 / 插件管理。
 *
 * 归属边界：这里**只**放外壳自身的能力。内容插件（music / planner / notes / harness）
 * 的通道一律走 `src/plugins/<id>/main/index.ts` 的 `install(ctx)` + `ctx.registerIpc`，
 * 由宿主在启用/停用时注册与摘除——core 不再持有任何插件分组表（原先那张"内置组"
 * 表与 `ipc-capture.ts` 猴补丁已随 core 收尾整体删除）。
 *
 * 归属变更记录：
 * - `workspace-*`（9 个通道）与 harness/harness-topic/mnemon 同批迁进 harness 插件；
 * - `agent-*` / `main-agent-*` 从 `provider.ts` 迁进 harness 的 `ipc/agent.ts`，
 *   这里只剩模型 Provider 自己的通道。
 */
export function registerCoreIpc(): void {
  registerMiscIpc()
  registerSettingsIpc()
  registerDialogIpc()
  registerProviderIpc()
  registerPluginsIpc()
}
