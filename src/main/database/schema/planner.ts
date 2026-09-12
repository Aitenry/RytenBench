import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  index,
  foreignKey,
  unique
} from 'drizzle-orm/pg-core'

/** 计划（甘特图）任务表：parent_id 自引用形成树 */
export const planner_tasks = pgTable(
  'planner_tasks',
  {
    id: serial().primaryKey().notNull(),
    parent_id: integer(),
    title: text().notNull(),
    type: text().default('task').notNull(),
    progress: integer().default(0),
    work_hours: integer().default(0),
    priority: integer().default(0),
    start_date: timestamp({ mode: 'string' }),
    end_date: timestamp({ mode: 'string' }),
    sort_order: integer().default(0),
    created_at: timestamp({ mode: 'string' }).defaultNow(),
    updated_at: timestamp({ mode: 'string' }).defaultNow()
  },
  (table) => [
    index('idx_planner_tasks_parent').using(
      'btree',
      table.parent_id.asc().nullsLast().op('int4_ops')
    ),
    index('idx_planner_tasks_sort').using(
      'btree',
      table.sort_order.asc().nullsLast().op('int4_ops')
    ),
    index('idx_planner_tasks_type').using('btree', table.type.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.parent_id],
      foreignColumns: [table.id],
      name: 'planner_tasks_parent_id_fkey'
    }).onDelete('cascade')
  ]
)

/** 计划任务依赖关系表 */
export const planner_dependencies = pgTable(
  'planner_dependencies',
  {
    id: serial().primaryKey().notNull(),
    task_id: integer().notNull(),
    depends_on_task_id: integer().notNull(),
    created_at: timestamp({ mode: 'string' }).defaultNow()
  },
  (table) => [
    index('idx_planner_deps_depends_on').using(
      'btree',
      table.depends_on_task_id.asc().nullsLast().op('int4_ops')
    ),
    index('idx_planner_deps_task').using('btree', table.task_id.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.task_id],
      foreignColumns: [planner_tasks.id],
      name: 'planner_dependencies_task_id_fkey'
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.depends_on_task_id],
      foreignColumns: [planner_tasks.id],
      name: 'planner_dependencies_depends_on_task_id_fkey'
    }).onDelete('cascade'),
    unique('planner_dependencies_task_id_depends_on_task_id_key').on(
      table.task_id,
      table.depends_on_task_id
    )
  ]
)
