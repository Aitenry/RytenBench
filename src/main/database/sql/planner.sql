-- 甘特图计划任务表（支持树形层级：项目 > 阶段 > 任务）
CREATE TABLE IF NOT EXISTS planner_tasks (
    id              SERIAL PRIMARY KEY,
    workspace_id    INTEGER,
    parent_id       INTEGER,
    title           TEXT      NOT NULL,
    type            TEXT      NOT NULL DEFAULT 'task',
    progress        INTEGER   DEFAULT 0,
    work_hours      INTEGER   DEFAULT 0,
    priority        INTEGER   DEFAULT 0,
    start_date      TIMESTAMP,
    end_date        TIMESTAMP,
    sort_order      INTEGER   DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (parent_id) REFERENCES planner_tasks (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_planner_tasks_parent ON planner_tasks (parent_id);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_type   ON planner_tasks (type);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_sort   ON planner_tasks (sort_order);
CREATE INDEX IF NOT EXISTS idx_planner_tasks_workspace ON planner_tasks (workspace_id);

-- 迁移：为已有数据库添加 priority 列
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
-- 迁移：为已有数据库添加 workspace_id 列
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS workspace_id INTEGER;

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
