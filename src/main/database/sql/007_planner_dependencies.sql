-- 甘特图任务依赖关系表
CREATE TABLE IF NOT EXISTS planner_dependencies (
    id                 SERIAL PRIMARY KEY,
    task_id            INTEGER   NOT NULL,
    depends_on_task_id INTEGER   NOT NULL,
    created_at         TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (task_id)            REFERENCES planner_tasks (id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_task_id) REFERENCES planner_tasks (id) ON DELETE CASCADE,
    UNIQUE (task_id, depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_planner_deps_task       ON planner_dependencies (task_id);
CREATE INDEX IF NOT EXISTS idx_planner_deps_depends_on ON planner_dependencies (depends_on_task_id);
