import type { MainPluginContext } from '../../../main/plugins/context'
import { todoIpcHandlers } from './ipc/todo'
import { documentIpcHandlers } from './ipc/document'
import { wikiIpcHandlers } from './ipc/wiki'
import { nodePositionIpcHandlers } from './ipc/node-position'
import {
  graphIpcHandlers,
  HOME_GRAPH_BUILD_PROGRESS_CHANNEL,
  HOME_GRAPH_BUILD_COMPLETE_CHANNEL,
  HOME_GRAPH_BUILD_ERROR_CHANNEL
} from './ipc/graph'

/**
 * home 插件主进程入口（契约见 src/plugins/README.md）。
 *
 * - `ctx.registerIpc`：50 个 `plugin:home:*` 通道，按域分成 5 张表（todo / document /
 *   wiki / node-position / graph），一个域一个文件，不合成巨型文件；停用或卸载时随
 *   `ctx.dispose()` 一并摘除。
 * - `ctx.registerEvent`：主进程 → 渲染层的事件通道（图谱构建进度/完成/错误）。
 *   它们没有 ipcMain 处理器，必须显式声明才会进 preload 的插件通道白名单，
 *   渲染层 `window.api.plugin.on` 才放行。
 *
 * 为什么 graph 从 core 的 IPC 分组移到本插件：图谱的数据、服务与事件全部属于首页
 * （`main/graph/**` + `main/db/mapper/graph.ts`），此前挂在 core 组常驻只是因为渲染层
 * `BuildProgressProvider` 无条件订阅构建进度事件。现在改为「停用即摘除 + 渲染层优雅降级」
 * （见 src/renderer/src/providers/BuildProgressProvider.tsx 的订阅 try/catch）。
 */
export function install(ctx: MainPluginContext): void {
  ctx.registerIpc(todoIpcHandlers)
  ctx.registerIpc(documentIpcHandlers)
  ctx.registerIpc(wikiIpcHandlers)
  ctx.registerIpc(nodePositionIpcHandlers)
  ctx.registerIpc(graphIpcHandlers)
  ctx.registerEvent(
    HOME_GRAPH_BUILD_PROGRESS_CHANNEL,
    HOME_GRAPH_BUILD_COMPLETE_CHANNEL,
    HOME_GRAPH_BUILD_ERROR_CHANNEL
  )
}

export default { install }
