-- 工作区表
CREATE TABLE IF NOT EXISTS workspace (
    id         SERIAL PRIMARY KEY,
    name       TEXT      NOT NULL,
    path       TEXT      NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
