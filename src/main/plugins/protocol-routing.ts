/**
 * `plugin://` 请求的**路由决策**（纯函数，零 import：可被 Node 直接加载做离线回归）。
 *
 * 为什么把它从 `src/main/plugins/protocol.ts` 里抽出来：
 * 这个文件只描述「哪个 URL 该配哪条状态码」——安全边界（目录穿越）、启用态、
 * 宿主保留 id、可选资源缺失，全都在这几条分支里，而它此前只能靠启动整个 Electron
 * 才能验证。抽成无依赖纯函数后，`test/verify-plugin-protocol-404.mjs` 用
 * `node --experimental-strip-types` 直接跑真实代码（协议处理器只留「按决策取文件」）。
 */

/** 解析结果：交给处理器去读文件 */
export interface PluginFileDecision {
  kind: 'file'
  /** 插件 id（log 用） */
  id: string
  /** 已解析的绝对路径 */
  abs: string
  /** 相对插件根目录的路径（log 用） */
  relPath: string
}

/** 解析结果：交给宿主 UI 桥生成 ESM（不读磁盘） */
export interface PluginBridgeDecision {
  kind: 'bridge'
  key: string
  /** 原始 query（含前导 `?`） */
  search: string
}

/** 解析结果：直接回一个状态码，不读磁盘 */
export interface PluginErrorDecision {
  kind: 'error'
  status: number
  /** 进程内诊断用的原因（不进响应体，避免泄漏磁盘路径） */
  reason:
    | 'bad-url'
    | 'bad-bridge-path'
    | 'missing-key'
    | 'not-found'
    | 'disabled'
    | 'forbidden'
    | 'not-a-file'
}

export type PluginRequestDecision = PluginFileDecision | PluginBridgeDecision | PluginErrorDecision

/** 处理器需要的宿主能力（注入以便离线测试） */
export interface PluginRequestDeps {
  /** 插件根目录（未安装返回 null） */
  pluginDir: (id: string) => string | null
  /** 插件是否处于启用态（停用插件不可访问任何文件） */
  isEnabled: (id: string) => boolean
  /** 目录 / 文件是否存在（注入后离线工装可脱离真实文件系统跑） */
  exists: (abs: string) => boolean
}

const PLUGIN_ID_RE = /^[A-Za-z0-9._-]+$/

/**
 * 宿主 UI 桥的固定路径。
 *
 * 与 `host-ui-bridge.ts` 的 `HOST_UI_BRIDGE_PATH` 是**同一个值**，刻意重复一次而不是
 * import：本模块必须零 import（见文件头）。防漂移由工装兜住——
 * `test/verify-plugin-protocol-404.mjs` 同时断言这两个常量都等于 `ui.js`。
 */
export const PLUGIN_BRIDGE_PATH = 'ui.js'

/**
 * 归一化路径：统一分隔符、去掉 `.` 段与重复分隔符。
 *
 * 为什么不用 `path.resolve`（那是原来处理器的写法）：这个模块刻意**零 import**，
 * 才能被 Node 直接加载做离线回归（见文件头）。归一化必须自己来，且必须是**字符串**
 * 层面的——把 `..` 一并消掉，这样解码出来的 `%2e%2e%2f` 也逃不出插件目录。
 */
function normalizePath(input: string): string {
  const unified = input.replace(/\\/g, '/')
  const isAbsolute = unified.startsWith('/')
  const out: string[] = []
  for (const seg of unified.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length > 0) out.pop()
      continue
    }
    out.push(seg)
  }
  return (isAbsolute ? '/' : '') + out.join('/')
}

/** 拼接插件目录与相对路径（结果已归一化，`..` 无法逃出） */
function joinPath(dir: string, rel: string): string {
  const base = dir.replace(/[/\\]+$/, '').replace(/\\/g, '/')
  const joined = rel ? `${base}/${rel}` : base
  return normalizePath(joined)
}

/** 判断 `abs` 是否落在 `dir` 内（防目录穿越；纯字符串比较，不碰文件系统） */
export function isInsideDir(dir: string, abs: string): boolean {
  const base = normalizePath(dir)
  // 归一化后 `..` 已被消解，这里只剩「同前缀」判定；根目录（`/`）直接放行
  if (base === '/' || base === '') return true
  return abs === base || abs.startsWith(`${base}/`)
}

/**
 * 解析 `plugin://` 请求 → 决策。
 *
 * 分支顺序有讲究，错了会改变语义：
 * 1. URL 不合法 → 400；
 * 2. 宿主保留 id `host` → 只服务 UI 桥路径，且必须带 `?m=<key>`（否则 400）；
 * 3. 插件不存在 → 404；**4. 已停用 → 403**（早于文件判定：不允许从停用插件探测文件是否存在）；
 * 5. 路径归一化后跑出插件目录 → 403（注意：`new URL` 会先消解**未编码**的 `..`，
 *    所以真正会撞上这条守卫的是 `%2e%2e%2f` 这类编码穿越——2026-09-26 工装实测）；
 * 6. **文件不存在 → 404**（缺失是可预期状态，不是 5xx；见 protocol.ts 的实测说明）；
 * 7. 其余 → 交处理器读取。
 */
export function resolvePluginRequest(input: {
  url: string
  /** 从 `?m=<key>` 解析出的桥 key（由处理器按自己的口径解析；缺省为 null） */
  bridgeKey: string | null
  deps: PluginRequestDeps
}): PluginRequestDecision {
  const { deps } = input
  let parsed: URL
  try {
    parsed = new URL(input.url)
  } catch {
    return { kind: 'error', status: 400, reason: 'bad-url' }
  }
  if (parsed.protocol !== 'plugin:') return { kind: 'error', status: 400, reason: 'bad-url' }

  const id = parsed.hostname || parsed.pathname.replace(/^\/+/, '').split('/')[0] || ''
  if (!PLUGIN_ID_RE.test(id)) return { kind: 'error', status: 400, reason: 'bad-url' }
  // `plugin://<id>/a.js` 的 hostname 是 id；`plugin:///<id>/a.js`（无 authority）则切掉 id 段
  const rawPath = parsed.hostname
    ? parsed.pathname
    : parsed.pathname.replace(new RegExp(`^/+${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '')
  let relPath = rawPath
  try {
    relPath = decodeURIComponent(rawPath)
  } catch {
    // 编码非法：保留原文（下游当普通路径处理）
  }
  relPath = relPath.replace(/^\/+/, '')

  if (id === 'host') {
    if (relPath !== PLUGIN_BRIDGE_PATH) {
      return { kind: 'error', status: 404, reason: 'bad-bridge-path' }
    }
    if (!input.bridgeKey) return { kind: 'error', status: 400, reason: 'missing-key' }
    return { kind: 'bridge', key: input.bridgeKey, search: parsed.search }
  }

  const dir = deps.pluginDir(id)
  if (!dir) return { kind: 'error', status: 404, reason: 'not-found' }
  if (!deps.isEnabled(id)) return { kind: 'error', status: 403, reason: 'disabled' }

  const abs = joinPath(dir, relPath)
  if (!isInsideDir(dir, abs)) return { kind: 'error', status: 403, reason: 'forbidden' }
  if (!deps.exists(abs)) return { kind: 'error', status: 404, reason: 'not-a-file' }
  return { kind: 'file', id, abs, relPath }
}
