-- 待办事项表
CREATE TABLE IF NOT EXISTS todo_items (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER,
    title        TEXT      NOT NULL,
    description  TEXT,
    due_date     DATE,
    priority     INTEGER   DEFAULT 0,
    status       INTEGER   DEFAULT 0,
    category     TEXT,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW(),
    started_at   TIMESTAMP,
    completed_at TIMESTAMP
);

-- 迁移：为已有数据库添加 workspace_id 列（必须先于依赖该列的 CREATE INDEX——
-- 修复：旧库升级时 CREATE TABLE 被跳过，先建索引会抛 column does not exist 并中断后续全部 SQL）
ALTER TABLE todo_items ADD COLUMN IF NOT EXISTS workspace_id INTEGER;

-- 工作区隔离索引
CREATE INDEX IF NOT EXISTS idx_todo_workspace ON todo_items (workspace_id);

-- 待办事项表索引
CREATE INDEX IF NOT EXISTS idx_todo_priority   ON todo_items (priority);
CREATE INDEX IF NOT EXISTS idx_todo_status     ON todo_items (status);
CREATE INDEX IF NOT EXISTS idx_todo_due_date   ON todo_items (due_date);
CREATE INDEX IF NOT EXISTS idx_todo_category   ON todo_items (category);
CREATE INDEX IF NOT EXISTS idx_todo_created_at ON todo_items (created_at);
