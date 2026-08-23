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
