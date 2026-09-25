import type { PluginManifest } from '../shared/plugin/types'
import { harnessManifest } from './harness/manifest'
import { homeManifest } from './home/manifest'
import { musicManifest } from './music/manifest'
import { plannerManifest } from './planner/manifest'

/**
 * 内置插件清单注册表（主进程与渲染层共用，**只 import 各插件的 manifest.ts**）。
 *
 * 为什么单列一份：`plugins-list` 的启用态合并、渲染层 `plugin.tsx` 的 manifest
 * 都指向同一个对象，id/name/version/description 只有一处可改。
 *
 * 过渡策略：四个内置插件（harness / home / music / planner）都已在这里登记；
 * `src/shared/plugin/builtin-catalog.ts` 的旧目录已无新增内容，等 core 收尾时删除
 * （`src/main/ipc/plugins.ts` 目前仍做「新清单优先、旧目录兜底」的合并）。
 */
export const BUILTIN_PLUGIN_MANIFESTS: PluginManifest[] = [
  harnessManifest,
  homeManifest,
  musicManifest,
  plannerManifest
]

export default BUILTIN_PLUGIN_MANIFESTS
