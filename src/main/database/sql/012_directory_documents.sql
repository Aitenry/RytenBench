-- 目录与文档关联表（多对多）
CREATE TABLE IF NOT EXISTS directory_documents (
    id           SERIAL PRIMARY KEY,
    directory_id INTEGER   NOT NULL,
    doc_id       INTEGER   NOT NULL,
    sort_order   INTEGER   DEFAULT 0,
    created_at   TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (directory_id) REFERENCES wiki_directories (id) ON DELETE CASCADE,
    FOREIGN KEY (doc_id)       REFERENCES documents (id) ON DELETE CASCADE,
    UNIQUE (directory_id, doc_id)
);

-- 关联表索引
CREATE INDEX IF NOT EXISTS idx_directory_documents_dir ON directory_documents (directory_id);
CREATE INDEX IF NOT EXISTS idx_directory_documents_doc ON directory_documents (doc_id);
