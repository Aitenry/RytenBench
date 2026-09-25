import type { zhCN } from '../zh-CN'
import { enUSCommon } from './common'
import { enUSSettings } from './settings'
import { enUSModelSettings } from './modelSettings'
import { enUSSystemInfo } from './systemInfo'
import { enUSAgentSettings } from './agentSettings'
import { enUSSkillsSettings } from './skillsSettings'
import { enUSMemorySettings } from './memorySettings'
import { enUSShell } from './shell'
import { enUSHarness } from './harness'
import { enUSMarkdown } from './markdown'

/**
 * `typeof zhCN` 约束：与中文源语言逐键对齐，缺译/多键在编译期即报错。
 * 插件词条（home / graph / graphSettings、music / musicSettings、planner）由插件自己注册并对齐
 * （见 src/plugins/<id>/locales/）。
 */
export const enUS: typeof zhCN = {
  common: enUSCommon,
  settings: enUSSettings,
  modelSettings: enUSModelSettings,
  systemInfo: enUSSystemInfo,
  agentSettings: enUSAgentSettings,
  skillsSettings: enUSSkillsSettings,
  memorySettings: enUSMemorySettings,
  shell: enUSShell,
  harness: enUSHarness,
  markdown: enUSMarkdown
}
