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
