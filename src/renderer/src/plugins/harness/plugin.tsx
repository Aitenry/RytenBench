import { RiChatAiLine, RiAiAgentLine, RiFileAi2Line, RiBrain4Line } from '@remixicon/react'
import type { Plugin } from '@renderer/plugin-host/types'
import AgentSettings from './components/settings/AgentSettings'
import SkillsSettings from './components/settings/SkillsSettings'
import MemorySettings from './components/settings/MemorySettings'
import { harnessAppProvider } from './provider'

/**
 * harness 插件：AI Agent 工作台（最大的内置视图）。
 * 注册点：route（懒加载 + 骨架屏）、menu、settingsSection（智能体/技能/记忆三页）、
 * appProvider（全局 HarnessProvider）。
 * 停用后：路由/菜单/设置三页/全局 Provider 全部级联回滚（依赖者先卸载语义）。
 */
const plugin: Plugin = {
  manifest: {
    id: 'harness',
    name: 'AI 助手',
    version: '0.1.0',
    description: 'AI Agent 工作台：话题、流式对话、代码编辑、文件差异与子代理',
    builtin: true,
    inject: ['route', 'menu', 'settingsSection', 'appProvider'],
    provide: ['appProvider'],
    routes: [{ path: '/harness', skeleton: 'harness' }],
    menu: { key: 'harness', labelKey: 'shell.menu.harness', icon: 'RiChatAiLine', order: 40 }
  },
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
  }
}

export default plugin
