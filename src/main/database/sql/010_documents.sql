-- 文档表
CREATE TABLE IF NOT EXISTS documents (
    id         SERIAL PRIMARY KEY,
    workspace_id INTEGER,
    title      TEXT      NOT NULL,
    summary    TEXT,
    tags       TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 迁移：为已有数据库添加 workspace_id 列（必须先于依赖该列的 CREATE INDEX——修复：
-- 旧库升级时 CREATE TABLE 被跳过，先建索引会抛 column does not exist 并中断后续全部 SQL）
ALTER TABLE documents ADD COLUMN IF NOT EXISTS workspace_id INTEGER;

-- 文档表索引
CREATE INDEX IF NOT EXISTS idx_documents_title      ON documents (title);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents (updated_at);
CREATE INDEX IF NOT EXISTS idx_documents_workspace  ON documents (workspace_id);
