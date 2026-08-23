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
