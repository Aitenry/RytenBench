-- 城市表
CREATE TABLE IF NOT EXISTS urban_resource (
    city_code TEXT NOT NULL PRIMARY KEY,
    city_name TEXT,
    city_district TEXT
);

-- 每天天气表
CREATE TABLE IF NOT EXISTS daily_weather (
    id TEXT NOT NULL PRIMARY KEY,
    city_code TEXT NOT NULL,
    date DATE NOT NULL,
    morning_weather TEXT,
    evening_weather TEXT,
    high_temp INTEGER,
    low_temp INTEGER,
    temperature_range TEXT,
    morning_wind_direction TEXT,
    evening_wind_direction TEXT,
    wind_power TEXT,
    uv_index INTEGER,
    air_quality TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (city_code) REFERENCES urban_resource(city_code) ON DELETE CASCADE
);

-- 创建唯一约束的索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_city_date ON daily_weather(city_code, date);
CREATE INDEX IF NOT EXISTS idx_daily_date ON daily_weather(date);
CREATE INDEX IF NOT EXISTS idx_daily_city_date ON daily_weather(city_code, date);

-- 小时天气表
CREATE TABLE IF NOT EXISTS hourly_weather (
    id TEXT NOT NULL PRIMARY KEY,
    city_code TEXT NOT NULL,
    weather_date DATE NOT NULL,
    hour_time INTEGER NOT NULL CHECK (hour_time >= 0 AND hour_time <= 23),
    temperature REAL,
    real_feel REAL,
    probability_of_rain INTEGER CHECK (probability_of_rain >= 0 AND probability_of_rain <= 100),
    wind_power TEXT,
    humidity INTEGER CHECK (humidity >= 0 AND humidity <= 100),
    gust REAL,
    dew_point REAL,
    visibility REAL,
    cloudiness INTEGER CHECK (cloudiness >= 0 AND cloudiness <= 100),
    weather TEXT,
    weather_image TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (city_code) REFERENCES urban_resource(city_code) ON DELETE CASCADE
);

-- 创建唯一约束的索引
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_city_hour ON hourly_weather(city_code, weather_date, hour_time);
CREATE INDEX IF NOT EXISTS idx_hourly_city_date ON hourly_weather(city_code, weather_date);
CREATE INDEX IF NOT EXISTS idx_hourly_weather_date ON hourly_weather(weather_date);

-- 代办事项表
CREATE TABLE IF NOT EXISTS todo_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    due_date DATE,
    priority INTEGER DEFAULT 0,
    status INTEGER DEFAULT 0,
    category TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    started_at DATETIME,
    completed_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_todo_priority ON todo_items(priority);
CREATE INDEX IF NOT EXISTS idx_todo_status ON todo_items(status);
CREATE INDEX IF NOT EXISTS idx_todo_due_date ON todo_items(due_date);
CREATE INDEX IF NOT EXISTS idx_todo_category ON todo_items(category);
CREATE INDEX IF NOT EXISTS idx_todo_created_at ON todo_items(created_at);

-- 知识库表
CREATE TABLE IF NOT EXISTS wiki (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT,
    image TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wiki_title ON wiki(title);
CREATE INDEX IF NOT EXISTS idx_wiki_created_at ON wiki(created_at);

-- 知识库目录表 - 修正外键引用
CREATE TABLE IF NOT EXISTS wiki_directories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wiki_id INTEGER NOT NULL,
    parent_id INTEGER,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,  -- 添加层级字段用于树形结构
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (wiki_id) REFERENCES wiki(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES wiki_directories(id) ON DELETE CASCADE  -- 修正：指向自己表的id
);

-- 创建目录与笔记的关联表（多对多关系）
CREATE TABLE IF NOT EXISTS directory_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    directory_id INTEGER NOT NULL,
    note_id INTEGER NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (directory_id) REFERENCES wiki_directories(id) ON DELETE CASCADE,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
    UNIQUE(directory_id, note_id)  -- 防止重复关联
);

-- 笔记表
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT,
    tags TEXT,
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL UNIQUE,
    image TEXT,
    content TEXT,
    chunk_key TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- 修正索引名称
CREATE INDEX IF NOT EXISTS idx_wiki_directories_wiki_parent ON wiki_directories(wiki_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_wiki_directories_sort_order ON wiki_directories(sort_order);

-- 笔记表索引
CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);

-- 关联表索引
CREATE INDEX IF NOT EXISTS idx_directory_notes_dir ON directory_notes(directory_id);
CREATE INDEX IF NOT EXISTS idx_directory_notes_note ON directory_notes(note_id);

-- 数据库迁移记录表
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    script_name TEXT NOT NULL UNIQUE,
    executed_at DATETIME DEFAULT (datetime('now')),
    version TEXT,
    description TEXT
);
