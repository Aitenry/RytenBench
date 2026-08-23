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
