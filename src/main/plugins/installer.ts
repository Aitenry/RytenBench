import { app } from 'electron'
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
import { PACKAGED_READY_IDS } from './packaged'
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
 * - **只覆盖包自带的产物文件**（plugin.json/main.cjs/renderer.mjs），不删整个目录：
 *   插件目录里可能还有用户放进去的额外资源。
 */

/** 插件包自带的产物文件（铺包时覆盖的白名单） */
const PACKAGE_FILES = ['plugin.json', 'main.cjs', 'renderer.mjs']

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
 * 三重过滤：
 * - 只认「随应用分发的内置插件」（`src/plugins/manifests.ts` 里的 id）——
 *   `resources/plugins/` 下还可能有别的东西（构建脚本会把 `examples/demo-plugin`
 *   一起放进去当第三方插件示例），它们不该被自动铺进 userData、更不该默认启用；
 * - 只认 `PACKAGED_READY_IDS`（P1 = music、P2 = planner，见该常量的说明）；
 * - 目录里必须真的有 `plugin.json`。
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
        PACKAGED_READY_IDS.has(e.name) &&
        fs.existsSync(path.join(root, e.name, 'plugin.json'))
    )
    .map((e) => e.name)
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
    for (const file of PACKAGE_FILES) {
      const from = path.join(src, file)
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dest, file))
    }
    setPluginSeeded(id, app.getVersion())
    invalidateInstalledPluginIds()
    logger.info(`[Plugins] 插件包已${force ? '重' : '首次'}安装: ${id} → ${dest}`)
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
