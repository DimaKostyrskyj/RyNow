CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(24) NOT NULL,
  username_normalized VARCHAR(24) NOT NULL UNIQUE,
  email VARCHAR(254) NOT NULL,
  email_normalized VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT,
  discord_id VARCHAR(32) UNIQUE,
  discord_username VARCHAR(100),
  discord_avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_discord_id_index
ON users(discord_id);
