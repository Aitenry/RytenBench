-- 城市表
CREATE TABLE IF NOT EXISTS urban_resource (
    city_code     TEXT NOT NULL PRIMARY KEY,
    city_name     TEXT,
    city_district TEXT
);

-- 每天天气表
CREATE TABLE IF NOT EXISTS daily_weather (
    id                    TEXT      NOT NULL PRIMARY KEY,
    city_code             TEXT      NOT NULL,
    date                  DATE      NOT NULL,
    morning_weather       TEXT,
    evening_weather       TEXT,
    high_temp             INTEGER,
    low_temp              INTEGER,
    temperature_range     TEXT,
    morning_wind_direction TEXT,
    evening_wind_direction TEXT,
    wind_power            TEXT,
    uv_index              INTEGER,
    air_quality           TEXT,
    created_at            TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (city_code) REFERENCES urban_resource (city_code) ON DELETE CASCADE
);

-- 每天天气表索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_city_date ON daily_weather (city_code, date);
CREATE INDEX        IF NOT EXISTS idx_daily_date        ON daily_weather (date);
CREATE INDEX        IF NOT EXISTS idx_daily_city_date   ON daily_weather (city_code, date);

-- 小时天气表
CREATE TABLE IF NOT EXISTS hourly_weather (
    id                 TEXT      NOT NULL PRIMARY KEY,
    city_code          TEXT      NOT NULL,
    weather_date       DATE      NOT NULL,
    hour_time          INTEGER   NOT NULL CHECK (hour_time >= 0 AND hour_time <= 23),
    temperature        REAL,
    real_feel          REAL,
    probability_of_rain INTEGER   CHECK (probability_of_rain >= 0 AND probability_of_rain <= 100),
    wind_power         TEXT,
    humidity           INTEGER   CHECK (humidity >= 0 AND humidity <= 100),
    gust               REAL,
    dew_point          REAL,
    visibility         REAL,
    cloudiness         INTEGER   CHECK (cloudiness >= 0 AND cloudiness <= 100),
    weather            TEXT,
    weather_image      TEXT,
    created_at         TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (city_code) REFERENCES urban_resource (city_code) ON DELETE CASCADE
);

-- 小时天气表索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_city_hour ON hourly_weather (city_code, weather_date, hour_time);
CREATE INDEX        IF NOT EXISTS idx_hourly_city_date  ON hourly_weather (city_code, weather_date);
CREATE INDEX        IF NOT EXISTS idx_hourly_weather_date ON hourly_weather (weather_date);

-- 代办事项表
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

-- 代办事项表索引
CREATE INDEX IF NOT EXISTS idx_todo_priority   ON todo_items (priority);
CREATE INDEX IF NOT EXISTS idx_todo_status     ON todo_items (status);
CREATE INDEX IF NOT EXISTS idx_todo_due_date   ON todo_items (due_date);
CREATE INDEX IF NOT EXISTS idx_todo_category   ON todo_items (category);
CREATE INDEX IF NOT EXISTS idx_todo_created_at ON todo_items (created_at);

-- 图片存储表（以MD5去重）
CREATE TABLE IF NOT EXISTS images (
    id         TEXT      PRIMARY KEY,
    data       TEXT      NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 知识库表
CREATE TABLE IF NOT EXISTS wiki (
    id         SERIAL PRIMARY KEY,
    title      TEXT      NOT NULL,
    summary    TEXT,
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

-- 笔记表
CREATE TABLE IF NOT EXISTS notes (
    id         SERIAL PRIMARY KEY,
    title      TEXT      NOT NULL,
    summary    TEXT,
    tags       TEXT,
    version    INTEGER   DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 笔记表索引
CREATE INDEX IF NOT EXISTS idx_notes_title      ON notes (title);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes (created_at);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes (updated_at);

-- 笔记内容表
CREATE TABLE IF NOT EXISTS notes_content (
    id         SERIAL PRIMARY KEY,
    note_id    INTEGER   NOT NULL UNIQUE,
    image_id   TEXT      REFERENCES images(id),
    content    TEXT,
    chunk_key  TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE
);

-- 目录与笔记关联表（多对多）
CREATE TABLE IF NOT EXISTS directory_notes (
    id           SERIAL PRIMARY KEY,
    directory_id INTEGER   NOT NULL,
    note_id      INTEGER   NOT NULL,
    sort_order   INTEGER   DEFAULT 0,
    created_at   TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (directory_id) REFERENCES wiki_directories (id) ON DELETE CASCADE,
    FOREIGN KEY (note_id)      REFERENCES notes (id) ON DELETE CASCADE,
    UNIQUE (directory_id, note_id)
);

-- 关联表索引
CREATE INDEX IF NOT EXISTS idx_directory_notes_dir  ON directory_notes (directory_id);
CREATE INDEX IF NOT EXISTS idx_directory_notes_note ON directory_notes (note_id);

-- 聊天话题表（会话级别）
CREATE TABLE IF NOT EXISTS chat_topic (
    id            SERIAL PRIMARY KEY,
    title         TEXT      NOT NULL,
    model         TEXT,
    selected_tools TEXT,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

-- 聊天话题表索引
CREATE INDEX IF NOT EXISTS idx_chat_topic_updated_at ON chat_topic (updated_at);

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

-- 聊天消息表索引
CREATE INDEX IF NOT EXISTS idx_chat_dialogue_topic         ON chat_dialogue (topic_id);
CREATE INDEX IF NOT EXISTS idx_chat_dialogue_topic_created ON chat_dialogue (topic_id, created_at);

-- 数据库迁移记录表
CREATE TABLE IF NOT EXISTS schema_migrations (
    id          SERIAL PRIMARY KEY,
    script_name TEXT      NOT NULL UNIQUE,
    executed_at TIMESTAMP DEFAULT NOW(),
    version     TEXT,
    description TEXT
);

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

CREATE INDEX IF NOT EXISTS idx_music_tracks_folder ON music_tracks(folder_id);
CREATE INDEX IF NOT EXISTS idx_music_tracks_file_hash ON music_tracks(file_hash);
