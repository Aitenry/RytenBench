import type { PluginManifest } from '../../shared/plugin/types'

/**
 * planner 插件清单（**单一真源**）：
 * - 主进程：`src/plugins/manifests.ts` 汇总后供 `plugins-list` 合并启用态；
 * - 渲染层：`renderer/plugin.tsx` 直接 import 本对象作为 `Plugin.manifest`。
 *
 * 只放静态元数据（id/name/version/description/inject/routes/menu），
 * 不 import react/electron，三端构建都能直接打包。
 */
export const plannerManifest: PluginManifest = {
  id: 'planner',
  name: '任务规划',
  version: '0.1.0',
  description: '任务树、甘特图与列表视图',
  builtin: true,
  /**
   * 实际用到的宿主上下文键：
   * route 懒加载视图 + 骨架、menu 侧栏、i18n 词条（随插件注册，停用即消失）。
   * 原 `plugin.tsx` 内联的 inject 是 `['route', 'menu']`；词条进插件后补上 `i18n`。
   */
  inject: ['route', 'menu', 'i18n'],
  routes: [{ path: '/planner', skeleton: 'planner' }],
  menu: { key: 'planner', labelKey: 'shell.menu.planner', icon: 'RiCalendar2Line', order: 20 }
}

export default plannerManifest
