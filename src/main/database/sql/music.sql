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
