import type { planner_dependencies, planner_tasks } from '../main/db/schema'

/**
 * planner 插件的跨进程 DTO：主进程 IPC 的入参/出参形状，渲染层只读同一份定义。
 *
 * 沿袭原 `src/renderer/src/types/planner.ts` 的做法——行类型由**表结构推导**
 * （`$inferSelect`），不手工维护第二份字段表，schema 改一处即两端口径一致。
 *
 * 注意：这里只有 `import type`，编译后不留任何运行期依赖，
 * 渲染层不会因此把 drizzle / main 目录打进产物（契约见 src/plugins/README.md）。
 */

/** 计划任务行（字段由 main/db/schema.ts 推导） */
export type PlannerTaskRow = typeof planner_tasks.$inferSelect

/** 计划任务依赖行 */
export type PlannerDependencyRow = typeof planner_dependencies.$inferSelect

/** 树节点，含子节点和依赖信息 */
export interface PlannerTreeNode extends PlannerTaskRow {
  children: PlannerTreeNode[]
  dependencies: number[]
  depth: number
}
