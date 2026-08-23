-- 大模型供应商表
CREATE TABLE IF NOT EXISTS llm_providers
(
  id          SERIAL PRIMARY KEY,
  name        TEXT   NOT NULL,
  -- provider 为接口协议标识（如 openai / anthropic / zhipu），允许用户自由输入，不做白名单约束
  provider    TEXT   NOT NULL,
  base_url    TEXT,
  api_key_encrypted TEXT,
  model       TEXT   NOT NULL,
  temperature REAL             DEFAULT 0.7,
  max_tokens  INTEGER,
  extra_config TEXT,
  metadata    TEXT,
  is_default  BOOLEAN          DEFAULT FALSE,
  is_enabled  BOOLEAN          DEFAULT TRUE,
  sort_order  INTEGER          DEFAULT 0,
  created_at  TIMESTAMP        DEFAULT NOW(),
  updated_at  TIMESTAMP        DEFAULT NOW()
);

-- 确保只有一个默认供应商的约束（PostgreSQL partial unique index）
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_providers_default ON llm_providers (is_default) WHERE is_default = TRUE;

CREATE INDEX IF NOT EXISTS idx_llm_providers_enabled ON llm_providers (is_enabled);
CREATE INDEX IF NOT EXISTS idx_llm_providers_sort ON llm_providers (sort_order);

-- 迁移：字段由 tags 改为 metadata
-- tags 列已废弃（能力信息由 models-profile.json 元数据取代）
ALTER TABLE llm_providers DROP COLUMN IF EXISTS tags;
-- 为已有表添加 metadata 列（JSON 文本，模型档案元数据）
ALTER TABLE llm_providers ADD COLUMN IF NOT EXISTS metadata TEXT;

-- 迁移：移除 provider 白名单 CHECK 约束（允许用户自由输入接口协议；老库约束名由 PG 自动生成为 llm_providers_provider_check）
ALTER TABLE llm_providers DROP CONSTRAINT IF EXISTS llm_providers_provider_check;
