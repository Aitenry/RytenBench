import type { PluginManifest } from '../shared/plugin/types'
import { harnessManifest } from './harness/manifest'
import { notesManifest } from './notes/manifest'

/**
 * 随应用分发的**内置插件清单注册表**（主进程用）。
 *
 * 只 import 各插件的 `manifest.ts`，不 import 任何实现。这里的 id 面决定「哪些插件算内置」：
 * 会被铺进 `userData/plugins/`（首次启动）、默认启用、面板显示「内置」徽章、可按 id 重装。
 *
 * **不在这里的插件 = 第三方插件**：不随应用分发、不自动安装、默认停用，
 * 由用户从 GitHub（见应用侧的「从 GitHub 安装」）或本地目录装进来。
 * `task-planner` / `music-player` 就是这样的独立插件——源码与发布在
 * `github.com/Aitenry/ryten-plugins`。
 */
export const BUILTIN_PLUGIN_MANIFESTS: PluginManifest[] = [harnessManifest, notesManifest]

export default BUILTIN_PLUGIN_MANIFESTS
