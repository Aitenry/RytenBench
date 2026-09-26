/**
 * 插件系统的跨进程共享类型（main / preload / renderer 三端共用）。
 *
 * 设计参照 Cordis 的「组件即插件」模型：
 * - inject  = 依赖声明（coeffect）：插件通过上下文键声明它需要哪些宿主能力；
 * - provide = 供给声明（provision）：插件通过上下文键声明它能提供什么；
 * - install(ctx) => dispose 是可逆效果：注册的逆操作进入回滚栈，卸载时逆序执行。
 *
 * 注意：本文件不得引入 electron / node / react 依赖，两侧构建都要能直接打包。
 */

/** 插件清单（plugin.json / 内置插件 manifest） */
export interface PluginManifest {
  /** 稳定唯一标识。内置：'home'|'harness'|'planner'|'music'；外部：'plugin.<author>.<name>' */
  id: string
  /** 展示名 */
  name: string
  /** semver 版本 */
  version: string
  description?: string
  /** 内置插件用 remixicon 名；外部插件用 plugin://<id>/icon.svg 或 data: URI */
  icon?: string
  /** 是否为随应用打包的内置插件 */
  builtin: boolean
  /** 外部插件入口；内置插件省略（走 builtin 注册表显式 import）。外部门槛校验仍强制存在 */
  entry?: {
    /** 外部插件渲染层入口（ESM），内置插件省略（走 builtin 注册表显式 import） */
    renderer?: string
    /** 外部插件主进程入口（CJS/ESM），内置插件省略（走 builtinMainRegistry） */
    main?: string
  }
  /** 依赖声明：install 中可访问的上下文键。未声明而访问 → UNDECLARED_ACCESS */
  inject?: string[]
  /** 供给声明：install 中 ctx.set 产出的键。用于依赖图与卸载顺序（withdrawal） */
  provide?: string[]
  /** 路由元数据 */
  routes?: { path: string; skeleton?: string }[]
  /** 侧栏菜单元数据（缺省则不出现菜单项） */
  menu?: { key: string; labelKey: string; icon: string; order?: number }
  /** 能力声明白名单（本版做声明 + 主进程通道校验，强制执行为后续增强） */
  permissions?: string[]
}

/** 插件运行时状态（三端统一的描述符） */
export interface PluginDescriptor {
  manifest: PluginManifest
  source: 'builtin' | 'external'
  /** 外部插件目录绝对路径 */
  dir?: string
  /** 合并持久化覆写后的最终启用态 */
  enabled: boolean
  state: PluginState
  error?: string
}

/** 渲染层 fiber 生命周期状态（论文 Figure 2 的简化两态 + 失败恢复） */
export type PluginState = 'inactive' | 'reloading' | 'active' | 'unloading' | 'error'

/** 插件管理员/渲染层看到的最小清单数据（主进程加工后广播） */
export interface PluginListEntry {
  id: string
  name: string
  version: string
  description?: string
  icon?: string
  builtin: boolean
  /**
   * 是否**随应用分发**（可从应用包随时重装）。
   *
   * 与 `builtin` 的区别：`builtin` 是「展示用的来源标签」，`bundled` 是「应用包里有没有
   * 这个插件的包」这一事实。P1 之后内置插件也会被卸载掉目录，那时它仍然 `bundled: true`
   * 但 `installed: false`，面板据此给出「安装」按钮。
   */
  bundled?: boolean
  /** userData/plugins/<id>/ 里当前是否有这个插件（false = 只存在于应用包里） */
  installed: boolean
  enabled: boolean
  state: PluginState
  error?: string
  /** 插件入口（渲染层 loader 与主进程装载依据） */
  entry?: { renderer?: string; main?: string }
  /**
   * 路由元数据（与 `PluginManifest.routes` 同形，直接来自清单）。
   *
   * 用途是**首帧声明式预注册**：磁盘包插件的渲染模块要 fetch + import 之后才 install，
   * 首帧侧栏/路由表会是空的（菜单「晚几百毫秒才弹出来」）。渲染层拿这份元数据在
   * 宿主构造期同步登记一遍，插件模块加载完成后由它自己的真实注册覆盖（见
   * `renderer/src/plugin-host/host.ts` 的 `declare()`）。
   */
  routes?: { path: string; skeleton?: string }[]
  /** 侧栏菜单元数据（同上；`icon` 是 remixicon 名字符串，声明项按名字解析成节点） */
  menu?: { key: string; labelKey: string; icon: string; order?: number }
}

/** 校验 manifest 最小字段是否齐全（非法插件静默跳过/拒绝安装） */
export function isValidManifest(m: unknown): m is PluginManifest {
  if (typeof m !== 'object' || m === null) return false
  const o = m as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    o.id.length > 0 &&
    /^[A-Za-z][A-Za-z0-9._-]*$/.test(o.id) &&
    typeof o.name === 'string' &&
    typeof o.version === 'string' &&
    typeof o.entry === 'object' &&
    o.entry !== null
  )
}
