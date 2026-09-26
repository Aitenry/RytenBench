/**
 * 插件系统的 IPC 通道常量 + plugin:// URL 工具 + 通道命名规范（三端共用）。
 *
 * 通道命名规范：
 * - 插件 invoke 通道：`plugin:<命名空间>:<channel>`，命名空间 = 插件 id 去掉开头的 `plugin.`
 *   段（plugin.demo → plugin:demo:*，内置 planner → plugin:planner:*），主进程权威校验、
 *   preload 白名单缓存；
 * - 主进程 → 渲染层的事件通道同规则命名（如 `plugin:planner:tasks-updated`），
 *   由插件在主进程 `ctx.registerEvent(...)` 声明后才进白名单；
 * - **core 自己的通道不进这个命名空间**（扁平名）——原先那批扁平插件通道
 *   （'todo-items-get-paginate' 等）已随四个内置插件迁走，core 现在只剩
 *   window-* / setting / provider-* / plugins-* / weather-* 等外壳能力；
 * - 管理通道为 kebab-case（plugins-*），与现有主进程风格一致。
 */

/** 主进程 → 渲染层：已启用插件通道清单推送（preload 更新本地白名单缓存） */
export const IPC_PLUGIN_CHANNELS_UPDATED = 'plugin-channels-updated'

/**
 * 渲染层 → 主进程：**同步**取一次当前通道清单（`ipcRenderer.sendSync`）。
 *
 * 为什么需要它：`IPC_PLUGIN_CHANNELS_UPDATED` 是推送（did-finish-load 补推），
 * 而渲染层的首个订阅（插件 Provider 的 useEffect）发生在页面脚本执行期——
 * 早于 did-finish-load，于是「首帧就订阅事件通道」必然撞上白名单还没到的竞态
 * （表现为 `window.api.plugin.on` 抛「插件通道未启用」）。preload 在启动时用一次
 * 同步 IPC 取回权威清单，之后仍由推送增量刷新。
 */
export const IPC_PLUGIN_CHANNELS_SYNC = 'plugin-channels-sync'

/**
 * 渲染层 → 主进程：**同步**取一次插件启用清单（`ipcRenderer.sendSync`）。
 *
 * 为什么需要它（2026-09-26 用户实测报错「插件通道未启用: plugin:music:play-track」）：
 * 渲染层宿主在构造期会**同步预装载**内置插件（否则首帧没有路由/菜单），但它此前只能先按
 * manifest 默认值（内置=启用）装载，等异步 `plugins-list` 回来才把用户停用的插件卸掉。
 * 这个空窗期里被停用插件的 Provider 已经挂载并订阅事件通道，而主进程根本没装载它的通道
 * → preload 白名单拒绝 → 抛错被 ErrorBoundary 接住（整页 RUNTIME ERROR）。
 * preload 在启动时用一次同步 IPC 取回权威启用态，渲染层即可**一开始就只装载启用的插件**。
 */
export const IPC_PLUGINS_LIST_SYNC = 'plugins-list-sync'

/** 主进程 → 渲染层：插件启停/安装/卸载后的状态广播 */
export const IPC_PLUGIN_STATE_CHANGED = 'plugin-state-changed'

export const IPC_PLUGINS_LIST = 'plugins-list'
export const IPC_PLUGINS_SET_ENABLED = 'plugins-set-enabled'
export const IPC_PLUGINS_INSTALL = 'plugins-install'
export const IPC_PLUGINS_UNINSTALL = 'plugins-uninstall'

/** 外部插件通道前缀校验正则（plugin:<命名空间>:...，命名空间允许字母数字 . _ -） */
export const PLUGIN_CHANNEL_RE = /^plugin:[A-Za-z0-9._-]+:/

/** 从通道名提取命名空间；非插件通道返回 null（注意：命名空间不含 id 开头的 `plugin.` 段） */
export function pluginIdFromChannel(channel: string): string | null {
  const m = /^plugin:([A-Za-z0-9._-]+):/.exec(channel)
  return m ? m[1] : null
}

/** 从 plugin://<id>/<relPath> URL 解析出插件 id 与相对路径 */
export function parsePluginUrl(url: string): { id: string; relPath: string } | null {
  const m = /^plugin:\/\/([A-Za-z0-9._-]+)(\/.*)?$/.exec(url)
  if (!m) return null
  const relPath = decodeURIComponent(m[2] ?? '/').replace(/^\/+/, '')
  return { id: m[1], relPath }
}

/** 插件文件 URL helper：plugin://<id>/<relPath> */
export function pluginUrl(id: string, relPath: string): string {
  return `plugin://${id}/${relPath.replace(/^\/+/, '')}`
}
