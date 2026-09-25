import { dialog } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import logger from 'electron-log'
import { externalPluginsRoot, findExternalPlugin } from './scanner'
import { isValidManifest, type PluginManifest } from '../../shared/plugin/types'
import { getEnabledOverride, setEnabledOverride } from './store'
import { broadcastPluginStateChanged } from '../ipc/plugins'
import { unloadExternalMain } from './host'

/**
 * 外部插件安装/卸载流程：
 * - 安装：选目录 → 校验 plugin.json → 复制到 userData/plugins/<id> → 广播刷新；
 * - 卸载：若启用先停用（主进程注销 IPC + 广播渲染层卸载）→ 删除目录 → 广播。
 */

/** 读取并校验目录下的 plugin.json（外部插件 manifest；builtin 恒为 false） */
export function readExternalManifest(dir: string): PluginManifest {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf-8'))
  if (!isValidManifest(raw)) {
    throw new Error('plugin.json 字段不完整或非法')
  }
  const manifest = raw as unknown as PluginManifest
  if (manifest.builtin) {
    throw new Error('内置插件不可作为外部插件安装')
  }
  return { ...manifest, builtin: false }
}

/** 安装外部插件：dialog 选目录 → 校验 → 复制（返回新插件 id） */
export async function installExternalPlugin(): Promise<string> {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: '选择插件文件夹'
  })
  if (result.canceled || result.filePaths.length === 0) {
    throw new Error('未选择目录')
  }
  const src = result.filePaths[0]
  const manifest = readExternalManifest(src)
  if (findExternalPlugin(manifest.id)) {
    throw new Error(`插件 '${manifest.id}' 已安装`)
  }
  const dest = path.join(externalPluginsRoot(), manifest.id)
  fs.cpSync(src, dest, { recursive: true })
  logger.info(`[Plugins] 外部插件安装: ${manifest.id} → ${dest}`)
  broadcastPluginStateChanged()
  return manifest.id
}

/** 卸载外部插件：启用中先停用（含主进程模块注销）再删除目录 */
export function uninstallExternalPlugin(id: string): void {
  const found = findExternalPlugin(id)
  if (!found) {
    throw new Error(`插件 '${id}' 不存在`)
  }
  if (getEnabledOverride(id) ?? false) {
    setEnabledOverride(id, false)
    unloadExternalMain(id)
  }
  // 若主模块此前加载失败（未入 externalMains），再兜底注销一次（幂等）
  unloadExternalMain(id)
  fs.rmSync(found.dir, { recursive: true, force: true })
  logger.info(`[Plugins] 外部插件卸载: ${id}`)
  broadcastPluginStateChanged()
}
