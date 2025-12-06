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
    name TEXT NOT NULL,
    description TEXT,
    owner_id TEXT,
    is_public BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wiki_name ON wiki(name);
CREATE INDEX IF NOT EXISTS idx_wiki_owner ON wiki(owner_id);
CREATE INDEX IF NOT EXISTS idx_wiki_is_public ON wiki(is_public);

-- 目录表
CREATE TABLE IF NOT EXISTS directories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wiki_id INTEGER NOT NULL,
    parent_id INTEGER,
    name TEXT NOT NULL,
    level INTEGER DEFAULT 0 CHECK (level >= 0 AND level <= 10),
    sort_order INTEGER DEFAULT 0,
    path TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (wiki_id) REFERENCES wiki(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES directories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_directories_wiki_parent ON directories(wiki_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_directories_wiki_level ON directories(wiki_id, level);
CREATE INDEX IF NOT EXISTS idx_directories_sort_order ON directories(sort_order);

-- 笔记表
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    directory_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    tags TEXT,
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (directory_id) REFERENCES directories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notes_directory_id ON notes(directory_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);

-- 数据库迁移记录表
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    script_name TEXT NOT NULL UNIQUE,
    executed_at DATETIME DEFAULT (datetime('now')),
    version TEXT,
    description TEXT
);
