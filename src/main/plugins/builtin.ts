import type { MainPluginContext } from './context'

/**
 * 内置插件的主进程模块注册表。
 *
 * 目标形态（方案 A）：每个插件自包含在 `src/plugins/<id>/`：
 *
 *   src/plugins/<id>/manifest.ts          三端共用的清单（id/name/version/description/…）
 *   src/plugins/<id>/main/index.ts        主进程入口：export install(ctx: MainPluginContext)
 *   src/plugins/<id>/main/ipc.ts          该插件的 IPC 通道（注册进 ctx.registerIpc）
 *   src/plugins/<id>/main/db/{schema,mapper}.ts  该插件的表与查询
 *   src/plugins/<id>/main/services/**.ts  该插件的业务服务
 *   src/plugins/<id>/renderer/**.tsx      该插件的界面（plugin.tsx / api.ts / components/…）
 *   src/plugins/<id>/shared/**.ts         主/渲染共用的类型
 *   src/plugins/<id>/locales/index.ts     该插件的词条（renderer install 时经 ctx.use('i18n') 注册）
 *
 * 迁移是逐个插件进行的：已迁移的登记在这里（走新的 install(ctx) 契约），
 * 未迁移的仍留在 `src/main/ipc/index.ts` 的 builtinIpcGroups 里（旧路径，逐步删除）。
 */
export interface MainPluginModule {
  install(ctx: MainPluginContext): void | (() => void)
}

export const builtinMainModules: Record<string, MainPluginModule> = {}
