-- 知识库表
CREATE TABLE IF NOT EXISTS wiki (
    id         SERIAL PRIMARY KEY,
    workspace_id INTEGER,
    title      TEXT      NOT NULL,
    summary    TEXT,
    tags       TEXT,
    image_id   TEXT      REFERENCES images(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 迁移：为已有数据库添加 workspace_id 列（必须先于依赖该列的 CREATE INDEX——修复：
-- 旧库升级时 CREATE TABLE 被跳过，先建索引会抛 column does not exist 并中断后续全部 SQL）
ALTER TABLE wiki ADD COLUMN IF NOT EXISTS workspace_id INTEGER;

-- 知识库表索引
CREATE INDEX IF NOT EXISTS idx_wiki_title       ON wiki (title);
CREATE INDEX IF NOT EXISTS idx_wiki_created_at  ON wiki (created_at);
CREATE INDEX IF NOT EXISTS idx_wiki_workspace   ON wiki (workspace_id);
