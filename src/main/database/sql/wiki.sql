-- 知识库表
CREATE TABLE IF NOT EXISTS wiki (
    id         SERIAL PRIMARY KEY,
    title      TEXT      NOT NULL,
    summary    TEXT,
    tags       TEXT,
    image_id   TEXT      REFERENCES images(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 知识库表索引
CREATE INDEX IF NOT EXISTS idx_wiki_title       ON wiki (title);
CREATE INDEX IF NOT EXISTS idx_wiki_created_at  ON wiki (created_at);

-- 知识库目录表
CREATE TABLE IF NOT EXISTS wiki_directories (
    id         SERIAL PRIMARY KEY,
    wiki_id    INTEGER   NOT NULL,
    parent_id  INTEGER,
    name       TEXT      NOT NULL,
    sort_order INTEGER   DEFAULT 0,
    level      INTEGER   DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (wiki_id)   REFERENCES wiki (id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES wiki_directories (id) ON DELETE CASCADE
);

-- 知识库目录表索引
CREATE INDEX IF NOT EXISTS idx_wiki_directories_wiki_parent ON wiki_directories (wiki_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_wiki_directories_sort_order  ON wiki_directories (sort_order);

-- 文档表
CREATE TABLE IF NOT EXISTS documents (
    id         SERIAL PRIMARY KEY,
    title      TEXT      NOT NULL,
    summary    TEXT,
    tags       TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 文档表索引
CREATE INDEX IF NOT EXISTS idx_documents_title      ON documents (title);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents (updated_at);

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
