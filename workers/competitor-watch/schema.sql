CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TEXT,
  first_seen_at TEXT NOT NULL,
  summary TEXT,
  relevance INTEGER,
  surfaces TEXT,
  kind TEXT,
  adoptable_now INTEGER,
  cost_saving INTEGER,
  why TEXT,
  triaged_at TEXT,
  route_status TEXT NOT NULL DEFAULT 'new',
  routed_to TEXT,
  routed_at TEXT,
  excerpt TEXT -- triage input only; held until triaged, then cleared
);
CREATE INDEX IF NOT EXISTS items_seen ON items (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS items_untriaged ON items (triaged_at) WHERE triaged_at IS NULL;
CREATE TABLE IF NOT EXISTS source_state (
  source TEXT PRIMARY KEY,
  etag TEXT,
  last_modified TEXT,
  content_hash TEXT,
  last_checked_at TEXT,
  last_status INTEGER,
  last_error TEXT,
  items_total INTEGER NOT NULL DEFAULT 0
);
