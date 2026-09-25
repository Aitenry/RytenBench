import type { zhCN } from '../zh-CN'
import { enUSCommon } from './common'
import { enUSSettings } from './settings'
import { enUSModelSettings } from './modelSettings'
import { enUSSystemInfo } from './systemInfo'
import { enUSShell } from './shell'
import { enUSMarkdown } from './markdown'

/**
 * `typeof zhCN` 约束：与中文源语言逐键对齐，缺译/多键在编译期即报错。
 * 插件词条（home / graph / graphSettings、music / musicSettings、planner、
 * harness / agentSettings / memorySettings / skillsSettings）由插件自己注册并对齐
 * （见 src/plugins/<id>/locales/）。
 */
export const enUS: typeof zhCN = {
  common: enUSCommon,
  settings: enUSSettings,
  modelSettings: enUSModelSettings,
  systemInfo: enUSSystemInfo,
  shell: enUSShell,
  markdown: enUSMarkdown
}
