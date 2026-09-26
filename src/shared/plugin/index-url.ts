/**
 * 独立插件仓库（`github.com/Aitenry/ryten-plugins`）的 **URL 规则**（纯函数，无 electron/node 依赖）。
 *
 * 应用只读两样东西（不需要 GitHub API、不需要 token）：
 *
 *   <indexBase>/plugins.json        索引：可选 tag + 各插件的 id / 版本 / asset / sha256
 *   <releaseBase>/<tag>/<asset>     Release 资产（zip）
 *
 * 为什么单独一个模块：这段规则决定了「真实 GitHub 上到底去哪个地址下载」，
 * 而它没法在离线工装里打到真 GitHub（仓库还没发布）。抽成纯函数后
 * `test/verify-plugin-asset-url.mjs` 可以对每个分支逐个断言字符串，
 * 运行期只剩 `github.ts` 负责把 `process.env` 传进来。
 *
 * 两条容易踩的规则：
 * - **没有 tag 时必须是 `releases/latest/download/<asset>`**，不是 `releases/download/latest/<asset>`
 *   （后者在 GitHub 上是 404——「latest」是路径段而不是 tag 名）；
 * - 覆盖地址（`RB_PLUGINS_REPO` 指向本机 fixture 服务器）时索引与资产**同源**：
 *   fixture 只服务 `<port>/plugins.json` 与 `<port>/<asset>`，没有 Release 目录结构。
 */

export const DEFAULT_INDEX_BASE = 'https://raw.githubusercontent.com/Aitenry/ryten-plugins/main'
export const DEFAULT_RELEASE_BASE = 'https://github.com/Aitenry/ryten-plugins/releases/download'

/** 去掉末尾斜杠（`https://x/y/` → `https://x/y`） */
export function trimSlashes(url: string): string {
  return url.replace(/\/+$/, '')
}

/** 索引基址：`RB_PLUGINS_REPO` 覆盖，否则仓库 main 分支的 raw 地址 */
export function resolveIndexBase(repoOverride?: string): string {
  return trimSlashes(repoOverride && repoOverride.length > 0 ? repoOverride : DEFAULT_INDEX_BASE)
}

/** 索引 URL（面板里的「插件仓库」来源与 `plugin.available()` 都取这个） */
export function pluginIndexUrl(repoOverride?: string): string {
  return `${resolveIndexBase(repoOverride)}/plugins.json`
}

/** 本机 fixture 模式：索引是 http(s)://127.0.0.1|localhost 时，资产与索引同源 */
export function isLocalIndexBase(base: string): boolean {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(base)
}

/** Release 资产基址：`RB_PLUGINS_RELEASE_BASE` 覆盖 → fixture 同源 → 官方 Release 目录 */
export function resolveReleaseBase(repoOverride?: string, releaseOverride?: string): string {
  if (releaseOverride && releaseOverride.length > 0) return trimSlashes(releaseOverride)
  const index = resolveIndexBase(repoOverride)
  return isLocalIndexBase(index) ? index : DEFAULT_RELEASE_BASE
}

/**
 * 某个资产的下载地址。
 *
 * - 本机 fixture：`<base>/<asset>`（与索引同源）
 * - 有 tag：`<base>/<tag>/<asset>`
 * - 无 tag：`<base>/latest/download/<asset>`（官方 Release 目录形态，指向最新 Release）
 * - 无 tag 且 releaseBase 被自定义（不是官方 `.../releases/download`）：退化成 `<base>/latest/<asset>`，
 *   因为自定义地址的目录结构无从推断——这种组合只在工装里出现，且工装都会带 tag。
 */
export function pluginAssetUrl(opts: {
  asset: string
  tag?: string
  repoOverride?: string
  releaseOverride?: string
}): string {
  const index = resolveIndexBase(opts.repoOverride)
  const base = resolveReleaseBase(opts.repoOverride, opts.releaseOverride)
  if (isLocalIndexBase(index) && !opts.releaseOverride) return `${base}/${opts.asset}`
  if (opts.tag) return `${base}/${opts.tag}/${opts.asset}`
  if (/\/releases\/download$/.test(base)) {
    return `${base.replace(/\/releases\/download$/, '/releases/latest/download')}/${opts.asset}`
  }
  return `${base}/latest/${opts.asset}`
}
