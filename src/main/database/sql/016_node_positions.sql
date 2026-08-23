-- 画布节点位置表
CREATE TABLE IF NOT EXISTS node_positions (
    node_id    TEXT      NOT NULL PRIMARY KEY,
    x          REAL      NOT NULL DEFAULT 0,
    y          REAL      NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);
