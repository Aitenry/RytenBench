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
CREATE INDEX IF NOT EXISTS idx_chat_topic_workspace  ON chat_topic (workspace_id);
CREATE INDEX IF NOT EXISTS idx_chat_topic_updated_at ON chat_topic (updated_at);
