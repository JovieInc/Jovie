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
  // Automated notices (board fan-outs, DLQ wrappers, events/probes) expire:
  // the mailbox sweep acks them unhandled past this age so they never pile up
  // to the unacked cap. Real messages keep full retention. Override with the
  // AUTO_NOTICE_TTL_MS env var (clamped to [1 minute, 7 days]).
  autoNoticeTtlMs: 6 * 3_600_000,
  // At most one summary DLQ notice per (mailbox, fallback) per window.
  dlqCoalesceMs: 3_600_000,
  // A fallback at >= 90% of the unacked cap counts as full: never add DLQ weight.
  dlqFullFraction: 0.9,
} as const;

export const KIND = /^[a-z][a-z0-9-]{1,31}$/;
export const CORRELATION = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;
export const SHA256 = /^[a-f0-9]{64}$/;
/** Hub-internal senders; never registrable as agents. */
export const SYSTEM_KINDS = new Set(['mesh-hub', 'mesh-probe', 'board']);

/** Marker that a message (or its quoted copy) came from or is bound for the founder. */
export const TIM_RELAY = 'TIM-RELAY';

/** The board fan-out events that are pure offers: the only board notices the
 * TTL may expire. Questions, answers and results are never automated. */
export const BOARD_OFFER_EVENTS = new Set([
  'task.open',
  'task.reopened',
  'merge.open',
]);

export type EnvelopeClass = 'automated' | 'direct';

/**
 * One classifier for every mailbox decision that must treat noise differently
 * from mail (TTL expiry, dead-lettering, DLQ). Automated = board fan-out OFFER
 * notices (kind 'message' from 'board' carrying an offer event) plus every
 * event/probe/undeliverable envelope. Direct = a real peer message (registered
 * agent or the 'tim' identity), board questions/answers/results and any other
 * human-directed ask — never expired merely because the sender is the board —
 * and anything carrying the TIM-RELAY marker in body or refs, which is
 * hard-protected: normal retention and dead-letter behavior, always.
 */
export function classifyEnvelope(
  envelope: Pick<Envelope, 'kind' | 'from' | 'body' | 'refs'>
): EnvelopeClass {
  if (
    envelope.body.includes(TIM_RELAY) ||
    envelope.refs.some(ref => ref.includes(TIM_RELAY))
  )
    return 'direct';
  if (envelope.kind === 'message') {
    if (envelope.from !== 'board') return 'direct';
    // Only fan-out offers are automated; questions, answers, results and
    // anything unparseable or unknown stay direct (ambiguous = protected).
    try {
      const parsed = JSON.parse(envelope.body) as {
        schema?: string;
        event?: string;
      };
      return parsed.schema === 'jovie.board/v1' &&
        typeof parsed.event === 'string' &&
        BOARD_OFFER_EVENTS.has(parsed.event)
        ? 'automated'
        : 'direct';
    } catch {
      return 'direct';
    }
  }
  return 'automated';
}

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

/** Coalescing state for summary DLQ notices: one per (mailbox, fallback) window. */
export type DlqAccumulator = {
  windowStart: number;
  count: number;
  firstSeq: number;
  lastSeq: number;
};

/** Fold one dead message into the coalescing window; a lapsed window restarts. */
export function nextDlqAccumulator(
  acc: DlqAccumulator | null,
  seq: number,
  now: number,
  windowMs: number
): DlqAccumulator {
  if (!acc || now - acc.windowStart >= windowMs)
    return { windowStart: now, count: 1, firstSeq: seq, lastSeq: seq };
  return { ...acc, count: acc.count + 1, lastSeq: seq };
}

/** The window's summary is due once the coalesce window has fully elapsed. */
export function isDlqSummaryDue(
  acc: DlqAccumulator | null,
  now: number,
  windowMs: number
): boolean {
  return acc !== null && acc.count > 0 && now - acc.windowStart >= windowMs;
}

/** A fallback at >= dlqFullFraction of the unacked cap is treated as full. */
export function dlqFallbackFull(unacked: number | null): boolean {
  return (
    unacked !== null &&
    unacked >= Math.ceil(LIMITS.dlqFullFraction * LIMITS.unackedPerMailbox)
  );
}

/** Shared, strictly read-only selection for admin peek and bulk-ack. */
export type MailboxSelector = {
  afterSeq: number;
  limit: number;
  olderThanMs: number | null;
  newerThanMs: number | null;
  msgKinds: string[];
  from: string[];
  unackedOnly: boolean;
  excludeBodyContains: string[];
  excludeRefsContains: string[];
  excludeFrom: string[];
};

/** Excludes are case-insensitive substrings over body / refs; excludeFrom is exact. */
export function matchesExcludes(
  message: Pick<Delivered, 'body' | 'refs' | 'from'>,
  selector: Pick<
    MailboxSelector,
    'excludeBodyContains' | 'excludeRefsContains' | 'excludeFrom'
  >
): boolean {
  const body = message.body.toLowerCase();
  const refs = message.refs.join('\n').toLowerCase();
  return (
    !selector.excludeBodyContains.some(term =>
      body.includes(term.toLowerCase())
    ) &&
    !selector.excludeRefsContains.some(term =>
      refs.includes(term.toLowerCase())
    ) &&
    !selector.excludeFrom.includes(message.from)
  );
}

const PREVIEW_CHARS = 120;

/** Admin peek metadata: never the full body, never a lease claim. */
export type PeekRow = {
  seq: number;
  id: string;
  from: string;
  kind: string;
  correlationId: string;
  sentAt: string | null;
  acceptedAt: string;
  acked: boolean;
  bodyLength: number;
  preview: string;
  refs: string[];
};

export function toPeekRow(message: Delivered): PeekRow {
  return {
    seq: message.seq,
    id: message.id,
    from: message.from,
    kind: message.kind,
    correlationId: message.correlationId,
    sentAt: message.sentAt,
    acceptedAt: new Date(message.acceptedAt).toISOString(),
    acked: message.ackedAt !== null,
    bodyLength: message.body.length,
    preview: message.body.slice(0, PREVIEW_CHARS),
    refs: message.refs,
  };
}

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

  /**
   * TTL for automated notices: board fan-outs, DLQ wrappers, events and probes
   * unhandled past `ttlMs` are auto-acked with reason 'expired' and their body
   * dropped, exactly like retention. They stop counting toward the unacked cap
   * and never reach the DLQ. Direct mail (classifyEnvelope) is never touched.
   */
  sweepExpired(now: number, ttlMs: number): Delivered[] {
    const candidates = this.sql
      .exec(
        `SELECT * FROM messages WHERE acked_at IS NULL AND accepted_at <= ?
           AND (kind != 'message' OR from_kind = 'board') ORDER BY seq LIMIT 500`,
        now - ttlMs
      )
      .toArray()
      .map(toDelivered);
    const expired = candidates.filter(
      message => classifyEnvelope(message) === 'automated'
    );
    for (const message of expired) {
      this.sql.exec(
        `UPDATE messages SET acked_at = ?, ack_reason = 'expired',
           received_at = COALESCE(received_at, ?),
           first_delivered_at = COALESCE(first_delivered_at, ?),
           body = NULL, refs = '[]'
         WHERE id = ? AND acked_at IS NULL`,
        now,
        now,
        now,
        message.id
      );
    }
    return expired;
  }

  /**
   * Flags messages unhandled past `deadAfterMs` as dead, once. Dead is a flag,
   * not a deletion: the original stays deliverable. Probes, events and DLQ
   * wrappers never die (no wrapper-of-wrapper loops), and neither do automated
   * notices like board fan-outs — their TTL sweep handles them instead.
   */
  sweepDead(now: number, deadAfterMs: number): Delivered[] {
    const candidates = this.sql
      .exec(
        `SELECT * FROM messages WHERE acked_at IS NULL AND dead_at IS NULL
           AND kind = 'message' AND accepted_at <= ? ORDER BY seq LIMIT 500`,
        now - deadAfterMs
      )
      .toArray()
      .map(toDelivered);
    const dying = candidates.filter(
      message => classifyEnvelope(message) === 'direct'
    );
    for (const message of dying)
      this.sql.exec(
        'UPDATE messages SET dead_at = ? WHERE seq = ?',
        now,
        message.seq
      );
    return dying.map(message => ({ ...message, deadAt: now }));
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

  private dlqKey(target: string, fallback: string): string {
    return `dlqSum:${target}:${fallback}`;
  }

  /** Folds one dead direct message into the (mailbox, fallback) coalescing window. */
  recordDlqDead(
    target: string,
    fallback: string,
    seq: number,
    now: number,
    windowMs: number
  ): void {
    const key = this.dlqKey(target, fallback);
    const raw = this.getMeta(key);
    const acc = nextDlqAccumulator(
      raw ? (JSON.parse(raw) as DlqAccumulator) : null,
      seq,
      now,
      windowMs
    );
    this.setMeta(key, JSON.stringify(acc));
  }

  /** The window's summary once the coalesce window has elapsed; null otherwise. */
  pendingDlqSummary(
    target: string,
    fallback: string,
    now: number,
    windowMs: number
  ): DlqAccumulator | null {
    const raw = this.getMeta(this.dlqKey(target, fallback));
    if (!raw) return null;
    const acc = JSON.parse(raw) as DlqAccumulator;
    return isDlqSummaryDue(acc, now, windowMs) ? acc : null;
  }

  clearDlqSummary(target: string, fallback: string): void {
    this.setMeta(this.dlqKey(target, fallback), null);
  }

  /** Any un-flushed DLQ summary for this mailbox (keeps the sweep armed). */
  dlqPending(target: string): boolean {
    return Boolean(
      this.sql
        .exec('SELECT k FROM meta WHERE k LIKE ? LIMIT 1', `dlqSum:${target}:%`)
        .toArray().length
    );
  }

  /**
   * Strictly read-only selection shared by peek and bulk-ack: seq-windowed,
   * time-windowed, kind/from filtered, with case-insensitive excludes applied
   * after the page (excludes never touch SQL so the page size stays honest).
   */
  private selectMessages(selector: MailboxSelector, now: number): Delivered[] {
    const where: string[] = ['seq > ?'];
    const bindings: unknown[] = [selector.afterSeq];
    if (selector.olderThanMs !== null) {
      where.push('accepted_at <= ?');
      bindings.push(now - selector.olderThanMs);
    }
    if (selector.newerThanMs !== null) {
      where.push('accepted_at >= ?');
      bindings.push(now - selector.newerThanMs);
    }
    if (selector.msgKinds.length) {
      where.push(`kind IN (${selector.msgKinds.map(() => '?').join(', ')})`);
      bindings.push(...selector.msgKinds);
    }
    if (selector.from.length) {
      where.push(`from_kind IN (${selector.from.map(() => '?').join(', ')})`);
      bindings.push(...selector.from);
    }
    if (selector.unackedOnly) where.push('acked_at IS NULL');
    return this.sql
      .exec(
        `SELECT * FROM messages WHERE ${where.join(' AND ')} ORDER BY seq LIMIT ?`,
        ...bindings,
        selector.limit
      )
      .toArray()
      .map(toDelivered)
      .filter(message => matchesExcludes(message, selector));
  }

  /**
   * Admin peek: metadata for one page of messages. Never claims a lease and
   * never changes state; `nextAfter` is non-null when the page was full.
   */
  peek(
    selector: MailboxSelector,
    now: number
  ): { messages: PeekRow[]; nextAfter: number | null } {
    const limit = Math.min(Math.max(selector.limit, 1), 200);
    const rows = this.selectMessages({ ...selector, limit }, now);
    return {
      messages: rows.map(toPeekRow),
      nextAfter:
        rows.length && rows.length >= limit ? rows[rows.length - 1].seq : null,
    };
  }

  /**
   * Admin bulk-ack: exactly the unacked messages the selector matches, capped
   * at `maxIds` per call, acked with reason 'admin-bulk-ack'. Idempotent:
   * already-acked rows are never selected again, so re-runs converge.
   */
  bulkAck(
    selector: MailboxSelector,
    maxIds: number,
    now: number
  ): { manifest: PeekRow[]; matched: number; acked: number } {
    const rows = this.selectMessages(
      { ...selector, unackedOnly: true, limit: maxIds },
      now
    );
    const { acked } = this.ack(
      rows.map(message => message.id),
      now,
      'admin-bulk-ack'
    );
    return { manifest: rows.map(toPeekRow), matched: rows.length, acked };
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
