import type { PluginManifest } from '../../shared/plugin/types'

/**
 * home 插件清单（**单一真源**）：
 * - 主进程：`src/plugins/manifests.ts` 汇总后供 `plugins-list` 合并启用态；
 * - 渲染层：`renderer/plugin.tsx` 直接 import 本对象作为 `Plugin.manifest`。
 *
 * 只放静态元数据（id/name/version/description/inject/routes/menu），
 * 不 import react/electron，三端构建都能直接打包。
 */
export const homeManifest: PluginManifest = {
  id: 'home',
  name: '首页',
  version: '0.1.0',
  description: '文档树、待办、Wiki 与知识图谱首页',
  builtin: true,
  /**
   * 实际用到的宿主上下文键：
   * route 挂载视图（首屏即用，不走懒加载）、menu 侧栏、settingsSection（图谱设置页归属首页）、
   * appProvider（图谱构建进度浮层，弹窗组件随插件装卸）、i18n 词条。
   */
  inject: ['route', 'menu', 'settingsSection', 'appProvider', 'i18n'],
  routes: [{ path: '/home' }],
  menu: { key: 'home', labelKey: 'shell.menu.home', icon: 'RiDashboardLine', order: 10 }
}

export default homeManifest
