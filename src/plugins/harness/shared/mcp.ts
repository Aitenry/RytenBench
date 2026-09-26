/**
 * MCP（Model Context Protocol）服务器配置的**跨进程 DTO**（主进程 ↔ 渲染层 ↔ electron-store）。
 *
 * 为什么单独一个文件、且运行期零依赖：这份形状同时被三处消费——
 *  - 主进程的连接管理器（`main/runtime/mcp.ts`，把配置翻成 @langchain/mcp-adapters 的连接）；
 *  - 设置 → MCP 页的表单（`renderer/components/settings/McpSettings.tsx`）；
 *  - 落盘（electron-store 的 `mcpServers` 键，见 `main/runtime/mcp-store.ts`）。
 *
 * 字段命名刻意对齐 mcp.json / Cursor / Claude Desktop 的通用写法（command/args/env、url/headers），
 * 这样用户可以直接粘贴现成的服务器条目，不用重写一遍。
 */

/** 传输方式：本地进程（stdio）或远程地址（Streamable HTTP，可回退 SSE） */
export type McpTransport = 'stdio' | 'http' | 'sse'

/** 一条 MCP 服务器配置（electron-store 里存的就是它的数组） */
export interface McpServerConfig {
  /** 稳定标识（nanoid/时间戳生成），工具命名空间与增删改都按它定位 */
  id: string
  /** 展示名（设置页与工具卡片上用），也是工具名前缀的来源（会被净化成 [A-Za-z0-9_-]） */
  name: string
  /** 补充说明（可为空）：这台服务器接的是什么，便于以后分辨 */
  description?: string
  /** 是否启用：停用即不连接、其工具也不出现在工具清单里 */
  enabled: boolean
  transport: McpTransport
  /** stdio：可执行文件（如 npx / uvx / node） */
  command?: string
  /** stdio：命令行参数 */
  args?: string[]
  /** stdio：附加环境变量（在宿主环境之上叠加） */
  env?: Record<string, string>
  /** stdio：工作目录（可选） */
  cwd?: string
  /** http/sse：服务地址 */
  url?: string
  /** http/sse：附加请求头（token 等） */
  headers?: Record<string, string>
  /** 单次工具调用超时（毫秒）；留空用工程默认值 */
  timeoutMs?: number
}

/** 服务器连上后拿到的一条工具（设置页展示 + 工具清单并入用） */
export interface McpToolInfo {
  /** 全名（`mcp__<serverId>__<toolName>`），即模型看到的名字 */
  name: string
  /** 服务器上报的原始工具名 */
  rawName: string
  /** 给模型看的描述（可能为空） */
  description: string
}

/** 服务器的实时连接状态（设置页逐行展示；连不上的原因要能看见） */
export type McpServerStatus = 'ok' | 'error' | 'disabled' | 'unconfigured'

/** 设置页一行的视图（配置 + 运行期状态 + 工具清单） */
export interface McpServerView {
  config: McpServerConfig
  status: McpServerStatus
  /** status === 'error' 时的失败原因（原始错误信息） */
  error?: string
  tools: McpToolInfo[]
  /** 本行凭据里的敏感值是否已配置（渲染层只显示「已设置」，不回传明文） */
  hasSecrets: { env: boolean; headers: boolean }
}

/** 设置页保存时的入参（id 缺省表示新增） */
export type McpServerInput = Omit<McpServerConfig, 'id'> & { id?: string }

/**
 * 把任意来源的条目规整成合法配置（新增/编辑/导入 mcp.json 共用）。
 *
 * 宽容之处（都是为了「粘贴现成 JSON 就能用」）：
 *  - `type` / `transport` 二选一，`sse` 归一成自己的传输；
 *  - 缺少 `args` 时补空数组（stdio 连接 schema 要求是数组）；
 *  - 名字非法（空）时用 id 兜底，id 也缺时由调用方生成。
 * 非法输入抛错，错误信息面向用户可直接显示在表单下方。
 */
export function normalizeMcpServer(input: McpServerInput): McpServerConfig {
  const id = (input.id ?? '').trim()
  const name = (input.name ?? '').trim() || id
  if (!name) throw new Error('MCP server name is required')

  const rawType = (input.transport ?? (input as { type?: string }).type ?? 'stdio') as string
  const transport: McpTransport =
    rawType === 'http' || rawType === 'sse' ? rawType : ('stdio' as McpTransport)

  if (transport === 'stdio') {
    const command = (input.command ?? '').trim()
    if (!command) throw new Error('MCP stdio server requires a command')
    return {
      id: id || name,
      name,
      description: input.description?.trim() || undefined,
      enabled: input.enabled ?? true,
      transport,
      command,
      args: Array.isArray(input.args) ? input.args.map((a) => String(a)) : [],
      env: cleanMap(input.env),
      cwd: input.cwd?.trim() || undefined,
      timeoutMs: cleanTimeout(input.timeoutMs)
    }
  }

  const url = (input.url ?? '').trim()
  if (!url) throw new Error('MCP HTTP server requires a url')
  return {
    id: id || name,
    name,
    description: input.description?.trim() || undefined,
    enabled: input.enabled ?? true,
    transport,
    url,
    headers: cleanMap(input.headers),
    timeoutMs: cleanTimeout(input.timeoutMs)
  }
}

/** 去掉空键/空值；全空时返回 undefined（避免落盘一堆空对象） */
function cleanMap(map?: Record<string, string>): Record<string, string> | undefined {
  if (!map) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(map)) {
    const k = key.trim()
    if (k && value !== undefined && value !== null) out[k] = String(value)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function cleanTimeout(value?: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value)
}

/**
 * 工具名命名空间：`mcp__<server>__<tool>`。
 *
 * 前缀为什么必要：不同服务器的工具可能重名（`search` / `read`），而工具清单是**扁平**的
 * 一张表（本地工具 + 插件贡献 + MCP），重名会被注册表当冲突丢掉。这里统一成
 * `mcp__` 两段式，既避免冲突，又让工具卡片一眼看出「这是外部 MCP 工具」。
 * 名字里的非法字符（空格、点、中文）一律净化成 `_`：部分模型对工具名字符集敏感。
 */
export const MCP_TOOL_PREFIX = 'mcp__'

/** 服务器名 → 工具命名空间片段（净化到 [A-Za-z0-9_-]） */
export function mcpNamespace(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'server'
}

/** 组装工具全名 */
export function mcpToolName(serverNamespace: string, rawToolName: string): string {
  return `${MCP_TOOL_PREFIX}${serverNamespace}__${rawToolName}`
}

/**
 * 反解工具全名。返回 null 表示这不是一条 MCP 工具。
 *
 * 只认 `mcp__` 前缀 + 第一个 `__` 分隔：工具名本身可能含 `__`（如 `list__x`），
 * 按第一个分隔切才不会把服务器名切错。
 */
export function parseMcpToolName(
  fullName: string
): { server: string; tool: string } | null {
  if (!fullName.startsWith(MCP_TOOL_PREFIX)) return null
  const rest = fullName.slice(MCP_TOOL_PREFIX.length)
  const sep = rest.indexOf('__')
  if (sep <= 0) return null
  return { server: rest.slice(0, sep), tool: rest.slice(sep + 2) }
}

/**
 * 主智能体配置（electron-store 的 `mainAgent` 键）。
 *
 * `tools` 是**用户从工具下拉里勾的**（本地工具 + 插件工具 + MCP 工具混在一张清单里），
 * `mcpTools` 是**在 MCP 页按服务器勾的**（整台服务器的工具）。两者分开存的原因：
 * 进设置页反勾一台 MCP 服务器时，只该停用它带来的工具，不能把用户在主智能体页挑的
 * 其他工具一起抹掉——合并成一张表存就必然出这个问题（同一份数据两个入口改）。
 */
export interface MainAgentConfig {
  tools?: string[]
  skills?: string[]
  mcpTools?: string[]
}

/**
 * 一轮对话实际启用的工具名 = 主智能体勾选的工具 + MCP 页勾选的 MCP 工具（去重）。
 *
 * 单一真源：主进程组装工具集（harness-start-stream / harness-send-message）与设置页展示
 * 都走这里，避免「页面显示已启用、实际没挂上」这类漂移。
 */
export function effectiveMainAgentTools(config?: MainAgentConfig | null): string[] {
  const out: string[] = []
  const push = (names?: string[]): void => {
    for (const name of names ?? []) {
      if (typeof name === 'string' && name && !out.includes(name)) out.push(name)
    }
  }
  push(config?.tools)
  push(config?.mcpTools)
  return out
}

/**
 * 渲染层的**掩码占位**：env / headers 的值不下发到界面（凭据不出主进程），
 * 表单里显示的就是这个串；保存时把磁盘上的原值填回去（用户没动这一项）。
 */
export const SECRET_MASK = '••••••'

/** 下发配置前把凭据值掩码（只掩值，键名保留——用户需要看到自己配了哪些变量） */
export function maskServerSecrets<
  T extends { env?: Record<string, string>; headers?: Record<string, string> }
>(config: T): T {
  const mask = (map?: Record<string, string>): Record<string, string> | undefined =>
    map ? Object.fromEntries(Object.keys(map).map((k) => [k, SECRET_MASK])) : undefined
  return { ...config, env: mask(config.env), headers: mask(config.headers) }
}

/**
 * 保存时把掩码还原成磁盘上的原值。
 *
 * 规则：**值等于掩码的键**取原值，其余键用新值（新增/删除照旧生效）。这样用户不改凭据时
 * 不必重新输入 token，也不会因为「表单不回显」而把已保存的值清空。
 */
export function restoreServerSecrets(
  input: McpServerInput,
  previous?: McpServerInput
): McpServerInput {
  const restore = (
    incoming?: Record<string, string>,
    stored?: Record<string, string>
  ): Record<string, string> | undefined => {
    if (!incoming) return undefined
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(incoming)) {
      out[key] = value === SECRET_MASK && stored?.[key] !== undefined ? stored[key] : value
    }
    return out
  }
  return {
    ...input,
    env: restore(input.env, previous?.env),
    headers: restore(input.headers, previous?.headers)
  }
}
