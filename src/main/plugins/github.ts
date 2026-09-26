import { net } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createHash } from 'crypto'
import logger from 'electron-log'
import { pluginAssetUrl, pluginIndexUrl, resolveIndexBase } from '../../shared/plugin/index-url'
import { isBundledPluginId } from './host'
import { extractZipToTemp, installPackageDir } from './package-install'

/**
 * **从 GitHub 安装插件**（独立插件仓库的发行链路）。
 *
 * 插件仓库里有两样东西（见 github.com/Aitenry/ryten-plugins）：
 *
 *   <indexBase>/plugins.json                  索引：tag + 各插件的 id / 名称 / 版本 / asset / sha256
 *   <releaseBase>/<tag>/<asset>               Release 资产（zip，内含 plugin.json / main.cjs / renderer.mjs / chunk-*.mjs）
 *
 * 为什么是「索引 + 直接下载」而不是 GitHub API：API 有速率限制、私有仓库还要 token；
 * 索引在仓库根、资产在 Release 下载地址，都是公开静态 URL，`net.fetch` 直接取即可。
 *
 * 覆盖地址：环境变量 `RB_PLUGINS_REPO`（形如 `https://raw.githubusercontent.com/<owner>/<repo>/main`）。
 * 离线工装用它指向本机 fixture 服务器（此时索引与资产同源，`http://127.0.0.1:<port>/<asset>`）。
 *
 * URL 规则（含「索引里没有 tag 时走 `releases/latest/download/...`」这条）在
 * `src/shared/plugin/index-url.ts`，由 `test/verify-plugin-asset-url.mjs` 逐分支断言——
 * 真 GitHub 地址没法在离线工装里实测，只能把规则本身锁住。
 *
 * 「解压 + 校验 + 落地」这段与**本地安装**共用 `package-install.ts`（同一套校验与升级清理）。
 */

/** 索引里的一条插件 */
export interface AvailablePlugin {
  id: string
  name: string
  version: string
  description?: string
  asset: string
  size?: number
  sha256?: string
}

/** 解析后的索引 */
export interface PluginIndex {
  /** 资产所在的 Release tag（CI 发布时写入；缺失时回退「最新 Release」） */
  tag?: string
  plugins: AvailablePlugin[]
}

/** 索引基址（`RB_PLUGINS_REPO` 覆盖，末尾斜杠忽略） */
function indexBase(): string {
  return resolveIndexBase(process.env.RB_PLUGINS_REPO)
}

export function pluginsRepoUrl(): string {
  return indexBase()
}

/** 读索引（形状不对的条目直接丢弃，坏索引不该把面板搞崩） */
export async function fetchPluginIndex(): Promise<PluginIndex> {
  const url = pluginIndexUrl(process.env.RB_PLUGINS_REPO)
  const res = await net.fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`读取插件索引失败：HTTP ${res.status}（${url}）`)
  const raw = (await res.json()) as { tag?: unknown; plugins?: unknown }
  const list = Array.isArray(raw.plugins) ? raw.plugins : []
  const plugins = list.filter(
    (p): p is AvailablePlugin =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as AvailablePlugin).id === 'string' &&
      typeof (p as AvailablePlugin).asset === 'string' &&
      typeof (p as AvailablePlugin).version === 'string'
  )
  return { tag: typeof raw.tag === 'string' ? raw.tag : undefined, plugins }
}

/** 资产 URL：fixture 模式下与索引同源，否则走 Release 下载地址（无 tag 时指向最新 Release） */
function assetUrl(entry: AvailablePlugin, tag?: string): string {
  return pluginAssetUrl({
    asset: entry.asset,
    tag,
    repoOverride: process.env.RB_PLUGINS_REPO,
    releaseOverride: process.env.RB_PLUGINS_RELEASE_BASE
  })
}

/** 下载资产到临时文件，并按索引里的 sha256 校验完整性 */
async function downloadAsset(entry: AvailablePlugin, tag?: string): Promise<string> {
  const url = assetUrl(entry, tag)
  const res = await net.fetch(url)
  if (!res.ok) throw new Error(`下载插件包失败：HTTP ${res.status}（${url}）`)
  const buffer = Buffer.from(await res.arrayBuffer())

  if (entry.sha256) {
    const actual = createHash('sha256').update(buffer).digest('hex')
    if (actual !== entry.sha256) {
      throw new Error(
        `插件包校验失败（sha256 不一致，可能下载被截断）：期望 ${entry.sha256.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…`
      )
    }
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryten-plugin-'))
  const zipPath = path.join(dir, entry.asset)
  fs.writeFileSync(zipPath, buffer)
  logger.info(`[Plugins] 已下载 ${entry.asset}（${(buffer.length / 1024).toFixed(1)}KB）`)
  return zipPath
}

/**
 * 安装（或升级）来自插件仓库的插件：索引 → 下载 → sha256 校验 → 解压 → 装进 `userData/plugins/<id>/`。
 *
 * 只接受**独立插件**（包内 `plugin.json` 的 `builtin` 必须为 false）、id 不能与内置插件撞名
 * （内置插件的装卸由应用包那条链路负责）。
 */
export async function installPluginFromGithub(id: string): Promise<{ ok: true; id: string }> {
  if (isBundledPluginId(id)) {
    throw new Error(`'${id}' 是随应用分发的内置插件，请用面板里的「安装」按钮`)
  }

  const index = await fetchPluginIndex()
  const entry = index.plugins.find((p) => p.id === id)
  if (!entry) {
    throw new Error(
      `插件仓库里没有 '${id}'（可选：${index.plugins.map((p) => p.id).join(', ') || '（索引为空）'}）`
    )
  }

  logger.info(`[Plugins] 从插件仓库安装 ${id} v${entry.version}（tag=${index.tag ?? 'latest'}）`)
  const zipPath = await downloadAsset(entry, index.tag)
  const extracted = await extractZipToTemp(zipPath)
  try {
    installPackageDir(extracted, { expectId: id })
    return { ok: true, id }
  } finally {
    fs.rmSync(extracted, { recursive: true, force: true })
    fs.rmSync(path.dirname(zipPath), { recursive: true, force: true })
  }
}
