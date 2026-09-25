import { zhCNCommon } from './common'
import { zhCNSettings } from './settings'
import { zhCNModelSettings } from './modelSettings'
import { zhCNSystemInfo } from './systemInfo'
import { zhCNShell } from './shell'
import { zhCNMarkdown } from './markdown'

/**
 * 简体中文是**源语言**：词条结构与文案以这里为准。
 * 其它语言文件必须以 `typeof zhCN` 声明，键多一个少一个都会编译报错。
 *
 * 注意：已插件化的词条（home / graph / graphSettings、music / musicSettings、planner、
 * harness / agentSettings / memorySettings / skillsSettings）不在中央目录里，它们由插件在
 * install 时经 `ctx.use('i18n').addResources` 注册（见 src/plugins/<id>/locales/）；
 * 类型上仍由 i18next.d.ts 汇总，`t()` 键照旧有校验。
 * `modelSettings`（「模型」设置页）属于 core 的外壳设置，留在中央目录。
 */
export const zhCN = {
  common: zhCNCommon,
  settings: zhCNSettings,
  modelSettings: zhCNModelSettings,
  systemInfo: zhCNSystemInfo,
  shell: zhCNShell,
  markdown: zhCNMarkdown
}
