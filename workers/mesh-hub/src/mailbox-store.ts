/**
 * One agent's durable mailbox. Two delivery stages:
 *  - received: a relay or webhook durably took the bytes (delivery latency);
 *  - handled (acked_at): the agent itself acted and acked (DLQ and SLOs key here).
 * `seq` is a total order per mailbox and never repeats (AUTOINCREMENT). There is
 * no client cursor, so an unhandled low seq can never be skipped. Acked rows lose
 * their body after retention but keep id + digest forever, so a late retry
 * replays instead of duplicating.
 */
import { type Delivered, type Envelope, LIMITS, type Sql } from './core.ts';
import type {
  DlqAccumulator,
  MailboxSelector,
  PeekRow,
} from './envelope-policy.ts';
import {
  bulkAck as bulkAckMessages,
  clearDlqSummary as clearStoredDlqSummary,
  peek as peekMessages,
  recordDlqDead as recordStoredDlqDead,
  dlqPending as storedDlqPending,
  pendingDlqSummary as storedDlqSummary,
  sweepDead as sweepDeadMessages,
  sweepExpired as sweepExpiredMessages,
} from './mailbox-admin.ts';
import { SCHEMA, toDelivered } from './mailbox-row.ts';

export type EnqueueResult =
  | { ok: true; seq: number; replay: boolean }
  | { ok: false; status: number; code: string; retryable: boolean };

export class MailboxStore {
  private readonly sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
    for (const statement of SCHEMA) sql.exec(statement);
    // Migration for mailboxes created before ack reasons existed: CREATE TABLE
    // IF NOT EXISTS cannot add a column to an existing store. The ALTER throws
    // "duplicate column" on stores that already have it; both cases are fine.
    try {
      sql.exec('ALTER TABLE messages ADD COLUMN ack_reason TEXT');
    } catch {
      // column already exists
    }
  }

  getMeta(key: string): string | null {
    const rows = this.sql.exec('SELECT v FROM meta WHERE k = ?', key).toArray();
    const value = rows[0]?.v;
    return value === undefined || value === null ? null : String(value);
  }

  setMeta(key: string, value: string | null): void {
    if (value === null) {
      this.sql.exec('DELETE FROM meta WHERE k = ?', key);
      return;
    }
    this.sql.exec(
      'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
      key,
      value
    );
  }

  unackedCount(): number {
    return Number(
      this.sql
        .exec(
          "SELECT count(*) AS n FROM messages WHERE acked_at IS NULL AND kind != 'probe'"
        )
        .toArray()[0]?.n ?? 0
    );
  }

  enqueue(envelope: Envelope): EnqueueResult {
    const existing = this.sql
      .exec('SELECT seq, sha256 FROM messages WHERE id = ?', envelope.id)
      .toArray()[0];
    if (existing) {
      if (existing.sha256 !== envelope.sha256)
        return {
          ok: false,
          status: 409,
          code: 'correlation_conflict',
          retryable: false,
        };
      return { ok: true, seq: Number(existing.seq), replay: true };
    }
    if (envelope.kind === 'probe') {
      // Probes are ephemeral: a new one supersedes any older unacked probe so a
      // long-offline relay never accumulates them.
      this.sql.exec(
        "UPDATE messages SET acked_at = ?, body = NULL WHERE kind = 'probe' AND acked_at IS NULL",
        envelope.acceptedAt
      );
    } else if (
      this.unackedCount() >=
      // Control-plane events and DLQ wrappers get headroom above the message
      // quota, so a full mailbox can still report that it is full.
      (envelope.kind === 'message'
        ? LIMITS.unackedPerMailbox
        : LIMITS.unackedPerMailbox * 2)
    ) {
      return { ok: false, status: 507, code: 'mailbox_full', retryable: true };
    }
    const row = this.sql
      .exec(
        `INSERT INTO messages (id, from_kind, to_kind, correlation_id, sha256, body, refs, in_reply_to, sent_at, kind, accepted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING seq`,
        envelope.id,
        envelope.from,
        envelope.to,
        envelope.correlationId,
        envelope.sha256,
        envelope.body,
        JSON.stringify(envelope.refs),
        envelope.inReplyTo,
        envelope.sentAt,
        envelope.kind,
        envelope.acceptedAt
      )
      .toArray()[0];
    return { ok: true, seq: Number(row?.seq), replay: false };
  }

  /**
   * Agent read: unhandled messages (no probes) in seq order, leased for
   * LIMITS.leaseMs so two sessions of one kind do not both take the same
   * message (claim/lease). An expired lease makes it visible again.
   */
  claim(now: number, limit: number = LIMITS.pageSize): Delivered[] {
    const rows = this.sql
      .exec(
        `SELECT * FROM messages WHERE acked_at IS NULL AND kind != 'probe' AND lease_until <= ?
         ORDER BY seq LIMIT ?`,
        now,
        Math.min(limit, LIMITS.pageSize)
      )
      .toArray();
    for (const row of rows)
      this.sql.exec(
        `UPDATE messages SET delivery_count = delivery_count + 1,
           first_delivered_at = COALESCE(first_delivered_at, ?), lease_until = ? WHERE seq = ?`,
        now,
        now + LIMITS.leaseMs,
        Number(row.seq)
      );
    return rows.map(row =>
      toDelivered({
        ...row,
        delivery_count: Number(row.delivery_count) + 1,
        first_delivered_at: row.first_delivered_at ?? now,
      })
    );
  }

  /**
   * Hub executor: unhandled peer messages older than `graceMs` whose lease has
   * lapsed, leased for `leaseMs` so two alarms never run one task twice.
   */
  claimForExecutor(
    now: number,
    graceMs: number,
    leaseMs: number,
    limit: number
  ): Delivered[] {
    const rows = this.sql
      .exec(
        `SELECT * FROM messages WHERE acked_at IS NULL AND kind = 'message' AND body IS NOT NULL
           AND accepted_at <= ? AND lease_until <= ? ORDER BY seq LIMIT ?`,
        now - graceMs,
        now,
        limit
      )
      .toArray();
    for (const row of rows)
      this.sql.exec(
        'UPDATE messages SET lease_until = ? WHERE seq = ?',
        now + leaseMs,
        Number(row.seq)
      );
    return rows.map(row => toDelivered(row));
  }

  /** Relay stream: everything not yet received (probes included), in seq order. */
  unreceived(now: number, limit: number = LIMITS.pageSize): Delivered[] {
    const rows = this.sql
      .exec(
        `SELECT * FROM messages WHERE received_at IS NULL AND acked_at IS NULL
         ORDER BY seq LIMIT ?`,
        Math.min(limit, LIMITS.pageSize)
      )
      .toArray();
    for (const row of rows)
      this.sql.exec(
        `UPDATE messages SET delivery_count = delivery_count + 1,
           first_delivered_at = COALESCE(first_delivered_at, ?) WHERE seq = ?`,
        now,
        Number(row.seq)
      );
    return rows.map(toDelivered);
  }

  /** Stage 1: a relay/webhook durably received these. Probes are done here. */
  receipt(
    ids: readonly string[],
    now: number
  ): { received: number; probes: Delivered[] } {
    let received = 0;
    const probes: Delivered[] = [];
    for (const id of ids) {
      const row = this.sql
        .exec(
          `UPDATE messages SET received_at = ?, first_delivered_at = COALESCE(first_delivered_at, ?),
             acked_at = CASE WHEN kind = 'probe' THEN ? ELSE acked_at END
           WHERE id = ? AND received_at IS NULL RETURNING *`,
          now,
          now,
          now,
          id
        )
        .toArray()[0];
      if (!row) continue;
      received++;
      const message = toDelivered(row);
      if (message.kind === 'probe') probes.push(message);
    }
    return { received, probes };
  }

  /** Stage 2: the agent handled these. Idempotent; unknown or acked ids are no-ops. */
  ack(
    ids: readonly string[],
    now: number,
    reason: string | null = null
  ): { acked: number } {
    let acked = 0;
    for (const id of ids) {
      const row = this.sql
        .exec(
          `UPDATE messages SET acked_at = ?, ack_reason = COALESCE(?, ack_reason),
             received_at = COALESCE(received_at, ?),
             first_delivered_at = COALESCE(first_delivered_at, ?)
           WHERE id = ? AND acked_at IS NULL RETURNING seq`,
          now,
          reason,
          now,
          now,
          id
        )
        .toArray()[0];
      if (row) acked++;
    }
    return { acked };
  }

  /**
   * History for `mesh read --all`: every non-probe message accepted since
   * `since`. A full page means there may be more: pass the last `seq` back as
   * `afterSeq` to continue instead of silently truncating at the page size.
   */
  history(
    since: number,
    limit: number = LIMITS.pageSize,
    afterSeq = 0
  ): Delivered[] {
    return this.sql
      .exec(
        `SELECT * FROM messages WHERE accepted_at >= ? AND seq > ? AND body IS NOT NULL AND kind != 'probe'
         ORDER BY seq LIMIT ?`,
        since,
        afterSeq,
        Math.min(limit, LIMITS.pageSize)
      )
      .toArray()
      .map(toDelivered);
  }

  /** Un-flags a message whose dead-letter notification failed, so the next sweep retries it. */
  clearDead(seq: number): void {
    this.sql.exec('UPDATE messages SET dead_at = NULL WHERE seq = ?', seq);
  }

  sweepExpired(now: number, ttlMs: number): Delivered[] {
    return sweepExpiredMessages(this.sql, now, ttlMs);
  }

  sweepDead(now: number, deadAfterMs: number): Delivered[] {
    return sweepDeadMessages(this.sql, now, deadAfterMs);
  }

  recordDlqDead(
    target: string,
    fallback: string,
    seq: number,
    now: number,
    windowMs: number
  ): void {
    recordStoredDlqDead(this, target, fallback, seq, now, windowMs);
  }

  pendingDlqSummary(
    target: string,
    fallback: string,
    now: number,
    windowMs: number
  ): DlqAccumulator | null {
    return storedDlqSummary(this, target, fallback, now, windowMs);
  }

  clearDlqSummary(target: string, fallback: string): void {
    clearStoredDlqSummary(this, target, fallback);
  }

  dlqPending(target: string): boolean {
    return storedDlqPending(this.sql, target);
  }

  peek(
    selector: MailboxSelector,
    now: number
  ): { messages: PeekRow[]; nextAfter: number | null } {
    return peekMessages(this.sql, selector, now);
  }

  bulkAck(
    selector: MailboxSelector,
    maxIds: number,
    now: number
  ): { manifest: PeekRow[]; matched: number; acked: number } {
    return bulkAckMessages(
      this.sql,
      (ids, at, reason) => this.ack(ids, at, reason),
      selector,
      maxIds,
      now
    );
  }
  /** Drops bodies of acked messages past retention; keeps id + digest for replay. */
  purge(now: number): number {
    return this.sql
      .exec(
        `UPDATE messages SET body = NULL, refs = '[]' WHERE acked_at IS NOT NULL
           AND body IS NOT NULL AND acked_at <= ? RETURNING seq`,
        now - LIMITS.retentionAfterAckMs
      )
      .toArray().length;
  }

  /** Oldest unhandled peer message (not events/wrappers: alarms must not alarm on themselves). */
  oldestUnackedMessage(): Delivered | null {
    const row = this.sql
      .exec(
        "SELECT * FROM messages WHERE acked_at IS NULL AND kind = 'message' ORDER BY seq LIMIT 1"
      )
      .toArray()[0];
    return row ? toDelivered(row) : null;
  }

  oldestUnacked(): Delivered | null {
    const row = this.sql
      .exec(
        "SELECT * FROM messages WHERE acked_at IS NULL AND kind != 'probe' ORDER BY seq LIMIT 1"
      )
      .toArray()[0];
    return row ? toDelivered(row) : null;
  }

  lastProbe(): { acceptedAt: number; receivedAt: number | null } | null {
    const row = this.sql
      .exec(
        "SELECT accepted_at, received_at FROM messages WHERE kind = 'probe' ORDER BY seq DESC LIMIT 1"
      )
      .toArray()[0];
    if (!row) return null;
    return {
      acceptedAt: Number(row.accepted_at),
      receivedAt: row.received_at === null ? null : Number(row.received_at),
    };
  }

  /** Latency samples (ms) for non-probe messages accepted since `since`. */
  latencies(since: number): {
    toReceived: number[];
    toHandled: number[];
    dead: number;
    unhandled: number;
    accepted: number;
  } {
    const rows = this.sql
      .exec(
        `SELECT accepted_at, received_at, acked_at, dead_at FROM messages
          WHERE accepted_at >= ? AND kind = 'message'`,
        since
      )
      .toArray();
    const toReceived: number[] = [];
    const toHandled: number[] = [];
    let dead = 0;
    let unhandled = 0;
    for (const row of rows) {
      const accepted = Number(row.accepted_at);
      if (row.received_at !== null)
        toReceived.push(Number(row.received_at) - accepted);
      if (row.acked_at !== null)
        toHandled.push(Number(row.acked_at) - accepted);
      else unhandled++;
      if (row.dead_at !== null) dead++;
    }
    return { toReceived, toHandled, dead, unhandled, accepted: rows.length };
  }
}
