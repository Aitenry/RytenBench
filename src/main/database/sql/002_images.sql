-- 图片存储表（以MD5去重）
CREATE TABLE IF NOT EXISTS images (
    id         TEXT      PRIMARY KEY,
    data       TEXT      NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
