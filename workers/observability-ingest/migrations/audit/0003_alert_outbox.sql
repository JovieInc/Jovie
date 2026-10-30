-- Durable alert outbox (review of #23742): alerts are written in the same D1 batch as the change they
-- report, then delivered; failed deliveries keep bounded retry state (attempts, backoff, last_error).
CREATE TABLE IF NOT EXISTS alert_outbox (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  body TEXT NOT NULL,
  refs TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  delivered_at TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS alert_outbox_due ON alert_outbox (delivered_at, next_attempt_at);
