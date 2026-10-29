-- Token broker authorization (review of #23742): a server-side grant per broker client, and a
-- nonce ledger so a signed request cannot be replayed. Keys live in the BROKER_CLIENT_KEYS Worker
-- secret, never here. Grants are written by an operator (wrangler d1 execute), never by the API.
CREATE TABLE IF NOT EXISTS broker_grants (
  client_id TEXT PRIMARY KEY,
  agent_class TEXT NOT NULL,
  repos TEXT NOT NULL,
  scopes TEXT NOT NULL CHECK (scopes NOT LIKE '%watch%' AND scopes NOT LIKE '%admin%'),
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS broker_nonces (
  client_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (client_id, nonce)
);
CREATE INDEX IF NOT EXISTS broker_nonces_seen ON broker_nonces (seen_at);
