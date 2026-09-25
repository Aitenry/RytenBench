import { zhCNCommon } from './common'
import { zhCNSettings } from './settings'
import { zhCNModelSettings } from './modelSettings'
import { zhCNGraphSettings } from './graphSettings'
import { zhCNSystemInfo } from './systemInfo'
import { zhCNAgentSettings } from './agentSettings'
import { zhCNSkillsSettings } from './skillsSettings'
import { zhCNMemorySettings } from './memorySettings'
import { zhCNShell } from './shell'
import { zhCNHome } from './home'
import { zhCNHarness } from './harness'
import { zhCNPlanner } from './planner'
import { zhCNGraph } from './graph'
import { zhCNMarkdown } from './markdown'

/**
 * 简体中文是**源语言**：词条结构与文案以这里为准。
 * 其它语言文件必须以 `typeof zhCN` 声明，键多一个少一个都会编译报错。
 *
 * 注意：已插件化的词条（当前是 music / musicSettings）不在中央目录里，
 * 它们由插件在 install 时经 `ctx.use('i18n').addResources` 注册
 * （见 src/plugins/music/locales/）；类型上仍由 i18next.d.ts 汇总，`t()` 键照旧有校验。
 */
export const zhCN = {
  common: zhCNCommon,
  settings: zhCNSettings,
  modelSettings: zhCNModelSettings,
  graphSettings: zhCNGraphSettings,
  systemInfo: zhCNSystemInfo,
  agentSettings: zhCNAgentSettings,
  skillsSettings: zhCNSkillsSettings,
  memorySettings: zhCNMemorySettings,
  shell: zhCNShell,
  home: zhCNHome,
  harness: zhCNHarness,
  planner: zhCNPlanner,
  graph: zhCNGraph,
  markdown: zhCNMarkdown
}
