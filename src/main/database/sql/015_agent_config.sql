-- 智能体（Agent）配置表（按工作区隔离）
CREATE TABLE IF NOT EXISTS agent_config (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER   NOT NULL,
    name         TEXT      NOT NULL,
    rename       TEXT,
    prompt       TEXT,
    description  TEXT,
    skills       TEXT,
    model        TEXT,
    tools        TEXT,
    enable       BOOLEAN   DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE,
    UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_agent_config_workspace ON agent_config (workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_config_enable   ON agent_config (enable);
