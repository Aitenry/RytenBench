-- 024_topic_compactions.sql
-- 话题级上下文压缩 checkpoint（持久化）：
-- 每个话题至多一行，落库 LLM 摘要结果。首次压缩后后续轮次直接复用，
-- 仅当压缩边界推进（新增早期对话进入压缩段，即上下文又超预算）时才增量合并并更新。

CREATE TABLE IF NOT EXISTS topic_compactions (
  topic_id    INTEGER PRIMARY KEY,
  -- 已摘要段最末对话记录 id（压缩边界：后续只有 id 大于它的对话进入压缩段时才需要增量合并）
  boundary_id INTEGER NOT NULL,
  -- checkpoint 摘要（LLM 输出，原样落地）
  summary     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
