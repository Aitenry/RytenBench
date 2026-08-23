-- 文档内容表
CREATE TABLE IF NOT EXISTS documents_content (
    id         SERIAL PRIMARY KEY,
    doc_id     INTEGER   NOT NULL UNIQUE,
    image_id   TEXT      REFERENCES images(id),
    content    TEXT,
    chunk_key  TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (doc_id) REFERENCES documents (id) ON DELETE CASCADE
);
