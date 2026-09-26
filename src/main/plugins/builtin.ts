import type { MainPluginContext } from './context'
import { isPackageReady } from './packaged'
import { isPluginInstalled } from './scanner'
import { getUninstalledBuiltins } from './store'
import * as harnessMain from '../../plugins/harness/main'
import * as homeMain from '../../plugins/home/main'
import * as musicMain from '../../plugins/music/main'
import * as plannerMain from '../../plugins/planner/main'

/**
 * 内置插件的主进程模块注册表。
 *
 * 目录形态（四个插件都已按此自包含）：
 *
 *   src/plugins/<id>/manifest.ts          三端共用的清单（id/name/version/description/…）
 *   src/plugins/<id>/main/index.ts        主进程入口：export install(ctx: MainPluginContext)
 *   src/plugins/<id>/main/ipc/**          该插件的 IPC 通道（注册进 ctx.registerIpc）
 *   src/plugins/<id>/main/db/{schema,mapper}.ts  该插件的表与查询
 *   src/plugins/<id>/main/services/**.ts  该插件的业务服务
 *   src/plugins/<id>/renderer/**.tsx      该插件的界面（plugin.tsx / api.ts / components/…）
 *   src/plugins/<id>/shared/**.ts         主/渲染共用的类型
 *   src/plugins/<id>/locales/index.ts     该插件的词条（renderer install 时经 ctx.use('i18n') 注册）
 *
 * 四个内置插件都已自包含在 `src/plugins/<id>/`（迁移完成，见 src/plugins/README.md），
 * 这里的登记与卸载全由 `host.ts` 按启用态驱动；core 侧的旧 IPC 分组机制
 * （`ipc/index.ts` 的 builtinIpcGroups + `ipc-capture.ts`）已删除。
 *
 * 这里用静态 import 而不是 `await import(...)`：主进程产物是 CJS（package.json 无
 * `"type": "module"`），顶层 await 会让构建失败；内置模块本就在同一份产物里，
 * 静态引入不损失什么。
 */
export interface MainPluginModule {
  install(ctx: MainPluginContext): void | (() => void)
}

/** 静态登记表（id → 同产物里的主模块） */
const staticModules: Record<string, MainPluginModule> = {
  harness: harnessMain,
  home: homeMain,
  music: musicMain,
  planner: plannerMain
}

/**
 * 过渡共存规则（P1 建、P2 加 planner）：**已作为插件包安装到 `userData/plugins/<id>/` 的内置插件
 * 不再从这里装载**——它由 `scanner` + `loadExternalMain` 按磁盘包接管，静态那份只是「dev 还没跑
 * 打包脚本」时的回退。
 *
 * 只对 `PACKAGED_READY_IDS` 里的 id（P1 = music、P2 = planner）生效：home/harness 的宿主运行时
 * 接口是 P3/P4 才补的，现在就跳过静态注册会让它们既没有磁盘包来源、又没有静态来源，
 * 直接从界面上消失。
 *
 * 「用户主动卸载过」也要按同样的口径**遮住**静态回退（2026-09-26 工装实测）：
 * 卸载后重启时插件并不在 `userData/plugins/`，静态回退于是把它**半个**装回来——主进程通道
 * 全在（music 的 plugin: 通道照常应答），界面上却按未安装处理，随后从面板「安装」会在
 * `loadExternalMain` 里撞上 Electron 的「Attempted to register a second handler」，重装直接
 * 失败。物理卸载的语义是「没装就是没有」，静态回退只该服务「应用包里还没有这个包」
 * （dev 没跑打包脚本）的情况。此时 `registerPluginIpc` 拿不到模块，只记一条「无内置主模块」
 * 的告警——那是预期行为。
 *
 * 为什么必须跳过：不跳就会有两个装载来源，`MainPluginContextImpl` 的通道命名空间
 * 占用表会直接抛「通道命名空间 'plugin:music:' 已被插件 'music' 占用」。
 */
function isShadowedByPackage(id: string): boolean {
  if (!isPackageReady(id)) return false
  return isPluginInstalled(id) || getUninstalledBuiltins().includes(id)
}

/**
 * 实际参与装载的内置插件（键 = id）。
 *
 * 用 getter 逐个求值：`initPluginHost()` 遍历它装载、`listEntries()` 读它的键，
 * 两处都拿到「排除已被磁盘包接管」之后的同一份集合。
 */
export const builtinMainModules: Record<string, MainPluginModule> = new Proxy(staticModules, {
  ownKeys: (target) => Reflect.ownKeys(target).filter((k) => !isShadowedByPackage(String(k))),
  getOwnPropertyDescriptor: (target, key) => {
    if (isShadowedByPackage(String(key))) return undefined
    return Reflect.getOwnPropertyDescriptor(target, key)
  },
  get: (target, key, receiver) => {
    if (typeof key === 'string' && isShadowedByPackage(key)) return undefined
    return Reflect.get(target, key, receiver)
  },
  has: (target, key) => !isShadowedByPackage(String(key)) && Reflect.has(target, key)
})

/** 静态登记的全部内置插件 id（诊断/工装核对静态回退面用；不判断是否被包接管） */
export function staticBuiltinPluginIds(): string[] {
  return Object.keys(staticModules)
}
