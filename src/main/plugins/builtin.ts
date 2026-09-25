import type { MainPluginContext } from './context'
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

export const builtinMainModules: Record<string, MainPluginModule> = {
  harness: harnessMain,
  home: homeMain,
  music: musicMain,
  planner: plannerMain
}
