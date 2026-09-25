import type { PluginManifest } from '../shared/plugin/types'
import { homeManifest } from './home/manifest'
import { musicManifest } from './music/manifest'
import { plannerManifest } from './planner/manifest'

/**
 * 内置插件清单注册表（主进程与渲染层共用，**只 import 各插件的 manifest.ts**）。
 *
 * 为什么单列一份：`plugins-list` 的启用态合并、渲染层 `plugin.tsx` 的 manifest
 * 都指向同一个对象，id/name/version/description 只有一处可改。
 *
 * 过渡策略：已迁移的插件（home / music / planner）在这里登记；尚未迁移的
 * harness 仍由 `src/shared/plugin/builtin-catalog.ts` 提供，
 * 由 `src/main/ipc/plugins.ts` 做「新清单优先、旧目录兜底」的合并——每迁完一个插件，
 * 就把它加到这里，最终删掉 builtin-catalog.ts（旧目录里保留同名条目只为维持菜单顺序，
 * 合并时以这里为准）。
 */
export const BUILTIN_PLUGIN_MANIFESTS: PluginManifest[] = [
  homeManifest,
  musicManifest,
  plannerManifest
]

export default BUILTIN_PLUGIN_MANIFESTS
