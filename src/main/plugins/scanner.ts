import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import logger from 'electron-log'
import { isValidManifest, type PluginManifest } from '../../shared/plugin/types'

/**
 * 外部插件目录扫描（application 目录约定模式，参照 harness/runtime/skills.ts）。
 *
 * 目录约定：userData/plugins/<id>/plugin.json。
 * 目录名即插件 id（manifest.id 需与目录名一致），非法清单跳过并告警。
 */

export interface ScannedExternalPlugin {
  id: string
  dir: string
  manifest: PluginManifest
}

/** 外部插件根目录（userData/plugins），确保存在 */
export function externalPluginsRoot(): string {
  const root = path.join(app.getPath('userData'), 'plugins')
  fs.mkdirSync(root, { recursive: true })
  return root
}

/** 扫描全部外部插件（非法目录/清单跳过） */
export function scanExternalPlugins(): ScannedExternalPlugin[] {
  const root = externalPluginsRoot()
  const out: ScannedExternalPlugin[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch (err) {
    logger.warn('[Plugins] 扫描插件目录失败:', err)
    return out
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(root, entry.name)
    const manifestPath = path.join(dir, 'plugin.json')
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      if (!isValidManifest(raw)) {
        logger.warn(`[Plugins] ${entry.name}: plugin.json 字段非法，跳过`)
        continue
      }
      const manifest = raw as unknown as PluginManifest
      // 目录名与 manifest.id 一致性（协议路由按 manifest.id 寻址）
      if (manifest.id !== entry.name) {
        logger.warn(`[Plugins] ${entry.name}: manifest.id(${manifest.id}) 与目录名不一致，跳过`)
        continue
      }
      out.push({ id: entry.name, dir, manifest })
    } catch (err) {
      logger.warn(`[Plugins] ${entry.name}: plugin.json 读取失败，跳过:`, err)
    }
  }
  return out
}

/** 按 id 查找单个外部插件 */
export function findExternalPlugin(id: string): ScannedExternalPlugin | null {
  return scanExternalPlugins().find((p) => p.id === id) ?? null
}
