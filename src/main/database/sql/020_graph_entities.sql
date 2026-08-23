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
