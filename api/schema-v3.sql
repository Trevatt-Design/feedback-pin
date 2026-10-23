-- v3 migration: review items, decisions and events. Apply once per environment
-- after schema.sql and schema-v2.sql.
--
-- An item is one thing to act on. It links to one or more comments (duplicates
-- merge into one item) and one comment can feed several items (a comment that
-- is both a build fix and a design question splits in two).

ALTER TABLE projects ADD COLUMN approvers TEXT; -- JSON array of actor names allowed to decide

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  ref TEXT NOT NULL,              -- human key, e.g. FB-001
  round TEXT,                     -- e.g. 2026-10-23
  title TEXT NOT NULL,
  kind TEXT NOT NULL,             -- question | command
  outcome TEXT NOT NULL,          -- answered | built-right | build-fix | missing | conflict
  verdict TEXT,                   -- one-paragraph reasoning, plain text
  design TEXT,                    -- JSON: { figma_url, figma_node, notion: [{label,url,quote}], screen_key }
  proposal TEXT,                  -- JSON: { summary, figma_url, effects }
  stage TEXT NOT NULL,            -- see ITEM_STAGES in api/src/index.ts
  decision TEXT,                  -- approve | decline | discuss
  decided_by TEXT,
  decided_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS item_comments (
  item_id TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  PRIMARY KEY (item_id, comment_id)
);

CREATE TABLE IF NOT EXISTS item_events (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  actor TEXT,
  action TEXT NOT NULL,           -- created | triaged | decision | stage | note
  value TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_items_ref ON items(project_id, ref);
CREATE INDEX IF NOT EXISTS idx_items_round ON items(project_id, round, stage);
CREATE INDEX IF NOT EXISTS idx_item_comments_comment ON item_comments(comment_id);
CREATE INDEX IF NOT EXISTS idx_item_events_item ON item_events(item_id, created_at);
