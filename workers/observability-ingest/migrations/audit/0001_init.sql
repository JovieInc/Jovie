-- Fleet audit trail (scripts/fleet-audit, src/audit). Append-only by contract: the Worker only
-- INSERTs events; the daily retention pass archives rows older than 90 days to R2 and deletes them.
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  actor_agent TEXT,
  session_id TEXT,
  host TEXT,
  repo TEXT,
  target TEXT,
  action TEXT NOT NULL,
  danger INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  issue TEXT,
  outcome TEXT,
  before TEXT,
  after TEXT,
  source TEXT,
  bytes INTEGER NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
CREATE INDEX IF NOT EXISTS events_target ON events (target);
CREATE INDEX IF NOT EXISTS events_danger_ts ON events (danger, ts);

-- Last observed GitHub state per object (workflow state, ruleset updated_at), for diffing.
CREATE TABLE IF NOT EXISTS snapshots (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  observed_at TEXT NOT NULL
);

-- Each observed GitHub-side change, mapped to the shim event that explains it (or not).
CREATE TABLE IF NOT EXISTS correlations (
  id TEXT PRIMARY KEY,
  observed_at TEXT NOT NULL,
  changed_at TEXT,
  repo TEXT,
  target TEXT,
  change TEXT NOT NULL,
  github_actor TEXT,
  matched_event_id TEXT,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS correlations_observed ON correlations (observed_at);

-- Monthly byte budget accounting (100 MB/month target, alarm at 80%).
CREATE TABLE IF NOT EXISTS usage (
  month TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL,
  events INTEGER NOT NULL,
  alarmed INTEGER NOT NULL DEFAULT 0
);
