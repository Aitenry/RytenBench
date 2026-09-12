-- 文档表（全局数据，不按工作区隔离）
CREATE TABLE IF NOT EXISTS documents (
    id         SERIAL PRIMARY KEY,
    title      TEXT      NOT NULL,
    summary    TEXT,
    tags       TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 迁移：移除旧版的工作区隔离列（文档已改为全局数据，所有工作区共享同一份）
ALTER TABLE documents DROP COLUMN IF EXISTS workspace_id;

-- 文档表索引
CREATE INDEX IF NOT EXISTS idx_documents_title      ON documents (title);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents (updated_at);
