/**
 * Mailbox SQLite schema and the row mapping shared by the store and the
 * admin selectors.
 */
import type { Delivered, Envelope } from './core.ts';

type Row = Record<string, unknown>;

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS messages (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    from_kind TEXT NOT NULL,
    to_kind TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    body TEXT,
    refs TEXT NOT NULL DEFAULT '[]',
    in_reply_to TEXT,
    sent_at TEXT,
    kind TEXT NOT NULL DEFAULT 'message',
    accepted_at INTEGER NOT NULL,
    first_delivered_at INTEGER,
    received_at INTEGER,
    lease_until INTEGER NOT NULL DEFAULT 0,
    delivery_count INTEGER NOT NULL DEFAULT 0,
    acked_at INTEGER,
    dead_at INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS messages_unacked ON messages (acked_at, seq)',
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
];

export function toDelivered(row: Row): Delivered {
  return {
    seq: Number(row.seq),
    id: String(row.id),
    from: String(row.from_kind),
    to: String(row.to_kind),
    correlationId: String(row.correlation_id),
    sha256: String(row.sha256),
    body: row.body === null ? '' : String(row.body),
    refs: JSON.parse(String(row.refs)) as string[],
    inReplyTo: row.in_reply_to === null ? null : String(row.in_reply_to),
    sentAt: row.sent_at === null ? null : String(row.sent_at),
    kind: String(row.kind) as Envelope['kind'],
    acceptedAt: Number(row.accepted_at),
    deliveryCount: Number(row.delivery_count),
    firstDeliveredAt:
      row.first_delivered_at === null ? null : Number(row.first_delivered_at),
    receivedAt: row.received_at === null ? null : Number(row.received_at),
    ackedAt: row.acked_at === null ? null : Number(row.acked_at),
    deadAt: row.dead_at === null ? null : Number(row.dead_at),
  };
}
