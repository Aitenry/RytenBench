import type { PluginManifest } from '../../shared/plugin/types'

/**
 * music 插件清单（**单一真源**）：
 * - 主进程：`src/plugins/manifests.ts` 汇总后供 `plugins-list` 合并启用态；
 * - 渲染层：`renderer/plugin.tsx` 直接 import 本对象作为 `Plugin.manifest`。
 *
 * 只放静态元数据（id/name/version/description/inject/routes/menu），
 * 不 import react/electron，三端构建都能直接打包。
 */
export const musicManifest: PluginManifest = {
  id: 'music',
  name: '音乐播放器',
  version: '0.1.0',
  description: '本地音乐播放器：歌单、播放控制与迷你播放器',
  builtin: true,
  /**
   * 实际用到的宿主上下文键：
   * route 懒加载视图 + 骨架、menu 侧栏、settingsSection 设置页、
   * appProvider 播放器状态（AudioProvider 随插件装卸）、
   * bottomBar 底栏音乐条目（外壳插槽，取代旧的 globalComponent 写法）、i18n 词条。
   */
  inject: ['route', 'menu', 'settingsSection', 'appProvider', 'bottomBar', 'i18n'],
  routes: [{ path: '/music', skeleton: 'music' }],
  menu: { key: 'music', labelKey: 'shell.menu.music', icon: 'RiDiscLine', order: 30 }
}

export default musicManifest
