-- 代办事项表
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

-- 代办事项表索引
CREATE INDEX IF NOT EXISTS idx_todo_priority   ON todo_items (priority);
CREATE INDEX IF NOT EXISTS idx_todo_status     ON todo_items (status);
CREATE INDEX IF NOT EXISTS idx_todo_due_date   ON todo_items (due_date);
CREATE INDEX IF NOT EXISTS idx_todo_category   ON todo_items (category);
CREATE INDEX IF NOT EXISTS idx_todo_created_at ON todo_items (created_at);

-- 任务依赖关系表（用于甘特图展示前后依赖）
CREATE TABLE IF NOT EXISTS task_dependencies (
    id                 SERIAL PRIMARY KEY,
    task_id            INTEGER   NOT NULL,
    depends_on_task_id INTEGER   NOT NULL,
    created_at         TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (task_id)            REFERENCES todo_items (id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_task_id) REFERENCES todo_items (id) ON DELETE CASCADE,
    UNIQUE (task_id, depends_on_task_id)
);

-- 任务依赖关系表索引
CREATE INDEX IF NOT EXISTS idx_task_deps_task       ON task_dependencies (task_id);
CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on ON task_dependencies (depends_on_task_id);
