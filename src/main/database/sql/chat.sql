-- 工作区表
CREATE TABLE IF NOT EXISTS workspace (
    id         SERIAL PRIMARY KEY,
    name       TEXT      NOT NULL,
    path       TEXT      NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 聊天话题表（会话级别，同一个 workspace_id 下的对话）
CREATE TABLE IF NOT EXISTS chat_topic (
    id            SERIAL PRIMARY KEY,
    workspace_id  INTEGER   NOT NULL,
    title         TEXT      NOT NULL,
    model         TEXT,
    selected_tools TEXT,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE
);

-- 聊天话题表索引
CREATE INDEX IF NOT EXISTS idx_chat_topic_workspace    ON chat_topic (workspace_id);
CREATE INDEX IF NOT EXISTS idx_chat_topic_updated_at   ON chat_topic (updated_at);

-- 聊天消息表（消息级别）
CREATE TABLE IF NOT EXISTS chat_dialogue (
    id         SERIAL PRIMARY KEY,
    topic_id   INTEGER   NOT NULL,
    role       TEXT      NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT      NOT NULL,
    blocks     TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (topic_id) REFERENCES chat_topic (id) ON DELETE CASCADE
);

-- 聊天消息表索引
CREATE INDEX IF NOT EXISTS idx_chat_dialogue_topic         ON chat_dialogue (topic_id);
CREATE INDEX IF NOT EXISTS idx_chat_dialogue_topic_created ON chat_dialogue (topic_id, created_at);

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
