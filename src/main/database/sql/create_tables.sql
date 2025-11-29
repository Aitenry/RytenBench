CREATE TABLE IF NOT EXISTS urban_resource (
    city_code   VARCHAR(45) NOT NULL PRIMARY KEY,
    city_name VARCHAR(45),
    city_district VARCHAR(45) NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_weather (
    id                 VARCHAR(45) NOT NULL PRIMARY KEY,
    date               VARCHAR(45) NOT NULL,
    morning            VARCHAR(45) NOT NULL,
    evening            VARCHAR(45) NOT NULL,
    temperature        VARCHAR(45) NOT NULL,
    morning_wind_direction   VARCHAR(45) NOT NULL,
    evening_wind_direction   VARCHAR(45) NOT NULL,
    wind_power         VARCHAR(45) NOT NULL
);

CREATE TABLE IF NOT EXISTS hourly_weather (
    id                    VARCHAR(45) NOT NULL PRIMARY KEY,
    hour_time             VARCHAR(45) NOT NULL,
    temperature           VARCHAR(45) NOT NULL,
    real_feel             VARCHAR(45) NOT NULL,
    probability_of_rain   VARCHAR(45) NOT NULL,
    wind_power            VARCHAR(45) NOT NULL,
    humidity              VARCHAR(45) NOT NULL,
    gust                  VARCHAR(45) NOT NULL,
    dew_point             VARCHAR(45) NOT NULL,
    visibility            VARCHAR(45) NOT NULL,
    cloudiness            VARCHAR(45) NOT NULL,
    weather               VARCHAR(45) NOT NULL,
    weather_image         VARCHAR(45)
);

CREATE TABLE IF NOT EXISTS todo_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE,
    priority TINYINT DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE
);

-- 添加一个表来记录已执行的脚本
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    script_name TEXT NOT NULL UNIQUE,
    executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
