-- Crafted In Honor D1 schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  output TEXT NOT NULL,          -- 'certificate' | 'pyrography'
  data TEXT NOT NULL,            -- full project JSON (wording, lettering, plan, art refs)
  art_key TEXT,                  -- current artwork object in R2 (for thumbnails)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at DESC);

-- One row per paid AI call, used for per-user daily limits and the monthly budget guard
CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,            -- 'plan' | 'art'
  model TEXT,
  status TEXT NOT NULL,          -- 'ok' | 'error' | 'pending'
  est_cost REAL NOT NULL DEFAULT 0,
  detail TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gen_user_time ON generations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gen_time ON generations(created_at);

-- Shared examples every signed-in user sees under My projects → Examples.
-- A snapshot of a project's JSON; its images stay where they are in R2 and are listed in
-- example_assets so any signed-in user may view them. Opening an example copies it (and its
-- images) into the user's own account.
CREATE TABLE IF NOT EXISTS examples (
  id TEXT PRIMARY KEY,           -- 'ex_…'
  title TEXT NOT NULL,
  output TEXT NOT NULL,
  data TEXT NOT NULL,
  source_project TEXT,           -- the owner's project it was made from
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS example_assets (
  key TEXT NOT NULL,             -- R2 key (art/… or photo/…) readable by any signed-in user
  example_id TEXT NOT NULL,
  PRIMARY KEY (key, example_id)
);
CREATE INDEX IF NOT EXISTS idx_example_assets_ex ON example_assets(example_id);
