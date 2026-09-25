import { RiCalendar2Line } from '@remixicon/react'
import type { Plugin } from '@renderer/plugin-host/types'
import manifest from '../manifest'
import { plannerLocales } from '../locales'

/**
 * planner 插件（渲染层入口）。
 *
 * 注册点：route（懒加载视图 + 骨架屏）、menu（侧栏）、i18n（词条随插件注册，
 * core 的中央 locales 不再打包这些键）。停用后：路由/菜单/词条即时消失（可逆效果回滚）。
 */
const plugin: Plugin = {
  // id/name/version/description 的单一真源在 ../manifest.ts（主进程 plugins-list 同源）
  manifest,
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
    // 词条随插件注册：停用即不再注册这些键（原先由中央 locales 无条件打包进首屏）
    ctx.use('i18n').addResources('translation', plannerLocales)
  }
}

export default plugin
