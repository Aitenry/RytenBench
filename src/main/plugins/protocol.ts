import { protocol, net } from 'electron'
import { resolve, sep, extname } from 'path'
import { pathToFileURL } from 'url'
import logger from 'electron-log'
import { parsePluginUrl } from '../../shared/plugin/protocol'
import { findExternalPlugin } from './scanner'
import { getEnabledOverride } from './store'

/**
 * plugin:// 自定义协议：服务外部插件的静态文件（renderer.js/main 附属资源/图标）。
 * 安全约束：
 * - 仅限「已发现且已启用」的外部插件目录；
 * - 路径解析后必须落在插件根目录内（防目录穿越）；
 * - 按扩展名提供正确 MIME（renderer.js 以 text/javascript 供 fetch+blob import）。
 */

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.css': 'text/css',
  '.html': 'text/html',
  '.map': 'application/json'
}

/** 必须在 app ready 之前调用（standard+secure 使 fetch/import 可用） */
export function registerPluginScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'plugin',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

/** app ready 之后注册协议处理器 */
export function registerPluginProtocolHandler(): void {
  protocol.handle('plugin', async (request) => {
    const parsed = parsePluginUrl(request.url)
    if (!parsed) return new Response('bad plugin url', { status: 400 })
    const scanned = findExternalPlugin(parsed.id)
    if (!scanned) return new Response('plugin not found', { status: 404 })
    // 外部插件默认停用；停用状态不可访问任何文件
    if (!(getEnabledOverride(parsed.id) ?? false)) {
      return new Response('plugin disabled', { status: 403 })
    }
    const abs = resolve(scanned.dir, parsed.relPath || '')
    if (abs !== scanned.dir && !abs.startsWith(scanned.dir + sep)) {
      logger.warn(`[Plugins] plugin:// 目录穿越被拦截: ${parsed.id} → ${parsed.relPath}`)
      return new Response('forbidden', { status: 403 })
    }
    try {
      const res = await net.fetch(pathToFileURL(abs).toString())
      const mime = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream'
      return new Response(res.body, { status: res.status, headers: { 'content-type': mime } })
    } catch (err) {
      logger.warn(`[Plugins] plugin:// 读取失败: ${abs}`, err)
      return new Response('read failed', { status: 500 })
    }
  })
}
