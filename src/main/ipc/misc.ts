import { ipcMain } from 'electron'
import logger from 'electron-log'
import { listContributions } from '../plugins/contributions'
import { appEventListenerCount } from '../plugins/app-events'
import {
  APP_BEFORE_QUIT,
  APP_PRELOAD,
  APP_RENDERER_MEMORY_DUMP,
  APP_EVENT_WORKSPACE_CHANGED,
  type AppHook
} from '../plugins/app-hooks'

/**
 * 杂项 IPC（core）：心跳、初始化进度日志，以及**只读的宿主生命周期探针**。
 *
 * 归属变更（harness 轮）：原先这里的 `harness-get-tools`（工具下拉清单）已随 harness 插件
 * 搬进 `src/plugins/harness/main/ipc/harness.ts`，通道名 `plugin:harness:harness-get-tools`
 * （它读的是 harness 的工具注册表 = 本地工具 + 各插件贡献）。
 *
 * 生命周期探针（core 收尾轮新增）：插件贡献的 `app.preload` / `app.before-quit` /
 * `app.renderer-memory-dump` 只存在于主进程内存里，渲染层无法直接观察——而「停用插件后
 * 这些钩子必须不再执行」是本轮的核心验收点，靠日志验证太脆。这里放一个**只读**的
 * 诊断通道（不改变任何行为、不暴露插件内容，只报数量与标签）：
 *
 *   - `preload` / `beforeQuit` / `memoryDump`：当前贡献数与标签；
 *   - `workspaceListeners`：`app.workspace-changed` 的订阅者数量（含插件自身的 `ctx.effect`）。
 *
 * 主要用于 `test/verify-plugin-host.mjs`：停用 harness 后三个钩子应全部归零、
 * 事件订阅也应归零（贡献随 `ctx.dispose()` 摘除的实证）。
 */
export function registerMiscIpc(): void {
  ipcMain.on('ping', () => logger.info('pong'))

  ipcMain.on('init-progress', (_event, data) => {
    logger.info('Init progress:', data)
  })

  ipcMain.handle('app-lifecycle-hooks', () => ({
    preload: listContributions<AppHook>(APP_PRELOAD).map((h) => h.label),
    beforeQuit: listContributions<AppHook>(APP_BEFORE_QUIT).map((h) => h.label),
    memoryDump: listContributions<AppHook>(APP_RENDERER_MEMORY_DUMP).map((h) => h.label),
    workspaceListeners: appEventListenerCount(APP_EVENT_WORKSPACE_CHANGED)
  }))
}
