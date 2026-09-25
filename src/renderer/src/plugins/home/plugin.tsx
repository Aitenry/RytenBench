import { RiDashboardLine, RiMindMap } from '@remixicon/react'
import type { Plugin } from '@renderer/plugin-host/types'
import GraphSettings from './settings/GraphSettings'
import HomeIndex from './Index'

/**
 * home 插件：思源笔记风格首页（文档树 / 编辑器 / 待办 / Wiki / 图谱）。
 * 首页首屏即用：路由直接挂载组件（不走懒加载 chunk）。
 * graph 设置页归属 home（图谱视图在首页内）。
 */
const plugin: Plugin = {
  manifest: {
    id: 'home',
    name: '首页',
    version: '0.1.0',
    description: '文档树、待办、Wiki 与知识图谱首页',
    builtin: true,
    inject: ['route', 'menu', 'settingsSection'],
    routes: [{ path: '/home' }],
    menu: { key: 'home', labelKey: 'shell.menu.home', icon: 'RiDashboardLine', order: 10 }
  },
  install(ctx) {
    ctx.use('route').register({
      path: '/home',
      Component: HomeIndex
    })
    ctx.use('menu').register({
      key: 'home',
      labelKey: 'shell.menu.home',
      icon: <RiDashboardLine size={16} />,
      order: 10
    })
    ctx.use('settingsSection').register({
      tabKey: 'graph',
      labelKey: 'settings.nav.graph',
      icon: <RiMindMap size={16} />,
      group: 'general',
      order: 40,
      Component: GraphSettings
    })
  }
}

export default plugin
