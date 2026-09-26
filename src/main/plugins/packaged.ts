/**
 * **过渡常量（P1）**：宿主运行时接口已经补齐、可以从磁盘包加载的内置插件 id。
 *
 * 单独一个模块、零依赖，是为了让 `installer.ts` 与 `builtin.ts` 都能引用它而**不引入
 * 循环依赖**（`builtin.ts → installer.ts → scanner.ts` 那条链会在 Electron 的 app 还没
 * ready 时就拉起 fs/path/app 相关初始化）。
 *
 * 为什么现在是白名单而不是「全部内置插件」：`src/main/plugins/runtime.ts`（主进程宿主
 * 运行时）与 `src/renderer/src/plugin-host/host-ui.ts`（渲染层宿主 UI 表）目前只覆盖
 * music 用到的模块。另外三个插件的接口是 P2（planner）/ P3（home）/ P4（harness）才补的；
 * 现在就把它们的包装进 `userData/plugins/`，它们会在装载期找不到 `@host/main/…`
 * 而整体失败（菜单/路由/设置页全没），同时静态注册表也因为「已被包接管」而不再装载。
 *
 * 每轮往集合里加一个 id；**P5 删掉这个常量与两处判断**，改成「全部 bundled 插件」。
 */
export const PACKAGED_READY_IDS: ReadonlySet<string> = new Set(['music'])

/** 该内置插件本轮是否已可以从磁盘包加载（P5 起恒为 true） */
export function isPackageReady(id: string): boolean {
  return PACKAGED_READY_IDS.has(id)
}
