-- v2 migration. Idempotent: each ALTER guarded so re-running is safe-ish on D1.
-- D1 supports ADD COLUMN; if a column already exists the statement will error,
-- so apply this once per environment.

ALTER TABLE comments ADD COLUMN anon_id TEXT;
ALTER TABLE comments ADD COLUMN site_wide INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN metadata TEXT;
ALTER TABLE comments ADD COLUMN updated_at INTEGER;

ALTER TABLE replies ADD COLUMN anon_id TEXT;

ALTER TABLE projects ADD COLUMN share_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_share ON projects(share_token);
CREATE INDEX IF NOT EXISTS idx_comments_anon ON comments(anon_id);
