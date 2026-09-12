-- 待办事项表（全局数据，不按工作区隔离）
CREATE TABLE IF NOT EXISTS todo_items (
    id           SERIAL PRIMARY KEY,
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

-- 迁移：移除旧版的工作区隔离列（待办已改为全局数据，所有工作区共享同一份）
ALTER TABLE todo_items DROP COLUMN IF EXISTS workspace_id;

-- 待办事项表索引
CREATE INDEX IF NOT EXISTS idx_todo_priority   ON todo_items (priority);
CREATE INDEX IF NOT EXISTS idx_todo_status     ON todo_items (status);
CREATE INDEX IF NOT EXISTS idx_todo_due_date   ON todo_items (due_date);
CREATE INDEX IF NOT EXISTS idx_todo_category   ON todo_items (category);
CREATE INDEX IF NOT EXISTS idx_todo_created_at ON todo_items (created_at);
