import { createRequire } from 'module'
import { app } from 'electron'
import logger from 'electron-log'

import * as context from '../context'
import * as databaseInstance from '../database/instance'
import * as databaseOrm from '../database/orm'
import * as databaseSchema from '../database/schema'
import * as databaseSchemaCommon from '../database/schema/common'
import * as databaseWorkspaceContext from '../database/workspace-context'
import * as mapperProvider from '../database/mapper/provider'
import * as i18n from '../i18n'
import * as toolResultsAgent from '../i18n/tool-results-agent'
import * as toolResultsDocs from '../i18n/tool-results-docs'
import * as toolResultsFs from '../i18n/tool-results-fs'
import * as toolResultsPlanner from '../i18n/tool-results-planner'
import * as appEvents from '../plugins/app-events'
import * as appHooks from '../plugins/app-hooks'
import * as contributions from '../plugins/contributions'
import * as toolContract from '../plugins/tool-contract'
import * as providerCache from '../provider/cache'
import * as providerService from '../provider/service'
import * as safeSend from '../safe-send'
import * as weatherUtils from '../shared/weather-utils'
import * as sharedModelParams from '../../shared/model-params'

/**
 * 主进程**宿主运行时**（插件打包方案见 src/plugins/PACKAGING.md）。
 *
 * 背景：插件包（`userData/plugins/<id>/main.cjs`）不能各自再打一份 core —— 那会得到
 * 第二个 PGlite 连接、第二份 electron-store 实例、各不相同的 i18n 状态。因此打包时
 * 把插件源码里指向 core 的导入改写成 `@host/main/<相对路径>`，运行期在这里换成
 * **宿主自己已经加载的那一份模块实例**（单例由此保住）。
 *
 * 交接方式：`globalThis.__RB_HOST_RESOLVE__(spec)`。必须在**任何插件 main.cjs 被 require
 * 之前**挂上（`initPluginHost()` 的第一件事），否则插件包会在装载期直接拿到 undefined。
 *
 * 解析语义（优先级从高到低）：
 *  1. `node:*` 内置模块 → 直接 require；
 *  2. 命中下表（`@host/main/**`、`@host/shared/**`）→ 返回宿主自己的模块实例（单例）；
 *  3. 其它裸模块（electron / electron-log / zod/v4 / drizzle-orm/pg-core / music-metadata…）
 *     → 用**宿主自身的解析基准** require，返回宿主已加载的同一实例；
 *  4. 找不到 → 抛可读错误（含 spec 与「宿主运行时没有提供」提示）。
 *
 * 关键细节：第 3 步的解析基准必须是**应用根**而不是插件目录。插件装在
 * `userData/plugins/<id>/`，那里没有 node_modules，用插件目录做基准会解析失败；
 * 而用应用根做基准既能找到随应用分发的 node_modules，又能命中 Node 的模块缓存，
 * 于是「宿主已加载的同一实例」这条语义自动成立。
 *
 * 表是**按需补齐**的：P1 保证 music 端到端跑通，同时把 planner/home/harness 的静态依赖
 * 一次性补齐。P2（planner）用到其中 5 个 `@host/main/**` 键，P3（home）用到 9 个，其余外部
 * 依赖（`@langchain/core/**`、`drizzle-orm`、`zod/v3|v4`、`electron`、`electron-log`、
 * `jsdom`、`mammoth`、`turndown`…）走下面的裸模块解析。
 * PACKAGING.md 的契约面（主进程 20 个）已全部在表内。
 */

/** 表键 = 打包产物里的 spec（`@host/main/<相对 src/main 的路径，无扩展名>`） */
const HOST_MAIN: Record<string, unknown> = {
  '@host/main/context': context,
  '@host/main/database/instance': databaseInstance,
  '@host/main/database/orm': databaseOrm,
  '@host/main/database/schema': databaseSchema,
  '@host/main/database/schema/common': databaseSchemaCommon,
  '@host/main/database/workspace-context': databaseWorkspaceContext,
  '@host/main/database/mapper/provider': mapperProvider,
  '@host/main/i18n': i18n,
  '@host/main/i18n/tool-results-agent': toolResultsAgent,
  '@host/main/i18n/tool-results-docs': toolResultsDocs,
  '@host/main/i18n/tool-results-fs': toolResultsFs,
  '@host/main/i18n/tool-results-planner': toolResultsPlanner,
  '@host/main/plugins/app-events': appEvents,
  '@host/main/plugins/app-hooks': appHooks,
  '@host/main/plugins/contributions': contributions,
  '@host/main/plugins/tool-contract': toolContract,
  '@host/main/provider/cache': providerCache,
  '@host/main/provider/service': providerService,
  '@host/main/safe-send': safeSend,
  '@host/main/shared/weather-utils': weatherUtils
}

/** `@host/shared/**` → `src/shared/**`（三端共用的纯模块；插件直接 import @shared/*） */
const HOST_SHARED: Record<string, unknown> = {
  '@host/shared/model-params': sharedModelParams
}

/** 宿主解析基准：应用根（dev = 仓库根，打包后 = app.asar 根），再兜底进程工作目录 */
function hostRequire(): NodeRequire {
  const base = app.isReady() ? app.getAppPath() : process.cwd()
  return createRequire(base.endsWith('package.json') ? base : base + '/package.json')
}

/** 缓存的 host require（app ready 前后基准可能不同，首次调用时定下来） */
let cachedRequire: NodeRequire | null = null

function resolveBare(spec: string): unknown {
  cachedRequire ??= hostRequire()
  return cachedRequire(spec)
}

/**
 * 按 spec 取宿主模块。插件包里的 `require(...)` 会被打包器改写成对本函数的调用，
 * 因此这里**绝不返回 undefined**：拿不到就抛错，让「宿主没提供」在装载期立刻暴露，
 * 而不是变成下游某个 `Cannot read properties of undefined`。
 */
export function resolveHostModule(spec: string): unknown {
  if (typeof spec !== 'string' || spec === '') {
    throw new Error('宿主运行时解析失败：模块说明符为空')
  }
  if (spec.startsWith('node:')) return resolveBare(spec)

  if (Object.prototype.hasOwnProperty.call(HOST_MAIN, spec)) return HOST_MAIN[spec]
  if (Object.prototype.hasOwnProperty.call(HOST_SHARED, spec)) return HOST_SHARED[spec]

  try {
    return resolveBare(spec)
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    const count = Object.keys(HOST_MAIN).length + Object.keys(HOST_SHARED).length
    // 可读错误：说清是谁、为什么、下一步该往哪查（表是按需补齐的）
    throw new Error(
      `宿主运行时没有提供模块 '${spec}'：它既不在宿主运行时表（${count} 个 @host/** 契约模块）里，` +
        `也无法从应用根 '${app.isReady() ? app.getAppPath() : process.cwd()}' 解析到。` +
        `若这是插件新引入的 core 依赖，请在 src/main/plugins/runtime.ts 的表里补上；原始错误：${detail}`
    )
  }
}

/**
 * 挂上宿主运行时（幂等）。
 *
 * 必须在 `initPluginHost()` 里、**扫描/装载任何外部插件之前**调用：插件 main.cjs 一被
 * require 就会执行源码里的 `require('@host/main/...')`，那些调用最终落到这个全局函数上。
 */
export function installHostRuntime(): void {
  const target = globalThis as typeof globalThis & {
    __RB_HOST_RESOLVE__?: (spec: string) => unknown
  }
  target.__RB_HOST_RESOLVE__ = resolveHostModule
  logger.info(
    `[Plugins] 宿主运行时已挂载（@host/main ${Object.keys(HOST_MAIN).length} 个 + @host/shared ${Object.keys(HOST_SHARED).length} 个）`
  )
}

/** 运行时表里的键（诊断用：面板/工装可以核对插件包引用了哪些宿主模块） */
export function hostRuntimeKeys(): string[] {
  return [...Object.keys(HOST_MAIN), ...Object.keys(HOST_SHARED)]
}
