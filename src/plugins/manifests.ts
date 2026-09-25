import type { PluginManifest } from '../shared/plugin/types'
import { harnessManifest } from './harness/manifest'
import { homeManifest } from './home/manifest'
import { musicManifest } from './music/manifest'
import { plannerManifest } from './planner/manifest'

/**
 * 四端唯一的**内置插件清单注册表**（主进程 / preload / 渲染层 / 外部插件工具共用）：
 * 只 import 各插件的 `manifest.ts`，不 import 任何实现。
 *
 * 为什么单列一份：`plugins-list` 的启用态合并、渲染层 `plugin.tsx` 的 manifest
 * 都指向同一个对象，id/name/version/description 只有一处可改。
 * 顺序即设置面板与插件的默认装载顺序。
 */
export const BUILTIN_PLUGIN_MANIFESTS: PluginManifest[] = [
  harnessManifest,
  homeManifest,
  musicManifest,
  plannerManifest
]

export default BUILTIN_PLUGIN_MANIFESTS
