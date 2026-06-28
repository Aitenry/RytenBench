-- 知识图谱实体表
CREATE TABLE IF NOT EXISTS graph_entities (
  id              SERIAL PRIMARY KEY,
  wiki_id         INTEGER NOT NULL REFERENCES wiki(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  description     TEXT,
  aliases         TEXT,
  properties      TEXT,
  confidence      REAL DEFAULT 1.0,
  source_note_ids TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_entities_wiki ON graph_entities(wiki_id);
CREATE INDEX IF NOT EXISTS idx_graph_entities_type ON graph_entities(type);
CREATE INDEX IF NOT EXISTS idx_graph_entities_name ON graph_entities(name);

-- 知识图谱关系表
CREATE TABLE IF NOT EXISTS graph_relations (
  id              SERIAL PRIMARY KEY,
  wiki_id         INTEGER NOT NULL REFERENCES wiki(id) ON DELETE CASCADE,
  source_id       INTEGER NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
  target_id       INTEGER NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
  relation_type   TEXT NOT NULL,
  description     TEXT,
  properties      TEXT,
  confidence      REAL DEFAULT 1.0,
  source_note_ids TEXT,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_relations_wiki ON graph_relations(wiki_id);
CREATE INDEX IF NOT EXISTS idx_graph_relations_source ON graph_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_graph_relations_target ON graph_relations(target_id);

-- 图谱构建任务表（每个知识库仅一条记录，通过 wiki_id 唯一约束保证）
CREATE TABLE IF NOT EXISTS graph_build_jobs (
  id                SERIAL PRIMARY KEY,
  wiki_id           INTEGER NOT NULL REFERENCES wiki(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'pending',
  total_notes       INTEGER DEFAULT 0,
  processed_notes   INTEGER DEFAULT 0,
  entity_count      INTEGER DEFAULT 0,
  relation_count    INTEGER DEFAULT 0,
  error_message     TEXT,
  config            TEXT,
  processed_note_ids TEXT,
  started_at        TIMESTAMP,
  completed_at      TIMESTAMP,
  created_at        TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_graph_build_jobs_wiki UNIQUE (wiki_id)
);
