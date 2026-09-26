import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 插件包「应用包里的那份 vs 已安装的那份」的**内容比对**（内置插件自动更新的判据）。
 *
 * 为什么需要它（2026-09-26 用户实测）：「内置插件不检测更新，每次都得进设置页点一下更新」。
 * 旧判据只有一条——`plugins.json` 的 `seeded[id]` 记着上次铺包时的**应用版本**，版本变了才覆盖。
 * 可现实里代码变了而版本号没变的情况一大把：
 * - `pnpm dev` 下 `scripts/build-plugins.mjs` 重打了产物，应用版本始终是 `0.1.0`；
 * - 打包时同版本重发（热修、内测包）；
 * - 用户机器上的副本被手工动过/写坏了。
 * 这三种情况旧判据都判「无需更新」，于是 `userData/plugins/<id>/` 里那份**一直是旧的**，
 * 只能靠人去设置页面点「更新」。
 *
 * 判据换成**内容指纹**：先比文件集与字节数（便宜，绝大多数不一致在这里就能判出来），
 * 全都一样时才逐文件读盘算 sha1（真实数据下 harness ≈ 2.4MB / notes ≈ 1.3MB，
 * 一次性读盘 + 哈希的量级见 `test/verify-bundled-plugin-drift.mjs` 的实测输出）。
 *
 * 本模块**零 Electron 依赖**（只用 node 内建），因此可以被 Node 直接加载做离线回归：
 * `node --experimental-strip-types test/verify-bundled-plugin-drift.mjs`。
 */

/**
 * 插件包产物文件的命名模式（铺包时覆盖的范围）。
 *
 * 渲染层是**多文件**产物：入口 `renderer.mjs` 加上若干懒加载 `chunk-<hash>.mjs`
 * （notes 的 GraphView / harness 的 codemirror 语言包等），因此不能硬编码三件套。
 * `installer.ts` 的铺包与本模块的指纹共用这一份定义（单一真源，避免两处漂移）。
 */
export const PACKAGE_FILE_RE = /^(plugin\.json|main\.cjs|renderer\.mjs|chunk-[A-Za-z0-9_-]+\.mjs)$/

/**
 * 「旧版残留产物」的模式：与本包产物同模式、但本次不再产出的文件（主要是旧的
 * `chunk-<hash>.mjs`，升级后文件名变了）。比 `PACKAGE_FILE_RE` 少 `plugin.json`——
 * 清单永远会被产出，不可能成为残留。
 */
export const STALE_ARTIFACT_RE = /^(renderer\.mjs|main\.cjs|chunk-[A-Za-z0-9_-]+\.mjs)$/

/** 包内产物清单：文件名 → 字节数（目录不存在返回 null） */
export type PackageSizes = Record<string, number>

/** 包内产物的内容指纹：文件名 → sha1 摘要 */
export type PackageDigest = Record<string, string>

/**
 * 列出包内产物及其字节数（只认 `PACKAGE_FILE_RE` 命中的普通文件）。
 *
 * 不存在的目录返回 null（调用方据此区分「没这份包」与「包是空的」）；
 * 读单个文件属性失败（并发删除）就跳过它——比对会因为「文件集不同」判出差异，
 * 而不是抛异常打断启动。
 */
export function packageSizes(dir: string): PackageSizes | null {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return null
  }
  const out: PackageSizes = {}
  for (const name of names) {
    if (!PACKAGE_FILE_RE.test(name)) continue
    try {
      const stat = fs.statSync(path.join(dir, name))
      if (stat.isFile()) out[name] = stat.size
    } catch {
      // 并发删除：忽略，文件集差异自会体现
    }
  }
  return out
}

/** 逐文件算 sha1（文件集与 `packageSizes` 一致；目录不存在返回 null） */
export function packageDigest(dir: string): PackageDigest | null {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return null
  }
  const out: PackageDigest = {}
  for (const name of names) {
    if (!PACKAGE_FILE_RE.test(name)) continue
    try {
      out[name] = createHash('sha1')
        .update(fs.readFileSync(path.join(dir, name)))
        .digest('hex')
    } catch {
      // 并发删除：忽略
    }
  }
  return out
}

/** 差异原因（一句话，日志与工装都按它断言） */
export type PackageDriftReason =
  /** 应用包里没有这个插件包 */
  | 'no-bundle'
  /** 已安装目录不存在（或一个产物文件都没有） */
  | 'not-installed'
  /** 应用包里有、已安装副本里缺（升级后新增的文件） */
  | 'missing-artifacts'
  /** 已安装副本里有、应用包里没有（旧版残留的 chunk 等） */
  | 'stale-artifacts'
  /** 同名文件内容不同（大小或哈希） */
  | 'changed'
  /** 两边一致，无需铺包 */
  | 'in-sync'

export interface PackageDrift {
  /** true = 需要拿应用包里的那份覆盖已安装副本 */
  drifted: boolean
  reason: PackageDriftReason
  /** 具体差异文件名（最多 5 个，日志用；不截断完整列表在 `files` 里） */
  summary: string
  files: string[]
}

/**
 * 比对应用包副本与已安装副本，判断「要不要重铺」。
 *
 * 顺序刻意从便宜到贵：文件集 → 字节数 → 内容哈希。字节数一致但内容不同（同长度改写）
 * 必须靠哈希才能发现，所以最后一步读盘；真实数据下这一步的量级是几 MB。
 */
export function detectPackageDrift(bundledDir: string, installedDir: string): PackageDrift {
  const bundled = packageSizes(bundledDir)
  if (!bundled) {
    return { drifted: true, reason: 'no-bundle', summary: '', files: [] }
  }
  if (Object.keys(bundled).length === 0) {
    return { drifted: true, reason: 'no-bundle', summary: '', files: [] }
  }
  const installed = packageSizes(installedDir)
  if (!installed || Object.keys(installed).length === 0) {
    return { drifted: true, reason: 'not-installed', summary: '', files: [] }
  }

  const make = (reason: PackageDriftReason, files: string[]): PackageDrift => ({
    drifted: true,
    reason,
    summary: files.slice(0, 5).join(', '),
    files
  })

  const missing = Object.keys(bundled).filter((name) => !(name in installed))
  if (missing.length > 0) return make('missing-artifacts', missing)

  const stale = Object.keys(installed).filter((name) => !(name in bundled))
  if (stale.length > 0) return make('stale-artifacts', stale)

  const sizeDiff = Object.keys(bundled).filter((name) => bundled[name] !== installed[name])
  if (sizeDiff.length > 0) return make('changed', sizeDiff)

  // 文件集与字节数都一样：只有内容哈希能发现「同长度改写」
  const bundledDigest = packageDigest(bundledDir)
  const installedDigest = packageDigest(installedDir)
  if (!bundledDigest || !installedDigest) {
    // 读盘期间被删/权限变化：按「需要重铺」处理（installBundledPlugin 会重新 copy）
    return make('not-installed', [])
  }
  const changed = Object.keys(bundledDigest).filter(
    (name) => bundledDigest[name] !== installedDigest[name]
  )
  if (changed.length > 0) return make('changed', changed)

  return { drifted: false, reason: 'in-sync', summary: '', files: [] }
}
