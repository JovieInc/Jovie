/**
 * Mesh hub core: limits, envelope validation and the per-agent mailbox store.
 * Pure logic over a minimal SQL interface so it runs in a Durable Object
 * (ctx.storage.sql) and in node:test (node:sqlite) unchanged.
 * Design: gbrain projects/jovie/agent-mesh-hub-architecture-2026-10-31.
 */

export interface SqlCursor {
  toArray(): Record<string, unknown>[];
}
/** The subset of DO SqlStorage the hub uses; node:sqlite satisfies it in tests. */
export interface Sql {
  exec(query: string, ...bindings: unknown[]): SqlCursor;
}

/** One configurable block per capability (security.md: no unlimited anything). */
export const LIMITS = {
  bodyChars: 4000,
  refs: 8,
  refChars: 200,
  sendsPerSenderPerDay: 2000,
  unackedPerMailbox: 10_000,
  longPollMaxSeconds: 25,
  pageSize: 100,
  leaseMs: 60_000,
  socketsPerKind: 8,
  retentionAfterAckMs: 30 * 86_400_000,
  deadAfterActiveMs: 6 * 3_600_000,
  deadAfterDormantMs: 72 * 3_600_000,
} as const;

export const KIND = /^[a-z][a-z0-9-]{1,31}$/;
export const CORRELATION = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
export const SHA256 = /^[a-f0-9]{64}$/;
/** Hub-internal senders; never registrable as agents. */
export const SYSTEM_KINDS = new Set(['mesh-hub', 'mesh-probe']);

/** Shallow RPC-serializable record (Durable Object stub types reject deep/unknown). */
export type Detail = Record<
  string,
  string | number | boolean | null | string[]
>;

export type Envelope = {
  id: string;
  from: string;
  to: string;
  correlationId: string;
  sha256: string;
  body: string;
  refs: string[];
  inReplyTo: string | null;
  sentAt: string | null;
  acceptedAt: number;
  kind: 'message' | 'probe' | 'event' | 'undeliverable';
};

export type Delivered = Envelope & {
  seq: number;
  deliveryCount: number;
  firstDeliveredAt: number | null;
  receivedAt: number | null;
  ackedAt: number | null;
  deadAt: number | null;
};

export class HubError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;
  constructor(status: number, code: string, retryable = false) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(bytes)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export type SendInput = {
  to: string;
  correlationId: string;
  sha256: string;
  body: string;
  refs?: unknown;
  inReplyTo?: unknown;
  sentAt?: unknown;
};

/** Validates a client send. Throws HubError with a fixed code; never echoes the body. */
export async function validateSend(input: unknown): Promise<SendInput> {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new HubError(400, 'invalid_json');
  const raw = input as Record<string, unknown>;
  const allowed = new Set([
    'to',
    'correlationId',
    'sha256',
    'body',
    'refs',
    'inReplyTo',
    'sentAt',
  ]);
  if (Object.keys(raw).some(key => !allowed.has(key)))
    throw new HubError(422, 'invalid_mesh_message');
  const { to, correlationId, sha256, body } = raw;
  if (typeof to !== 'string' || !(to === 'all' || KIND.test(to)))
    throw new HubError(422, 'invalid_recipient');
  if (typeof correlationId !== 'string' || !CORRELATION.test(correlationId))
    throw new HubError(422, 'invalid_mesh_message');
  if (
    typeof body !== 'string' ||
    !body.trim() ||
    body.length > LIMITS.bodyChars
  )
    throw new HubError(422, 'body_too_large');
  if (typeof sha256 !== 'string' || !SHA256.test(sha256))
    throw new HubError(422, 'invalid_mesh_message');
  if ((await sha256Hex(body)) !== sha256)
    throw new HubError(422, 'digest_mismatch');
  const refs = raw.refs ?? [];
  if (
    !Array.isArray(refs) ||
    refs.length > LIMITS.refs ||
    refs.some(ref => typeof ref !== 'string' || ref.length > LIMITS.refChars)
  )
    throw new HubError(422, 'invalid_mesh_message');
  const inReplyTo = raw.inReplyTo ?? null;
  if (
    inReplyTo !== null &&
    (typeof inReplyTo !== 'string' || inReplyTo.length > 200)
  )
    throw new HubError(422, 'invalid_mesh_message');
  const sentAt = raw.sentAt ?? null;
  if (sentAt !== null && (typeof sentAt !== 'string' || sentAt.length > 40))
    throw new HubError(422, 'invalid_mesh_message');
  return {
    to,
    correlationId,
    sha256,
    body,
    refs: refs as string[],
    inReplyTo,
    sentAt,
  };
}

type Row = Record<string, unknown>;

const SCHEMA = [
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

function toDelivered(row: Row): Delivered {
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

export type EnqueueResult =
  | { ok: true; seq: number; replay: boolean }
  | { ok: false; status: number; code: string; retryable: boolean };

/**
 * One agent's durable mailbox. Two delivery stages:
 *  - received: a relay or webhook durably took the bytes (delivery latency);
 *  - handled (acked_at): the agent itself acted and acked (DLQ and SLOs key here).
 * `seq` is a total order per mailbox and never repeats (AUTOINCREMENT). There is
 * no client cursor, so an unhandled low seq can never be skipped. Acked rows lose
 * their body after retention but keep id + digest forever, so a late retry
 * replays instead of duplicating.
 */
export class MailboxStore {
  private readonly sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
    for (const statement of SCHEMA) sql.exec(statement);
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
  ack(ids: readonly string[], now: number): { acked: number } {
    let acked = 0;
    for (const id of ids) {
      const row = this.sql
        .exec(
          `UPDATE messages SET acked_at = ?, received_at = COALESCE(received_at, ?),
             first_delivered_at = COALESCE(first_delivered_at, ?)
           WHERE id = ? AND acked_at IS NULL RETURNING seq`,
          now,
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

  /**
   * Flags messages unhandled past `deadAfterMs` as dead, once. Dead is a flag,
   * not a deletion: the original stays deliverable. Probes, events and DLQ
   * wrappers never die (no wrapper-of-wrapper loops).
   */
  sweepDead(now: number, deadAfterMs: number): Delivered[] {
    return this.sql
      .exec(
        `UPDATE messages SET dead_at = ? WHERE acked_at IS NULL AND dead_at IS NULL
           AND kind = 'message' AND accepted_at <= ? RETURNING *`,
        now,
        now - deadAfterMs
      )
      .toArray()
      .map(toDelivered);
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

export function percentile(
  values: readonly number[],
  p: number
): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index] ?? null;
}

/** Wire projection: quoted data, never instructions. */
export function project(message: Delivered) {
  return {
    id: message.id,
    seq: message.seq,
    from: message.from,
    to: message.to,
    correlationId: message.correlationId,
    sha256: message.sha256,
    body: message.body,
    refs: message.refs,
    inReplyTo: message.inReplyTo,
    sentAt: message.sentAt,
    acceptedAt: new Date(message.acceptedAt).toISOString(),
    kind: message.kind,
    deliveryCount: message.deliveryCount,
    received: message.receivedAt !== null,
    handled: message.ackedAt !== null,
    dead: message.deadAt !== null,
    dataNotInstructions: true as const,
  };
}
