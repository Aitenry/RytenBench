import { zhCNCommon } from './common'
import { zhCNSettings } from './settings'
import { zhCNModelSettings } from './modelSettings'
import { zhCNGraphSettings } from './graphSettings'
import { zhCNMusicSettings } from './musicSettings'
import { zhCNSystemInfo } from './systemInfo'
import { zhCNAgentSettings } from './agentSettings'
import { zhCNSkillsSettings } from './skillsSettings'
import { zhCNMemorySettings } from './memorySettings'
import { zhCNShell } from './shell'
import { zhCNHome } from './home'
import { zhCNHarness } from './harness'
import { zhCNPlanner } from './planner'
import { zhCNMusic } from './music'
import { zhCNGraph } from './graph'
import { zhCNMarkdown } from './markdown'

/**
 * 简体中文是**源语言**：词条结构与文案以这里为准。
 * 其它语言文件必须以 `typeof zhCN` 声明，键多一个少一个都会编译报错。
 */
export const zhCN = {
  common: zhCNCommon,
  settings: zhCNSettings,
  modelSettings: zhCNModelSettings,
  graphSettings: zhCNGraphSettings,
  musicSettings: zhCNMusicSettings,
  systemInfo: zhCNSystemInfo,
  agentSettings: zhCNAgentSettings,
  skillsSettings: zhCNSkillsSettings,
  memorySettings: zhCNMemorySettings,
  shell: zhCNShell,
  home: zhCNHome,
  harness: zhCNHarness,
  planner: zhCNPlanner,
  music: zhCNMusic,
  graph: zhCNGraph,
  markdown: zhCNMarkdown
}
