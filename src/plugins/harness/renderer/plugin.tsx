import {
  RiChatAiLine,
  RiAiAgentLine,
  RiFileAi2Line,
  RiBrain4Line,
  RiPlug2Line
} from '@remixicon/react'
import type { Plugin } from '@renderer/plugin-host/types'
import manifest from '../manifest'
import { harnessLocales } from '../locales'
import AgentSettings from './components/settings/AgentSettings'
import SkillsSettings from './components/settings/SkillsSettings'
import MemorySettings from './components/settings/MemorySettings'
import McpSettings from './components/settings/McpSettings'
import { harnessAppProvider } from './provider'
import { harnessApi } from './api'

/**
 * harness 插件（渲染层入口）：AI Agent 工作台（最大的内置视图）。
 *
 * 注册点：route（懒加载 + 骨架屏）、menu（侧栏 order 40）、settingsSection
 * （智能体/技能/记忆三页，group='assistant'）、appProvider（全局 HarnessProvider）、
 * i18n（`harness` / `agentSettings` / `memorySettings` / `skillsSettings` 四个顶层键
 * 随插件注册，停用即消失）。
 *
 * 另有一处**跨插件解耦**：主进程在 AI 工具改写文档后经
 * `plugin:harness:harness-doc-changed` 通知渲染层（通道由 main/index.ts 的
 * `ctx.registerEvent` 声明才进 preload 白名单）。订阅方是 notes 插件的文档编辑器，
 * 但 notes 不该认识 harness 的通道名——所以这里把它桥接成宿主事件总线的语义事件
 * `doc:changed`，notes 只订阅 `'doc:changed'`（见 src/plugins/notes/renderer/plugin.tsx）。
 * 订阅本身是可逆效果：停用 harness 即解绑（notes 即便还在也收不到该事件）。
 *
 * 停用后：路由/菜单/设置三页/全局 Provider/词条全部级联回滚（依赖者先卸载语义）。
 */
const plugin: Plugin = {
  // id/name/version/description 的单一真源在 ../manifest.ts（主进程 plugins-list 同源）
  manifest,
  install(ctx) {
    ctx.use('route').register({
      path: '/harness',
      skeleton: 'harness',
      load: () => import('./Index')
    })
    ctx.use('menu').register({
      key: 'harness',
      labelKey: 'shell.menu.harness',
      icon: <RiChatAiLine size={16} />,
      order: 40
    })
    ctx.use('appProvider').register(harnessAppProvider)

    const sections = ctx.use('settingsSection')
    sections.register({
      tabKey: 'agents',
      labelKey: 'settings.nav.agents',
      icon: <RiAiAgentLine size={16} />,
      group: 'assistant',
      order: 10,
      Component: AgentSettings
    })
    sections.register({
      tabKey: 'skills',
      labelKey: 'settings.nav.skills',
      icon: <RiFileAi2Line size={16} />,
      group: 'assistant',
      order: 20,
      Component: SkillsSettings
    })
    sections.register({
      tabKey: 'memory',
      labelKey: 'settings.nav.memory',
      icon: <RiBrain4Line size={16} />,
      group: 'assistant',
      order: 30,
      Component: MemorySettings
    })
    sections.register({
      // MCP 服务器管理：外部工具来源，排在「记忆」之后（同一分组，智能体 → 技能 → 记忆 → MCP）
      tabKey: 'mcp',
      labelKey: 'settings.nav.mcp',
      icon: <RiPlug2Line size={16} />,
      group: 'assistant',
      order: 40,
      Component: McpSettings
    })

    // 词条随插件注册：停用即不再注册这些键（原先由中央 locales 无条件打包进首屏）
    ctx.use('i18n').addResources('translation', harnessLocales)

    // 主进程事件 → 宿主事件总线（语义事件 `doc:changed`，消费方是 notes 的文档编辑器）。
    // 订阅作为可逆效果登记：停用 harness 时解绑；通道未进白名单时只告警不抛错
    // （异常从 install 逃逸会让插件装载失败）。
    const events = ctx.use('events')
    ctx.effect(() => {
      try {
        return harnessApi.harness.onDocChanged((data) => {
          events.emit('doc:changed', data)
        })
      } catch (err) {
        console.warn('[plugin:harness] doc:changed 桥接订阅失败:', err)
        return
      }
    })
  }
}

export default plugin
