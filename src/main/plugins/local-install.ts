import { dialog } from 'electron'
import * as fs from 'fs'
import logger from 'electron-log'
import {
  extractZipToTemp,
  installPackageDir,
  resolvePackageRoot,
  type InstalledPackageInfo
} from './package-install'

/**
 * **从本地安装插件**：支持两种来源（用户 2026-09-26 要求）。
 *
 * - `.zip` 压缩包：解压到临时目录再按插件包安装（拒绝目录穿越；「压缩整个文件夹」
 *   多出来的那层顶层目录会自动剥掉，见 `extractZipToTemp`）；
 * - 文件夹：直接选插件**构建产物**目录（例如插件仓库里的 `dist/<id>`），也允许选
 *   它的上一级（只有一个包时自动下钻）。
 *
 * 为什么不直接把用户选的目录当插件目录用（符号链接/就地启用）：卸载语义是「删掉
 * `userData/plugins/<id>/`」，就地启用会让「删掉的是用户自己的源码目录」——所以一律
 * **拷进** `userData/plugins/<id>/`，与从仓库安装走同一条落地路径。
 */

/** 选择方式（面板两个按钮各对应一个） */
export type LocalPluginSourceKind = 'zip' | 'dir'

/**
 * 弹系统选择框拿到一个路径（取消返回 null）。
 *
 * 原生对话框**没法被自动化点击**，所以 CDP 工装走的是下面那个「按显式路径安装」的
 * IPC（`plugins-install-local`）；这里只负责真实用户的交互入口。
 */
export async function pickLocalPluginSource(kind: LocalPluginSourceKind): Promise<string | null> {
  if (kind === 'zip') {
    const result = await dialog.showOpenDialog({
      title: '选择插件压缩包',
      properties: ['openFile'],
      filters: [{ name: '插件压缩包 (*.zip)', extensions: ['zip'] }]
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  }
  const result = await dialog.showOpenDialog({
    title: '选择插件文件夹（构建产物目录）',
    properties: ['openDirectory']
  })
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

/** 按显式路径安装：`.zip` 或目录（工装与「拖进来的路径」都走这里） */
export async function installPluginFromLocalPath(source: string): Promise<InstalledPackageInfo> {
  let stat: fs.Stats
  try {
    stat = fs.statSync(source)
  } catch {
    throw new Error(`路径不存在：${source}`)
  }

  if (stat.isDirectory()) {
    return installPackageDir(resolvePackageRoot(source))
  }
  if (!stat.isFile()) {
    throw new Error(`只支持插件压缩包（.zip）或插件文件夹：${source}`)
  }
  if (!source.toLowerCase().endsWith('.zip')) {
    throw new Error('只支持 .zip 插件压缩包；如果是目录请用「从文件夹安装」')
  }

  const extracted = await extractZipToTemp(source)
  try {
    const info = installPackageDir(extracted)
    logger.info(`[Plugins] 本地压缩包安装完成：${source} → ${info.dest}`)
    return info
  } finally {
    fs.rmSync(extracted, { recursive: true, force: true })
  }
}
