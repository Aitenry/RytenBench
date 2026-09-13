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
import { DEFAULT_MAX_TOOL_ROUNDS } from '../../../shared/model-params'

/**
 * 大模型供应商表（全局数据）。
 * provider 是接口协议标识（openai / anthropic / zhipu…），允许自由输入，不做白名单约束；
 * api_key_encrypted 存密文，明文只在主进程运行时路径解密。
 *
 * 模型级请求参数（采样/思考/工具轮数）逐列存储，由 ProviderService 直接消费；
 * 上下文窗口与最大输出属于「模型档案」维度，存在 metadata(JSON) 里
 * （context_window / max_output_tokens），不重复建列。
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
    temperature: real(),
    max_tokens: integer(),
    /** Top P 采样：留空(null) = 使用供应商最佳默认值 */
    top_p: real(),
    /** Top K 采样：留空(null) = 使用供应商最佳默认值 */
    top_k: integer(),
    /** 思考模式：auto 跟随模型默认配置 / on 强制开启 / off 强制关闭 */
    thinking_mode: text().default('auto'),
    /** 单次对话工具调用总次数上限（工具调用轮数） */
    max_tool_rounds: integer().default(DEFAULT_MAX_TOOL_ROUNDS),
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
