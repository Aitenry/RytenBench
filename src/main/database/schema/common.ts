import { pgTable, serial, text, timestamp, real, unique } from 'drizzle-orm/pg-core'

/**
 * 图片表：主键为 md5(dataUrl)，data 存完整 data URL。
 * documents_content / wiki / music_folders / music_tracks 通过 image_id 外键引用。
 */
export const images = pgTable('images', {
  id: text().primaryKey().notNull(),
  data: text().notNull(),
  created_at: timestamp({ mode: 'string' }).defaultNow()
})

/** 画布节点坐标表（全局，按 node_id 记录 x/y） */
export const node_positions = pgTable('node_positions', {
  node_id: text().primaryKey().notNull(),
  x: real().default(0).notNull(),
  y: real().default(0).notNull(),
  updated_at: timestamp({ mode: 'string' }).defaultNow()
})

/**
 * 早期手写迁移记录表（由 001_schema_migrations.sql 建立）。
 * 当前代码从未读写它，保留仅为兼容老库、避免 baseline 迁移删表。
 */
export const schema_migrations = pgTable(
  'schema_migrations',
  {
    id: serial().primaryKey().notNull(),
    script_name: text().notNull(),
    executed_at: timestamp({ mode: 'string' }).defaultNow(),
    version: text(),
    description: text()
  },
  (table) => [unique('schema_migrations_script_name_key').on(table.script_name)]
)
