import { registerMiscIpc } from './misc'
import { registerTodoIpc } from './todo'
import { registerPlannerIpc } from './planner'
import { registerSettingsIpc } from './settings'
import { registerNodePositionIpc } from './node-position'
import { registerMusicIpc } from './music'
import { registerDocumentIpc } from './document'
import { registerWikiIpc } from './wiki'
import { registerHarnessIpc } from './harness'
import { registerHarnessTopicIpc } from './harness-topic'
import { registerMnemonIpc } from './mnemon'
import { registerWorkspaceIpc } from './workspace'
import { registerGraphIpc } from './graph'
import { registerProviderIpc } from './provider'
import { registerDialogIpc } from './dialog'

/** 注册全部 IPC 处理器（应用就绪时调用一次） */
export function registerAllIpc(): void {
  registerMiscIpc()
  registerTodoIpc()
  registerPlannerIpc()
  registerSettingsIpc()
  registerNodePositionIpc()
  registerMusicIpc()
  registerDocumentIpc()
  registerWikiIpc()
  registerHarnessIpc()
  registerHarnessTopicIpc()
  registerMnemonIpc()
  registerWorkspaceIpc()
  registerGraphIpc()
  registerProviderIpc()
  registerDialogIpc()
}
