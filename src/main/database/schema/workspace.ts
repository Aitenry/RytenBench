import { pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core'

/** 工作区表：harness_topic / agent_config 通过 workspace_id 外键挂在其下并被级联删除 */
export const workspace = pgTable(
  'workspace',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    path: text().notNull(),
    created_at: timestamp({ mode: 'string' }).defaultNow(),
    updated_at: timestamp({ mode: 'string' }).defaultNow()
  },
  (table) => [unique('workspace_path_key').on(table.path)]
)
