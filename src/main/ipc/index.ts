import { registerMiscIpc } from './misc'
import { registerTodoIpc } from './todo'
import { registerPlannerIpc } from './planner'
import { registerSettingsIpc } from './settings'
import { registerNodePositionIpc } from './node-position'
import { registerDocumentIpc } from './document'
import { registerWikiIpc } from './wiki'
import { registerHarnessIpc } from './harness'
import { registerHarnessTopicIpc } from './harness-topic'
import { registerMnemonIpc } from './mnemon'
import { registerWorkspaceIpc } from './workspace'
import { registerGraphIpc } from './graph'
import { registerProviderIpc } from './provider'
import { registerDialogIpc } from './dialog'
import { registerPluginsIpc } from './plugins'

/**
 * 内置 IPC 组（主进程插件宿主消费）。
 * - core 组始终注册（shell 骨架与全局能力）；
 * - 插件组随对应插件启用/停用注册/注销（经 plugins/host.ts 的 captureIpc 捕获通道后回滚）。
 * 归属表见方案 5.1：home(todo/document/wiki/node-position)、planner、
 * harness(harness/harness-topic/mnemon)。
 *
 * music 已迁到自包含插件目录（`src/plugins/music/main/`，走 ctx.registerIpc 的新契约），
 * 因此不再有 music 分组——新迁移的插件都不要在这里登记通道。
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
    registerGraphIpc()
    registerPluginsIpc()
  },
  home: () => {
    registerTodoIpc()
    registerDocumentIpc()
    registerWikiIpc()
    registerNodePositionIpc()
  },
  planner: () => {
    registerPlannerIpc()
  },
  harness: () => {
    registerHarnessIpc()
    registerHarnessTopicIpc()
    registerMnemonIpc()
  }
}
