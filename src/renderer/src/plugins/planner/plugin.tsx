import { RiCalendar2Line } from '@remixicon/react'
import type { Plugin } from '@renderer/plugin-host/types'

/**
 * planner 插件：任务规划视图（任务树 + 甘特图 + 列表）。
 */
const plugin: Plugin = {
  manifest: {
    id: 'planner',
    name: '任务规划',
    version: '0.1.0',
    description: '任务树、甘特图与列表视图',
    builtin: true,
    inject: ['route', 'menu'],
    routes: [{ path: '/planner', skeleton: 'planner' }],
    menu: { key: 'planner', labelKey: 'shell.menu.planner', icon: 'RiCalendar2Line', order: 20 }
  },
  install(ctx) {
    ctx.use('route').register({
      path: '/planner',
      skeleton: 'planner',
      load: () => import('./Index')
    })
    ctx.use('menu').register({
      key: 'planner',
      labelKey: 'shell.menu.planner',
      icon: <RiCalendar2Line size={16} />,
      order: 20
    })
  }
}

export default plugin
