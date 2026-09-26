/**
 * **过渡常量（P1 建、P2 加 planner、P3 加 home、P4 加 harness = 四个全到齐）**：
 * 宿主运行时接口已经补齐、可以从磁盘包加载的内置插件 id。
 *
 * 单独一个模块、零依赖，是为了让 `installer.ts` 与 `builtin.ts` 都能引用它而**不引入
 * 循环依赖**（`builtin.ts → installer.ts → scanner.ts` 那条链会在 Electron 的 app 还没
 * ready 时就拉起 fs/path/app 相关初始化）。
 *
 * 四个插件各自的外部依赖面（实测）：
 * - music：主进程 4 个 `@host/main/**`，渲染层 2 个 `@host/renderer/**` + 4 个 vendor
 * - planner：主进程 5 个，渲染层 2 个 + 5 个 vendor（含 dayjs，P2 补进桥）
 * - home：主进程 9 个，渲染层 10 个 + 7 个 vendor
 * - harness：主进程 18 个（+ `@host/shared/model-params`），渲染层 10 个 + 7 个 vendor
 *
 * **P5 删掉这个常量与两处判断**，改成「全部 bundled 插件」。在 P1~P4 期间它是必需的：
 * 只搬走一部分时，还没搬的插件既不在 `userData/plugins/`（没有产物）也不该从清单里消失，
 * 否则渲染层会把它们当「未安装」整块卸掉（菜单/路由/设置页全没）。
 */
export const PACKAGED_READY_IDS: ReadonlySet<string> = new Set([
  'music',
  'planner',
  'home',
  'harness'
])

/** 该内置插件本轮是否已可以从磁盘包加载（P5 起恒为 true） */
export function isPackageReady(id: string): boolean {
  return PACKAGED_READY_IDS.has(id)
}
