-- 数据库迁移记录表
CREATE TABLE IF NOT EXISTS schema_migrations (
    id          SERIAL PRIMARY KEY,
    script_name TEXT      NOT NULL UNIQUE,
    executed_at TIMESTAMP DEFAULT NOW(),
    version     TEXT,
    description TEXT
);
