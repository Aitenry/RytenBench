import type { PluginManifest } from '../../shared/plugin/types'

/**
 * harness 插件清单（**单一真源**）：
 * - 主进程：`src/plugins/manifests.ts` 汇总后供 `plugins-list` 合并启用态；
 * - 渲染层：`renderer/plugin.tsx` 直接 import 本对象作为 `Plugin.manifest`。
 *
 * 只放静态元数据（id/name/version/description/inject/routes/menu），
 * 不 import react/electron，三端构建都能直接打包。
 */
export const harnessManifest: PluginManifest = {
  id: 'harness',
  name: 'AI 助手',
  version: '0.1.0',
  description: 'AI Agent 工作台：话题、流式对话、代码编辑、文件差异与子代理',
  builtin: true,
  /**
   * 实际用到的宿主上下文键：
   * route 懒加载视图 + 骨架、menu 侧栏、settingsSection（智能体/技能/记忆三页）、
   * appProvider（全局 HarnessProvider）、i18n 词条（随插件注册，停用即消失）、
   * events（把主进程的「文档被 AI 改写」桥接成宿主事件总线的 `doc:changed`）。
   */
  inject: ['route', 'menu', 'settingsSection', 'appProvider', 'i18n', 'events'],
  routes: [{ path: '/harness', skeleton: 'harness' }],
  menu: { key: 'harness', labelKey: 'shell.menu.harness', icon: 'RiChatAiLine', order: 40 }
}

export default harnessManifest
