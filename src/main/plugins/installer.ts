import { app } from 'electron'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import logger from 'electron-log'
import {
  clearUninstalled,
  getUninstalledBuiltins,
  getPluginSeeded,
  markUninstalled,
  setPluginSeeded
} from './store'
import { externalPluginsRoot, findExternalPlugin, invalidateInstalledPluginIds } from './scanner'
import { BUILTIN_PLUGIN_MANIFESTS } from '../../plugins/manifests'

/**
 * 「内置插件」的**首次安装 / 重装**（物理卸载方案见 src/plugins/PACKAGING.md）。
 *
 * 目标形态：应用包里带着每个内置插件的完整插件包（只读）
 *
 *   resources/plugins/<id>/{plugin.json,main.cjs,renderer.mjs}   ← scripts/build-plugins.mjs 产出
 *
 * 首次启动时整包 copy 到可读写的 `userData/plugins/<id>/`，此后**只**从那里加载
 * （与用户自己装的第三方插件走完全相同的链路），于是「卸载」就是删目录——
 * 真正的物理卸载，而不是开关。
 *
 * 三条必须记住的规则：
 * - **用户卸载过就不再装回来**：`plugins.json` 的 `uninstalled` 列表记着用户主动卸载过的
 *   内置 id，自动安装一律跳过（重装只能由用户点「安装」）。
 * - **应用升级要重新铺**：`seeded[id]` 记下上次铺包时的应用版本，版本变了就覆盖产物
 *   （否则应用升级后用户机器上还是旧版插件代码）。
 * - **只覆盖包自带的产物文件**（plugin.json / main.cjs / renderer.mjs / 渲染层懒加载
 *   `chunk-*.mjs`），不删整个目录：插件目录里可能还有用户放进去的额外资源。
 *   旧版本的 `chunk-*.mjs`（名字里有内容哈希，升级后会变）会被顺手清掉，否则每升一次级
 *   就多留几十个再也不会被引用的文件。
 */

/**
 * 插件包产物文件的命名模式（铺包时覆盖）。
 *
 * 渲染层现在是**多文件**产物（P3 起）：入口 `renderer.mjs` 加上若干懒加载
 * `chunk-<hash>.mjs`（home 的 GraphView / harness 的 codemirror 语言包等）。
 * 因此不能再硬编码三件套，改为「按模式识别产物文件」。
 */
const PACKAGE_FILE_RE = /^(plugin\.json|main\.cjs|renderer\.mjs|chunk-[A-Za-z0-9_-]+\.mjs)$/

/** 旧版残留的产物文件：与本包产物同模式、但本次不再产出的（升级清理） */
const STALE_ARTIFACT_RE = /^(renderer\.mjs|main\.cjs|chunk-[A-Za-z0-9_-]+\.mjs)$/

/**
 * 随应用分发的内置插件 id（单一真源 = `src/plugins/manifests.ts`）。
 *
 * 用清单的 id 而不是「目录名」来判定 bundled：`resources/plugins/` 里也可能有
 * 别的目录（例如作为第三方示例的 `demo-plugin`），它们不属于「内置」。
 */
const BUILTIN_IDS: ReadonlySet<string> = new Set(BUILTIN_PLUGIN_MANIFESTS.map((m) => m.id))

/** 应用包内的插件根目录（dev = 仓库根 `resources/plugins`；打包后 = `resources/plugins`） */
export function bundledPluginsRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'plugins')
    : path.join(app.getAppPath(), 'resources', 'plugins')
}

/** 应用包内某插件的目录（清单不存在返回 null） */
export function bundledPluginDir(id: string): string | null {
  const dir = path.join(bundledPluginsRoot(), id)
  return fs.existsSync(path.join(dir, 'plugin.json')) ? dir : null
}

/**
 * 应用包内所有可安装插件的 id（按目录扫描；读不到清单的目录跳过）。
 *
 * 双重过滤：
 * - 只认「随应用分发的内置插件」（`src/plugins/manifests.ts` 里的 id）——
 *   `resources/plugins/` 下还可能有别的东西（构建脚本会把 `examples/demo-plugin`
 *   一起放进去当第三方插件示例），它们不该被自动铺进 userData、更不该默认启用；
 * - 目录里必须真的有 `plugin.json`。
 *
 * （P1~P4 期间还有一层 `PACKAGED_READY_IDS` 白名单，P5 已删：四个插件都走磁盘包了。）
 */
export function listBundledPluginIds(): string[] {
  const root = bundledPluginsRoot()
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter(
      (e) =>
        e.isDirectory() &&
        BUILTIN_IDS.has(e.name) &&
        fs.existsSync(path.join(root, e.name, 'plugin.json'))
    )
    .map((e) => e.name)
}

/** 某内置插件在应用包里的产物是否落后于它的源码（dev 用；只看 mtime） */
function isPackageOlderThanSources(id: string): boolean {
  const artifact = path.join(bundledPluginsRoot(), id, 'main.cjs')
  if (!fs.existsSync(artifact)) return true
  const artifactTime = fs.statSync(artifact).mtimeMs
  const srcRoot = path.join(app.getAppPath(), 'src', 'plugins', id)
  let newestSource = 0
  const walk = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else newestSource = Math.max(newestSource, fs.statSync(full).mtimeMs)
    }
  }
  walk(srcRoot)
  return newestSource > artifactTime
}

/**
 * **dev 专用**：启动时按需补打插件包。
 *
 * 为什么必须有：P5 删掉了应用内的静态插件注册表，`pnpm dev` 下如果 `resources/plugins/`
 * 是空的，界面上就**一个插件都没有**（空壳）。这里在安装流程之前用同一个脚本补打：
 * - 缺产物 → 打那一个插件（`--dev`：不压缩 + inline sourcemap，便于调试）；
 * - 产物比源码旧（改了插件源码忘了重打包，P3 实测踩过）→ 重打那一个；
 * - 打包后仍是老样子（脚本报错）→ 只记日志，让「界面没插件」的现象自己说话。
 *
 * 用 `ELECTRON_RUN_AS_NODE=1` 让 Electron 自己的二进制以 Node 身份跑构建脚本——
 * 打包后的应用里没有独立的 node，dev 下用 `process.execPath` 最省事。
 */
function ensureDevPackagesBuilt(): void {
  if (app.isPackaged) return
  const script = path.join(app.getAppPath(), 'scripts', 'build-plugins.mjs')
  if (!fs.existsSync(script)) return
  const ids = BUILTIN_PLUGIN_MANIFESTS.map((m) => m.id)
  const missing = ids.filter(
    (id) => !fs.existsSync(path.join(bundledPluginsRoot(), id, 'plugin.json'))
  )
  const stale = ids.filter((id) => !missing.includes(id) && isPackageOlderThanSources(id))
  const targets = [...new Set([...missing, ...stale])]
  if (targets.length === 0) return

  logger.info(
    `[Plugins] dev：重新打包插件（缺产物：${missing.join('/') || '无'}；产物落后于源码：${stale.join('/') || '无'}）`
  )
  for (const id of targets) {
    const result = spawnSync(process.execPath, [script, '--plugin', id, '--dev'], {
      cwd: app.getAppPath(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'ignore'
    })
    if (result.status !== 0) {
      logger.error(`[Plugins] dev 打包 '${id}' 失败（status=${result.status}），该插件本轮不可用`)
    }
  }
}

/**
 * 把应用包里的插件包 copy 到 `userData/plugins/<id>/`。
 *
 * @param force 为 true 时即使已安装也覆盖产物文件（应用升级、用户点「安装」）
 * @returns 安装后 `userData/plugins/<id>/` 是否是可用插件（清单合法）
 */
export function installBundledPlugin(id: string, force = false): boolean {
  const src = bundledPluginDir(id)
  if (!src) {
    logger.warn(`[Plugins] 应用包内没有插件包 '${id}'（${bundledPluginsRoot()}）`)
    return false
  }
  if (findExternalPlugin(id) && !force) return true

  const dest = path.join(externalPluginsRoot(), id)
  try {
    fs.mkdirSync(dest, { recursive: true })
    const artifacts = fs.readdirSync(src).filter((f) => PACKAGE_FILE_RE.test(f))
    for (const file of artifacts) {
      fs.copyFileSync(path.join(src, file), path.join(dest, file))
    }
    // 升级清理：同模式但本次不再产出的产物（主要是旧的 chunk-<hash>.mjs）逐个删掉
    const keep = new Set(artifacts)
    for (const file of fs.readdirSync(dest)) {
      if (!STALE_ARTIFACT_RE.test(file) || keep.has(file)) continue
      try {
        fs.rmSync(path.join(dest, file), { force: true })
      } catch {
        // 删不掉只影响目录整洁，不影响加载（入口只引用本包的 chunk）
      }
    }
    setPluginSeeded(id, app.getVersion())
    invalidateInstalledPluginIds()
    logger.info(
      `[Plugins] 插件包已${force ? '重' : '首次'}安装: ${id} → ${dest}（产物 ${artifacts.length} 个）`
    )
    return true
  } catch (err) {
    logger.error(`[Plugins] 插件包 '${id}' 安装失败:`, err)
    return false
  }
}

/**
 * 启动时把应用包里的插件铺到 `userData/plugins/`（幂等）。
 *
 * 必须在**扫描外部插件之前**调用（`initPluginHost()` 开头）：扫描看到的是铺完之后的
 * 目录，内置与第三方因此走同一条装载路径。用户主动卸载过的 id 一律跳过。
 */
export function ensureBundledPluginsInstalled(): void {
  ensureDevPackagesBuilt()
  const ids = listBundledPluginIds()
  if (ids.length === 0) {
    logger.warn(
      `[Plugins] 应用包内没有插件目录（${bundledPluginsRoot()}）：` +
        `dev 下请先跑 node scripts/build-plugins.mjs，构建机请确认 resources/plugins 已随包分发`
    )
    return
  }
  const uninstalled = new Set(getUninstalledBuiltins())
  const version = app.getVersion()

  for (const id of ids) {
    if (uninstalled.has(id)) continue
    if (!findExternalPlugin(id)) {
      // 首次安装（或用户手工删了目录）：铺一份，并清掉可能残留的 uninstalled 标记之外的记录
      installBundledPlugin(id)
      continue
    }
    // 已安装但铺包版本变了（应用升级）→ 覆盖产物文件
    if (getPluginSeeded(id) !== version) installBundledPlugin(id, true)
  }
}

/**
 * 标记某内置插件为「用户主动卸载」：从 `userData/plugins/` 删目录并记入 `uninstalled`。
 * 只删插件目录，不碰插件数据（数据清除由 `plugin.purge` 贡献负责）。
 */
export function removeBundledPlugin(id: string): void {
  const found = findExternalPlugin(id)
  if (found) fs.rmSync(found.dir, { recursive: true, force: true })
  invalidateInstalledPluginIds()
  markUninstalled(id)
  logger.info(`[Plugins] 插件包已卸载: ${id}`)
}

/** 重装内置插件：铺回目录 + 清掉 `uninstalled` 记录 */
export function reinstallBundledPlugin(id: string): boolean {
  const ok = installBundledPlugin(id, true)
  if (ok) clearUninstalled(id)
  return ok
}
