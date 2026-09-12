/**
 * 数据库 schema（drizzle ORM 单一真源）。
 *
 * 约定：
 * - 列名一律省略（`serial()` 而不是 `serial('id')`），TS 键名即数据库列名，保持 snake_case。
 *   因此**不要**给 `drizzle()` 传 `casing: 'camelCase'`，否则列名会被改写。
 * - 各领域模块之间的外键依赖靠 import 解决，注意声明顺序（被引用表必须先定义）。
 * - 改结构后执行 `pnpm drizzle-kit generate`，生成的 SQL 进 drizzle/ 目录，启动时由迁移器应用。
 */
export * from './common'
export * from './workspace'
export * from './harness'
export * from './agent'
export * from './todo'
export * from './planner'
export * from './wiki'
export * from './document'
export * from './graph'
export * from './music'
export * from './provider'
