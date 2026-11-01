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

-- Alerts already sent by the scheduled budget check (one row per alert, e.g. 'budget-80-2026-11')
CREATE TABLE IF NOT EXISTS app_alerts (
  key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

-- Public artwork gallery: just the AI artwork (never wording, names or photos), one row per
-- project that shares it. Kept in step with the project on every save (see syncGallery).
CREATE TABLE IF NOT EXISTS gallery (
  id TEXT PRIMARY KEY,           -- 'g_' + project id without 'p_'
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  art_key TEXT NOT NULL,         -- R2 key of the shared artwork (in the sharer's folder)
  output TEXT NOT NULL,
  layout TEXT,
  zone TEXT,                     -- JSON of the measured lettering area
  title TEXT,                    -- library idea title, or a generic label — never user text
  idea TEXT,                     -- library idea text (only when it came from the library)
  orient TEXT NOT NULL DEFAULT 'landscape',  -- 'landscape' | 'portrait' (added 2026-11-01: ALTER TABLE gallery ADD COLUMN orient ...)
  hidden INTEGER NOT NULL DEFAULT 0,  -- hidden by the site owner
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gallery_list ON gallery(hidden, output, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_art ON gallery(art_key);

-- Password reset links (emailed via Resend). Only a hash of the token is stored; 1 hour, single use.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id, created_at);
