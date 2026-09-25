import type { PluginManifest } from '@shared/plugin/types'
import { pluginUrl } from '@shared/plugin/protocol'
import type { Plugin } from './types'

/**
 * 外部插件渲染模块加载（方案 6.4 方案 B）：
 * fetch('plugin://<id>/<entry>') → blob URL → 动态 import。
 *
 * 不直接用 import('plugin://...')：Chromium 对自定义 scheme 的 ESM import 支持不可靠。
 * 插件构建时需 externalize react/antd 等，运行时经 ctx.require(name) 取宿主唯一实例。
 */

export async function loadExternalPlugin(manifest: PluginManifest): Promise<Plugin> {
  const entry = manifest.entry?.renderer ?? 'renderer.js'
  const url = pluginUrl(manifest.id, entry)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`外部插件 '${manifest.id}' 入口加载失败: HTTP ${res.status}`)
  }
  const code = await res.text()
  const blob = new Blob([code], { type: 'text/javascript' })
  const blobUrl = URL.createObjectURL(blob)
  try {
    // 动态 URL：构建期无需解析
    const mod = (await import(/* @vite-ignore */ blobUrl)) as { default?: unknown }
    const install = mod?.default
    if (typeof install !== 'function') {
      throw new Error(`外部插件 '${manifest.id}' 渲染入口需 default export install(ctx)`)
    }
    return { manifest, install: install as Plugin['install'] }
  } finally {
    URL.revokeObjectURL(blobUrl)
  }
}
