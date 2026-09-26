import React from 'react'
import * as antd from 'antd'
import * as RemixIcons from '@remixicon/react'
import type { Plugin } from '@renderer/plugin-host/types'
// 已迁移的插件从自包含目录 @plugins 引入（四个内置插件都已收进 src/plugins/<id>/）
import home from '@plugins/home/renderer/plugin'
import music from '@plugins/music/renderer/plugin'
import planner from '@plugins/planner/renderer/plugin'
import harness from '@plugins/harness/renderer/plugin'

/**
 * 内置插件注册表：显式 import（不用 import.meta.glob），
 * 规避 electron-vite 6 beta 下 HMR 动态发现的不稳定。
 * 菜单顺序：home(10) → planner(20) → music(30) → harness(40)。
 */
export const builtinPlugins: Plugin[] = [home, planner, music, harness]

/**
 * **过渡常量（P1 建、P2 加 planner、P3 加 home、P4 加 harness = 四个全到齐）**：
 * 宿主 UI 桥已补齐、可以从磁盘包加载的内置插件。
 *
 * 必须与主进程的 `src/main/plugins/packaged.ts` 保持一致（两侧各一份，因为渲染层不能
 * import 主进程模块，而另建一个 shared 常量对这个短命的过渡白名单不划算）。
 * **P5 连同这段判断一起删掉**（那时四个插件都只从磁盘包装载）。
 */
const PACKAGED_READY_IDS = new Set(['music', 'planner', 'home', 'harness'])

/**
 * 过渡共存规则（P1 建、P4 补齐）：**已作为插件包安装到 `userData/plugins/<id>/` 的内置插件
 * 不再走这里**。
 *
 * 磁盘包由主进程的 `loadExternalMain` 装载、渲染模块由 `plugin://<id>/renderer.mjs`
 * 加载（同一条外部插件链路），静态这份只是「dev 还没跑打包脚本」时的回退。
 * 不排除就会同时存在两个装载来源：主进程侧通道命名空间会直接冲突，渲染层侧
 * 路由/菜单/设置页也会各注册一遍。
 *
 * 判断依据是主进程 `plugins-list`（`bundled: true` + `installed: true`），不是文件系统——
 * 渲染层沙箱里读不到 `userData/plugins`。取不到清单（异常启动路径）时保守地**不排除**
 * 任何插件：静态回退可用，总好过整个界面没有菜单。
 */
export function resolveBuiltinPlugins(
  entries: {
    id: string
    bundled?: boolean
    installed: boolean
  }[]
): Plugin[] {
  if (entries.length === 0) return builtinPlugins
  const shadowed = new Set(
    entries.filter((e) => e.bundled && e.installed && PACKAGED_READY_IDS.has(e.id)).map((e) => e.id)
  )
  if (shadowed.size === 0) return builtinPlugins
  return builtinPlugins.filter((p) => !shadowed.has(p.manifest.id))
}

/**
 * 宿主 vendored 实例：第三方插件构建时 externalize react/antd 等，
 * 运行时经 ctx.require(name) 取这里的唯一实例，杜绝双重 React / antd 上下文分裂。
 *
 * P1 起，磁盘包里的插件走的是 `@host/vendor/<spec>` 宿主 UI 桥（同一份实例，
 * 见 `./host-ui.ts`）；这里的表是 `ctx.require` 那条老路径的兜底，仍被 demo 插件使用。
 */
export const vendorModules: Record<string, unknown> = {
  react: React,
  antd,
  '@remixicon/react': RemixIcons
}
