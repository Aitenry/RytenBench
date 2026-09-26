import type { PluginManifest } from '../../shared/plugin/types'

/**
 * notes 插件清单（**单一真源**）：
 * - 主进程：`src/plugins/manifests.ts` 汇总后供 `plugins-list` 合并启用态；
 * - 渲染层：`renderer/plugin.tsx` 直接 import 本对象作为 `Plugin.manifest`。
 *
 * 只放静态元数据（id/name/version/description/inject/routes/menu），
 * 不 import react/electron，三端构建都能直接打包。
 */
export const notesManifest: PluginManifest = {
  id: 'notes',
  name: '笔记',
  version: '0.1.0',
  description: '文档树、待办、知识库与知识图谱（首页仪表盘）',
  builtin: true,
  /**
   * 实际用到的宿主上下文键：
   * route 挂载视图（首屏即用，不走懒加载）、menu 侧栏、settingsSection（图谱设置页归属本插件）、
   * appProvider（图谱构建进度浮层，弹窗组件随插件装卸）、i18n 词条、
   * events（订阅宿主事件总线的 `doc:changed`：文档被 AI 工具改写时同步编辑器）。
   */
  inject: ['route', 'menu', 'settingsSection', 'appProvider', 'i18n', 'events'],
  routes: [{ path: '/notes' }],
  menu: { key: 'notes', labelKey: 'shell.menu.notes', icon: 'RiStickyNoteLine', order: 10 }
}

export default notesManifest
