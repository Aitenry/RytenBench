import { RiDashboardLine, RiMindMap } from '@remixicon/react'
import type { Plugin } from '@renderer/plugin-host/types'
import manifest from '../manifest'
import { notesLocales } from '../locales'
import GraphSettings from './settings/GraphSettings'
import BuildProgressProvider from './providers/BuildProgressProvider'
import { publishDocChanged, type DocChangedPayload } from './doc-changed'
import NotesIndex from './Index'

/**
 * notes 插件（渲染层入口）：思源笔记风格的笔记首页（文档树 / 编辑器 / 待办 / Wiki / 图谱）。
 *
 * 注册点：route（**首屏即用**：直接挂组件，不走懒加载 chunk——笔记页是默认落点）、
 * menu（侧栏，order 10）、settingsSection（图谱设置页，归属笔记插件）、
 * appProvider（图谱构建进度浮层，弹窗组件随插件装卸，外壳不再 import 笔记组件）、
 * i18n（词条随插件注册：`notes` / `graph` / `graphSettings` 三个顶层键停用即消失）、
 * events（订阅宿主事件总线的 `doc:changed`，转投给本插件的编辑器）。
 *
 * 知识图谱视图（2.7MB chunk，含 echarts/cytoscape）仍由 NotesView 用
 * `React.lazy(() => import('./graph/GraphView'))` 按需加载，不随首屏打包。
 */
const plugin: Plugin = {
  // id/name/version/description 的单一真源在 ../manifest.ts（主进程 plugins-list 同源）
  manifest,
  install(ctx) {
    ctx.use('route').register({
      path: '/notes',
      Component: NotesIndex
    })
    ctx.use('menu').register({
      key: 'notes',
      labelKey: 'shell.menu.notes',
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
    // 图谱构建进度的 Provider + 浮层随插件注册（core 不再持有进度状态，
    // 也不再认识 `plugin:notes:graph-build-*` 这三个通道名——一并收进本插件）
    ctx.use('appProvider').register({ Provider: BuildProgressProvider, order: 10 })
    // 词条随插件注册：停用即不再注册这些键（原先由中央 locales 无条件打包进首屏）
    ctx.use('i18n').addResources('translation', notesLocales)
    // 文档被 AI 工具改写：订阅宿主事件总线的语义事件（事件源是 harness 插件，
    // 它把主进程的通道桥接成 `doc:changed`）。订阅是可逆效果，停用即解绑；
    // 组件侧经 ../doc-changed 的模块级订阅表消费，不认识任何插件的通道名。
    ctx.effect(() =>
      ctx.use('events').on('doc:changed', (data) => publishDocChanged(data as DocChangedPayload))
    )
  }
}

export default plugin
