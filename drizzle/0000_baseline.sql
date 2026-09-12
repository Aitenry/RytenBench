-- RytenBench 数据库 baseline（drizzle 迁移 0000）
--
-- 内容 = 迁移到 drizzle 之前 src/main/database/sql/ 下 24 个建表文件的合并结果，按文件名顺序排列。
-- 全部为幂等 DDL（CREATE TABLE/INDEX IF NOT EXISTS、ALTER TABLE ... DROP COLUMN IF EXISTS），因此：
--   * 全新安装：本次迁移建出全部 24 张表；
--   * 已有老库：这些语句逐条 no-op，仅把 baseline 记入 drizzle.__drizzle_migrations。
-- 该文件是历史快照，**不要手工修改**；后续结构变更一律由 `pnpm drizzle-kit generate` 生成新的迁移文件。

-- 数据库迁移记录表
CREATE TABLE IF NOT EXISTS schema_migrations (
    id          SERIAL PRIMARY KEY,
    script_name TEXT      NOT NULL UNIQUE,
    executed_at TIMESTAMP DEFAULT NOW(),
    version     TEXT,
    description TEXT
);
--> statement-breakpoint
-- 图片存储表（以MD5去重）
CREATE TABLE IF NOT EXISTS images (
    id         TEXT      PRIMARY KEY,
    data       TEXT      NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
--> statement-breakpoint
-- 工作区表
CREATE TABLE IF NOT EXISTS workspace (
    id         SERIAL PRIMARY KEY,
    name       TEXT      NOT NULL,
    path       TEXT      NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
--> statement-breakpoint
-- 待办事项表（全局数据，不按工作区隔离）
CREATE TABLE IF NOT EXISTS todo_items (
    id           SERIAL PRIMARY KEY,
    title        TEXT      NOT NULL,
    description  TEXT,
    due_date     DATE,
    priority     INTEGER   DEFAULT 0,
    status       INTEGER   DEFAULT 0,
    category     TEXT,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW(),
    started_at   TIMESTAMP,
    completed_at TIMESTAMP
);
--> statement-breakpoint
-- 迁移：移除旧版的工作区隔离列（待办已改为全局数据，所有工作区共享同一份）
ALTER TABLE todo_items DROP COLUMN IF EXISTS workspace_id;
--> statement-breakpoint
-- 待办事项表索引
CREATE INDEX IF NOT EXISTS idx_todo_priority   ON todo_items (priority);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_todo_status     ON todo_items (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_todo_due_date   ON todo_items (due_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_todo_category   ON todo_items (category);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_todo_created_at ON todo_items (created_at);
--> statement-breakpoint
-- 任务依赖关系表（用于甘特图展示前后依赖）
CREATE TABLE IF NOT EXISTS task_dependencies (
    id                 SERIAL PRIMARY KEY,
    task_id            INTEGER   NOT NULL,
    depends_on_task_id INTEGER   NOT NULL,
    created_at         TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (task_id)            REFERENCES todo_items (id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_task_id) REFERENCES todo_items (id) ON DELETE CASCADE,
    UNIQUE (task_id, depends_on_task_id)
);
--> statement-breakpoint
-- 任务依赖关系表索引
CREATE INDEX IF NOT EXISTS idx_task_deps_task       ON task_dependencies (task_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on ON task_dependencies (depends_on_task_id);
--> statement-breakpoint
-- 甘特图计划任务表（支持树形层级：项目 > 阶段 > 任务）
CREATE TABLE IF NOT EXISTS planner_tasks (
    id              SERIAL PRIMARY KEY,
    parent_id       INTEGER,
    title           TEXT      NOT NULL,
    type            TEXT      NOT NULL DEFAULT 'task',
    progress        INTEGER   DEFAULT 0,
    work_hours      INTEGER   DEFAULT 0,
    priority        INTEGER   DEFAULT 0,
    start_date      TIMESTAMP,
    end_date        TIMESTAMP,
    sort_order      INTEGER   DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (parent_id) REFERENCES planner_tasks (id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_tasks_parent ON planner_tasks (parent_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_tasks_type   ON planner_tasks (type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_tasks_sort   ON planner_tasks (sort_order);
--> statement-breakpoint
-- 迁移：为已有数据库添加 priority 列
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
--> statement-breakpoint
-- 甘特图任务依赖关系表
CREATE TABLE IF NOT EXISTS planner_dependencies (
    id                 SERIAL PRIMARY KEY,
    task_id            INTEGER   NOT NULL,
    depends_on_task_id INTEGER   NOT NULL,
    created_at         TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (task_id)            REFERENCES planner_tasks (id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_task_id) REFERENCES planner_tasks (id) ON DELETE CASCADE,
    UNIQUE (task_id, depends_on_task_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_deps_task       ON planner_dependencies (task_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_planner_deps_depends_on ON planner_dependencies (depends_on_task_id);
--> statement-breakpoint
-- 知识库表（全局数据，不按工作区隔离）
CREATE TABLE IF NOT EXISTS wiki (
    id         SERIAL PRIMARY KEY,
    title      TEXT      NOT NULL,
    summary    TEXT,
    tags       TEXT,
    image_id   TEXT      REFERENCES images(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
--> statement-breakpoint
-- 迁移：移除旧版的工作区隔离列（知识库已改为全局数据，所有工作区共享同一份）
ALTER TABLE wiki DROP COLUMN IF EXISTS workspace_id;
--> statement-breakpoint
-- 知识库表索引
CREATE INDEX IF NOT EXISTS idx_wiki_title       ON wiki (title);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_wiki_created_at  ON wiki (created_at);
--> statement-breakpoint
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
--> statement-breakpoint
-- 知识库目录表索引
CREATE INDEX IF NOT EXISTS idx_wiki_directories_wiki_parent ON wiki_directories (wiki_id, parent_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_wiki_directories_sort_order  ON wiki_directories (sort_order);
--> statement-breakpoint
-- 文档表（全局数据，不按工作区隔离）
CREATE TABLE IF NOT EXISTS documents (
    id         SERIAL PRIMARY KEY,
    title      TEXT      NOT NULL,
    summary    TEXT,
    tags       TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
--> statement-breakpoint
-- 迁移：移除旧版的工作区隔离列（文档已改为全局数据，所有工作区共享同一份）
ALTER TABLE documents DROP COLUMN IF EXISTS workspace_id;
--> statement-breakpoint
-- 文档表索引
CREATE INDEX IF NOT EXISTS idx_documents_title      ON documents (title);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents (updated_at);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
-- 关联表索引
CREATE INDEX IF NOT EXISTS idx_directory_documents_dir ON directory_documents (directory_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_directory_documents_doc ON directory_documents (doc_id);
--> statement-breakpoint
-- 聊天话题表（会话级别，同一个 workspace_id 下的对话）
CREATE TABLE IF NOT EXISTS chat_topic (
    id            SERIAL PRIMARY KEY,
    workspace_id  INTEGER   NOT NULL,
    title         TEXT      NOT NULL,
    model         TEXT,
    selected_tools TEXT,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE
);
--> statement-breakpoint
-- 聊天话题表索引
CREATE INDEX IF NOT EXISTS idx_chat_topic_workspace  ON chat_topic (workspace_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_chat_topic_updated_at ON chat_topic (updated_at);
--> statement-breakpoint
-- 聊天消息表（消息级别）
CREATE TABLE IF NOT EXISTS chat_dialogue (
    id         SERIAL PRIMARY KEY,
    topic_id   INTEGER   NOT NULL,
    role       TEXT      NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT      NOT NULL,
    blocks     TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (topic_id) REFERENCES chat_topic (id) ON DELETE CASCADE
);
--> statement-breakpoint
-- 聊天消息表索引
CREATE INDEX IF NOT EXISTS idx_chat_dialogue_topic         ON chat_dialogue (topic_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_chat_dialogue_topic_created ON chat_dialogue (topic_id, created_at);
--> statement-breakpoint
-- 智能体（Agent）配置表（按工作区隔离）
CREATE TABLE IF NOT EXISTS agent_config (
    id           SERIAL PRIMARY KEY,
    workspace_id INTEGER   NOT NULL,
    name         TEXT      NOT NULL,
    rename       TEXT,
    prompt       TEXT,
    description  TEXT,
    skills       TEXT,
    model        TEXT,
    tools        TEXT,
    enable       BOOLEAN   DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE,
    UNIQUE (workspace_id, name)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_config_workspace ON agent_config (workspace_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_agent_config_enable   ON agent_config (enable);
--> statement-breakpoint
-- 画布节点位置表
CREATE TABLE IF NOT EXISTS node_positions (
    node_id    TEXT      NOT NULL PRIMARY KEY,
    x          REAL      NOT NULL DEFAULT 0,
    y          REAL      NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);
--> statement-breakpoint
-- 音乐歌单表
CREATE TABLE IF NOT EXISTS music_folders (
    id          TEXT PRIMARY KEY,
    path        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    track_count INTEGER DEFAULT 0,
    image_id    TEXT REFERENCES images(id),
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);
--> statement-breakpoint
-- 音乐曲目表
CREATE TABLE IF NOT EXISTS music_tracks (
    id             SERIAL PRIMARY KEY,
    file_path      TEXT NOT NULL,
    file_hash      TEXT NOT NULL,
    folder_id      TEXT NOT NULL,
    title          TEXT NOT NULL,
    artist         TEXT,
    album          TEXT,
    duration       REAL,
    liked          BOOLEAN   DEFAULT FALSE,
    last_played_at TIMESTAMP,
    image_id       TEXT REFERENCES images(id),
    created_at     TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (folder_id) REFERENCES music_folders(id) ON DELETE CASCADE,
    UNIQUE (folder_id, file_hash)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_music_tracks_folder ON music_tracks(folder_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_music_tracks_file_hash ON music_tracks(file_hash);
--> statement-breakpoint
-- 大模型供应商表
CREATE TABLE IF NOT EXISTS llm_providers
(
  id          SERIAL PRIMARY KEY,
  name        TEXT   NOT NULL,
  -- provider 为接口协议标识（如 openai / anthropic / zhipu），允许用户自由输入，不做白名单约束
  provider    TEXT   NOT NULL,
  base_url    TEXT,
  api_key_encrypted TEXT,
  model       TEXT   NOT NULL,
  temperature REAL             DEFAULT 0.7,
  max_tokens  INTEGER,
  extra_config TEXT,
  metadata    TEXT,
  is_default  BOOLEAN          DEFAULT FALSE,
  is_enabled  BOOLEAN          DEFAULT TRUE,
  sort_order  INTEGER          DEFAULT 0,
  created_at  TIMESTAMP        DEFAULT NOW(),
  updated_at  TIMESTAMP        DEFAULT NOW()
);
--> statement-breakpoint
-- 确保只有一个默认供应商的约束（PostgreSQL partial unique index）
CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_providers_default ON llm_providers (is_default) WHERE is_default = TRUE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_llm_providers_enabled ON llm_providers (is_enabled);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_llm_providers_sort ON llm_providers (sort_order);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_graph_entities_wiki ON graph_entities(wiki_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_graph_entities_type ON graph_entities(type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_graph_entities_name ON graph_entities(name);
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_graph_relations_wiki ON graph_relations(wiki_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_graph_relations_source ON graph_relations(source_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_graph_relations_target ON graph_relations(target_id);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_chat_goals_phase ON chat_goals (phase);
--> statement-breakpoint
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
