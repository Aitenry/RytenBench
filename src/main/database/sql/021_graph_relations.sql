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
