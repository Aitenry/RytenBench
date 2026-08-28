-- 023_chat_goals.sql
-- 对话目标（goal）持久化：每个话题至多一个当前目标（参考 deepseek-harness dsh-goal 的单目标语义）。
-- revision 用于 CAS（乐观并发）校验：工具更新必须携带 {goal_id, revision}，过期即拒。
-- activation（armed/disarmed）为内存态，不持久化：进程重启后目标一律 disarmed，
-- 由用户在对话中要求「继续」触发 update_goal(resume) 后重新武装。

CREATE TABLE IF NOT EXISTS chat_goals (
  topic_id         INTEGER PRIMARY KEY,
  goal_id          TEXT NOT NULL,
  revision         INTEGER NOT NULL DEFAULT 1,
  objective        TEXT NOT NULL,
  phase            TEXT NOT NULL DEFAULT 'active'
                   CHECK (phase IN ('active', 'paused', 'blocked', 'complete')),
  rounds_started   INTEGER NOT NULL DEFAULT 0,
  max_goal_rounds  INTEGER NOT NULL DEFAULT 256,
  blocked_reason   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_goals_phase ON chat_goals (phase);
