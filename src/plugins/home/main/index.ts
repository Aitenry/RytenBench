import type { MainPluginContext } from '../../../main/plugins/context'
import { HARNESS_TOOL_CONTRIBUTION } from '../../../main/plugins/tool-contract'
import { todoIpcHandlers } from './ipc/todo'
import { documentIpcHandlers } from './ipc/document'
import { wikiIpcHandlers } from './ipc/wiki'
import { nodePositionIpcHandlers } from './ipc/node-position'
import { homeToolContributions } from './tools'
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
 * - `ctx.contribute(HARNESS_TOOL_CONTRIBUTION, …)`：本插件自己的 4 个 AI 工具
 *   （`manage_todos` / `manage_docs` / `manage_wikis` / `search_graph`，实现见
 *   `./tools/**`，读的都是本插件的 mapper）经 harness 的工具贡献点注册给模型；
 *   停用时贡献一并摘除，模型不再被提供这些工具。
 *
 * 为什么 graph 从 core 的 IPC 分组移到本插件：图谱的数据、服务与事件全部属于首页
 * （`main/graph/**` + `main/db/mapper/graph.ts`），此前挂在 core 组常驻只是因为渲染层
 * 无条件订阅构建进度事件。现在改为「停用即摘除」，且进度 Provider 本身也收进了本插件
 * （`renderer/providers/BuildProgressProvider.tsx`）——core 既不常驻图谱通道，
 * 也不再认识这三个通道名。
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
  for (const tool of homeToolContributions) ctx.contribute(HARNESS_TOOL_CONTRIBUTION, tool)
}

export default { install }
