-- 大模型供应商表
CREATE TABLE IF NOT EXISTS llm_providers
(
  id          SERIAL PRIMARY KEY,
  name        TEXT   NOT NULL,
  provider    TEXT   NOT NULL CHECK (provider IN (
    'openai', 'deepseek', 'ollama', 'openrouter', 'mistral', 'xai',
    'anthropic', 'google-genai', 'google-vertexai', 'aws-bedrock',
    'cloudflare', 'custom'
  )),
  base_url    TEXT,
  api_key_encrypted TEXT,
  model       TEXT   NOT NULL,
  temperature REAL             DEFAULT 0.7,
  max_tokens  INTEGER,
  extra_config TEXT,
  tags        TEXT,
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

-- 迁移：为已有表添加 tags 列
ALTER TABLE llm_providers ADD COLUMN IF NOT EXISTS tags TEXT;
