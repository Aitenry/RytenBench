import { app } from 'electron'
import { join } from 'path'
import logger from 'electron-log'
import type { MainPluginContext } from '../../../main/plugins/context'
import { awaitInitialized } from '../../../main/database/instance'
import { configureFileHistory } from './workspace/file-history'
import { syncWorkspaceWatcher, stopWorkspaceWatcher } from './workspace'
import { HARNESS_EVENT_CHANNELS, installHarnessIpc } from './ipc/harness'
import { harnessTopicIpcHandlers } from './ipc/harness-topic'
import { mnemonIpcHandlers } from './ipc/mnemon'
import { workspaceIpcHandlers } from './ipc/workspace'
import { agentIpcHandlers } from './ipc/agent'
import { WORKSPACE_FILE_HISTORY_EVENT_CHANNELS } from './workspace/file-history'
import { WORKSPACE_WATCHER_EVENT_CHANNELS } from './workspace/watcher'

/**
 * 文档被 AI 工具改写/删除的事件通道。
 *
 * 发送方是 home 插件的 `manage_docs` 工具（`src/plugins/home/main/tools/docs.ts`，它按
 * 「插件不得 import harness」的铁律用字面量发这个通道名），订阅方是 home 的文档编辑器
 * （经 preload 的 `window.api.harness.onDocChanged`，本轮只改 preload 里的通道字面量，
 * 渲染层调用点不动）。在 harness 这里声明是为了让它进 preload 的插件通道白名单。
 */
const HARNESS_DOC_CHANGED_CHANNEL = 'plugin:harness:harness-doc-changed'

/**
 * harness 插件主进程入口（契约见 src/plugins/README.md）。
 *
 * 装的是「AI 助手」这一整块内容：
 * - 通道表：5 个域一个文件（harness 主体 / 话题对话 / Mnemon 记忆 / 工作区文件与改动审查 /
 *   智能体配置），共 63 个 `plugin:harness:*` 通道，全部经 `ctx.registerIpc`；
 * - 事件通道：主进程 → 渲染层的推送（流式 chunk、队列、目标、后台任务、子代理、
 *   提问、计划清单、工作区磁盘变化、改动记录、文档改写）逐个 `ctx.registerEvent` 声明，
 *   否则 preload 白名单会拒绝渲染层订阅（home 那轮踩过）；
 * - 启动接线：文件改动快照目录 + 工作区文件监听，原先写在 `src/main/index.ts`，
 *   现挪进 `ctx.effect`（可逆）。停用「AI 助手」就不再配置快照目录、也不再监听工作区；
 * - 工具注册表：本地工具 time/weather + 各插件的 `harness.tool` 贡献（拉取语义，
 *   见 `src/main/plugins/tool-contract.ts`）。
 *
 * 归属依据（本轮实测）：
 * - `src/main/workspace/**` 是 AI 改动复核（快照/回溯/文件监听）+ 文件浏览器；
 * - `src/main/ipc/workspace.ts` 的 9 个 `workspace-*` 通道只被 harness 渲染层组件使用
 *   （WorkspacePanel / FileExplorer / FileDiffView），故从 core 组移除；
 * - `provider.ts` 里的 agent-* / main-agent-* 是智能体配置（agent_config 挂在 harness 的
 *   workspace 表下），随本轮搬进 `ipc/agent.ts`，provider.ts 只留模型 Provider。
 */
export function install(ctx: MainPluginContext): void {
  // ── 通道表（5 个域）─────────────────────────────────────────────────────
  installHarnessIpc(ctx)
  ctx.registerIpc(harnessTopicIpcHandlers())
  ctx.registerIpc(mnemonIpcHandlers())
  ctx.registerIpc(workspaceIpcHandlers())
  ctx.registerIpc(agentIpcHandlers())

  // ── 主进程 → 渲染层的事件通道（只有发送方）─────────────────────────────
  ctx.registerEvent(
    ...HARNESS_EVENT_CHANNELS,
    ...WORKSPACE_FILE_HISTORY_EVENT_CHANNELS,
    ...WORKSPACE_WATCHER_EVENT_CHANNELS,
    HARNESS_DOC_CHANGED_CHANNEL
  )

  // ── 启动接线（原 src/main/index.ts）─────────────────────────────────────
  ctx.effect(() => {
    // 文件改动快照目录：放 userData 而不是工作区——工作区挂载为虚拟 '/'，
    // 写进去会污染用户项目，也会出现在模型自己的 ls/glob 结果里
    configureFileHistory(join(app.getPath('userData'), 'file-history'))

    // 工作区文件监听：数据库初始化完成（设置已加载）后跟随当前工作区启动。
    // 初始化未完成时插件就被停用的话（stopped）不能再起监听。
    let stopped = false
    void awaitInitialized().then(() => {
      if (stopped) return
      try {
        syncWorkspaceWatcher()
      } catch (err) {
        logger.warn('[Harness] 工作区文件监听启动失败:', err)
      }
    })

    return () => {
      stopped = true
      stopWorkspaceWatcher()
      // 停用即「不再配置快照目录」：快照写入处按空目录降级为「无快照」（不抛错）
      configureFileHistory('')
    }
  })
}

export default { install }
