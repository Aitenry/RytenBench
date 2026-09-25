/**
 * 插件系统的 IPC 通道常量 + plugin:// URL 工具 + 通道命名规范（三端共用）。
 *
 * 通道命名规范：
 * - 外部插件 invoke 通道：`plugin:<命名空间>:<channel>`，命名空间 = 插件 id 去掉开头的 `plugin.`
 *   段（plugin.demo → plugin:demo:*），主进程权威校验、preload 白名单缓存；
 * - 内置插件沿用现有扁平通道名（视为 core 通道，如 'music-get-folders'）；
 * - 管理通道为 kebab-case（plugins-*），与现有主进程风格一致。
 */

/** 主进程 → 渲染层：已启用插件通道清单推送（preload 更新本地白名单缓存） */
export const IPC_PLUGIN_CHANNELS_UPDATED = 'plugin-channels-updated'

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
