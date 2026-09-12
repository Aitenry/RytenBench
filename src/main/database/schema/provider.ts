import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  real,
  boolean,
  index,
  uniqueIndex
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

/**
 * 大模型供应商表（全局数据）。
 * provider 是接口协议标识（openai / anthropic / zhipu…），允许自由输入，不做白名单约束；
 * api_key_encrypted 存密文，明文只在主进程运行时路径解密。
 */
export const llm_providers = pgTable(
  'llm_providers',
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    provider: text().notNull(),
    base_url: text(),
    api_key_encrypted: text(),
    model: text().notNull(),
    temperature: real().default(0.7),
    max_tokens: integer(),
    extra_config: text(),
    metadata: text(),
    is_default: boolean().default(false),
    is_enabled: boolean().default(true),
    sort_order: integer().default(0),
    created_at: timestamp({ mode: 'string' }).defaultNow(),
    updated_at: timestamp({ mode: 'string' }).defaultNow()
  },
  (table) => [
    // 全局只有一个默认供应商（PostgreSQL partial unique index）
    uniqueIndex('idx_llm_providers_default')
      .using('btree', table.is_default.asc().nullsLast().op('bool_ops'))
      .where(sql`(is_default = true)`),
    index('idx_llm_providers_enabled').using(
      'btree',
      table.is_enabled.asc().nullsLast().op('bool_ops')
    ),
    index('idx_llm_providers_sort').using(
      'btree',
      table.sort_order.asc().nullsLast().op('int4_ops')
    )
  ]
)
