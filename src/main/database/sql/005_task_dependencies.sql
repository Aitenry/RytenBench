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
