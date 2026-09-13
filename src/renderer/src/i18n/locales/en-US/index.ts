import type { zhCN } from '../zh-CN'
import { enUSCommon } from './common'
import { enUSSettings } from './settings'
import { enUSModelSettings } from './modelSettings'
import { enUSGraphSettings } from './graphSettings'
import { enUSMusicSettings } from './musicSettings'
import { enUSSystemInfo } from './systemInfo'
import { enUSAgentSettings } from './agentSettings'
import { enUSSkillsSettings } from './skillsSettings'
import { enUSMemorySettings } from './memorySettings'
import { enUSShell } from './shell'
import { enUSHome } from './home'
import { enUSHarness } from './harness'
import { enUSPlanner } from './planner'
import { enUSMusic } from './music'
import { enUSGraph } from './graph'
import { enUSMarkdown } from './markdown'

/** `typeof zhCN` 约束：与中文源语言逐键对齐，缺译/多键在编译期即报错 */
export const enUS: typeof zhCN = {
  common: enUSCommon,
  settings: enUSSettings,
  modelSettings: enUSModelSettings,
  graphSettings: enUSGraphSettings,
  musicSettings: enUSMusicSettings,
  systemInfo: enUSSystemInfo,
  agentSettings: enUSAgentSettings,
  skillsSettings: enUSSkillsSettings,
  memorySettings: enUSMemorySettings,
  shell: enUSShell,
  home: enUSHome,
  harness: enUSHarness,
  planner: enUSPlanner,
  music: enUSMusic,
  graph: enUSGraph,
  markdown: enUSMarkdown
}
