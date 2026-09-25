/**
 * 插件系统错误码（三端共用）。
 *
 * 命名对应 Cordis 语义：
 * - UNDECLARED_ACCESS：未声明依赖却访问上下文键（论文 6.3 capability 模型）；
 * - MISSING_DEP：声明依赖在当前状态下无法满足（没有宿主键/没有已激活提供者）；
 * - CHANNEL_FORBIDDEN：通道未注册/插件未启用/前缀不匹配（主进程权威校验）。
 */

export const PLUGIN_ERROR = {
  UNDECLARED_ACCESS: 'PLUGIN_UNDECLARED_ACCESS',
  MISSING_DEP: 'PLUGIN_MISSING_DEP',
  SERVICE_MISSING: 'PLUGIN_SERVICE_MISSING',
  CHANNEL_FORBIDDEN: 'PLUGIN_CHANNEL_FORBIDDEN',
  ALREADY_ENABLED: 'PLUGIN_ALREADY_ENABLED',
  ALREADY_DISABLED: 'PLUGIN_ALREADY_DISABLED',
  NOT_FOUND: 'PLUGIN_NOT_FOUND',
  INVALID_MANIFEST: 'PLUGIN_INVALID_MANIFEST',
  ALREADY_INSTALLED: 'PLUGIN_ALREADY_INSTALLED'
} as const

export type PluginErrorCode = (typeof PLUGIN_ERROR)[keyof typeof PLUGIN_ERROR]

/** 插件系统错误类型 */
export class PluginError extends Error {
  readonly code: PluginErrorCode

  constructor(code: PluginErrorCode, message: string) {
    super(message)
    this.name = 'PluginError'
    this.code = code
  }
}
