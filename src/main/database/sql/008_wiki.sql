-- 知识库表（全局数据，不按工作区隔离）
CREATE TABLE IF NOT EXISTS wiki (
    id         SERIAL PRIMARY KEY,
    title      TEXT      NOT NULL,
    summary    TEXT,
    tags       TEXT,
    image_id   TEXT      REFERENCES images(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 迁移：移除旧版的工作区隔离列（知识库已改为全局数据，所有工作区共享同一份）
ALTER TABLE wiki DROP COLUMN IF EXISTS workspace_id;

-- 知识库表索引
CREATE INDEX IF NOT EXISTS idx_wiki_title       ON wiki (title);
CREATE INDEX IF NOT EXISTS idx_wiki_created_at  ON wiki (created_at);
