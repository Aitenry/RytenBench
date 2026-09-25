/**
 * 数据库 schema（drizzle ORM 单一真源）。
 *
 * 约定：
 * - 列名一律省略（`serial()` 而不是 `serial('id')`），TS 键名即数据库列名，保持 snake_case。
 *   因此**不要**给 `drizzle()` 传 `casing: 'camelCase'`，否则列名会被改写。
 * - 各领域模块之间的外键依赖靠 import 解决，注意声明顺序（被引用表必须先定义）。
 * - 改结构后执行 `pnpm drizzle-kit generate`，生成的 SQL 进 drizzle/ 目录，启动时由迁移器应用。
 * - 已迁进 `src/plugins/<id>/main/db/schema.ts` 的插件表由这里用**相对路径** re-export：
 *   drizzle-kit 不解析 tsconfig paths，只能用相对路径（`@plugins/*` 到这里会解析失败）。
 */
export * from './common'
export * from './workspace'
export * from './harness'
export * from './file-change'
export * from './agent'
// 插件表：唯一真源在 `src/plugins/<id>/main/db/schema*.ts`，这里用**相对路径** re-export
// （drizzle-kit 不解析 tsconfig paths，`@plugins/*` 到这里会解析失败）。
// music 插件表
export * from '../../../plugins/music/main/db/schema'
// planner 插件表
export * from '../../../plugins/planner/main/db/schema'
// home 插件表（document 依赖 wiki，graph 依赖 wiki，顺序与原先一致）
export * from '../../../plugins/home/main/db/schema/todo'
export * from '../../../plugins/home/main/db/schema/wiki'
export * from '../../../plugins/home/main/db/schema/document'
export * from '../../../plugins/home/main/db/schema/graph'
export * from './provider'
