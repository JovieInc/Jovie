/**
 * TTL expiry, dead-letter flags, coalesced DLQ windows, and the read-only
 * peek / bulk-ack selection. MailboxStore keeps the public methods.
 */
import { type Delivered, type Sql, toDelivered } from './core.ts';
import {
  classifyEnvelope,
  type DlqAccumulator,
  isDlqSummaryDue,
  type MailboxSelector,
  matchesExcludes,
  nextDlqAccumulator,
  type PeekRow,
  toPeekRow,
} from './envelope-policy.ts';

type DlqMeta = {
  getMeta(key: string): string | null;
  setMeta(key: string, value: string | null): void;
};

/**
 * TTL for automated notices: board fan-outs, DLQ wrappers, events and probes
 * unhandled past `ttlMs` are auto-acked with reason 'expired' and their body
 * dropped, exactly like retention. They stop counting toward the unacked cap
 * and never reach the DLQ. Direct mail (classifyEnvelope) is never touched.
 */
export function sweepExpired(
  sql: Sql,
  now: number,
  ttlMs: number
): Delivered[] {
  const candidates = sql
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
    sql.exec(
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
export function sweepDead(
  sql: Sql,
  now: number,
  deadAfterMs: number
): Delivered[] {
  const candidates = sql
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
    sql.exec('UPDATE messages SET dead_at = ? WHERE seq = ?', now, message.seq);
  return dying.map(message => ({ ...message, deadAt: now }));
}

function dlqKey(target: string, fallback: string): string {
  return `dlqSum:${target}:${fallback}`;
}

/** Folds one dead direct message into the (mailbox, fallback) coalescing window. */
export function recordDlqDead(
  meta: DlqMeta,
  target: string,
  fallback: string,
  seq: number,
  now: number,
  windowMs: number
): void {
  const key = dlqKey(target, fallback);
  const raw = meta.getMeta(key);
  const acc = nextDlqAccumulator(
    raw ? (JSON.parse(raw) as DlqAccumulator) : null,
    seq,
    now,
    windowMs
  );
  meta.setMeta(key, JSON.stringify(acc));
}

/** The window's summary once the coalesce window has elapsed; null otherwise. */
export function pendingDlqSummary(
  meta: DlqMeta,
  target: string,
  fallback: string,
  now: number,
  windowMs: number
): DlqAccumulator | null {
  const raw = meta.getMeta(dlqKey(target, fallback));
  if (!raw) return null;
  const acc = JSON.parse(raw) as DlqAccumulator;
  return isDlqSummaryDue(acc, now, windowMs) ? acc : null;
}

export function clearDlqSummary(
  meta: DlqMeta,
  target: string,
  fallback: string
): void {
  meta.setMeta(dlqKey(target, fallback), null);
}

/** Any un-flushed DLQ summary for this mailbox (keeps the sweep armed). */
export function dlqPending(sql: Sql, target: string): boolean {
  return Boolean(
    sql
      .exec('SELECT k FROM meta WHERE k LIKE ? LIMIT 1', `dlqSum:${target}:%`)
      .toArray().length
  );
}

/**
 * Strictly read-only selection shared by peek and bulk-ack: seq-windowed,
 * time-windowed, kind/from filtered, with case-insensitive excludes applied
 * after the page (excludes never touch SQL so the page size stays honest).
 */
function selectMessages(
  sql: Sql,
  selector: MailboxSelector,
  now: number
): Delivered[] {
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
  return sql
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
export function peek(
  sql: Sql,
  selector: MailboxSelector,
  now: number
): { messages: PeekRow[]; nextAfter: number | null } {
  const limit = Math.min(Math.max(selector.limit, 1), 200);
  const rows = selectMessages(sql, { ...selector, limit }, now);
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
export function bulkAck(
  sql: Sql,
  ack: (
    ids: readonly string[],
    now: number,
    reason: string | null
  ) => { acked: number },
  selector: MailboxSelector,
  maxIds: number,
  now: number
): { manifest: PeekRow[]; matched: number; acked: number } {
  const rows = selectMessages(
    sql,
    { ...selector, unackedOnly: true, limit: maxIds },
    now
  );
  const { acked } = ack(
    rows.map(message => message.id),
    now,
    'admin-bulk-ack'
  );
  return { manifest: rows.map(toPeekRow), matched: rows.length, acked };
}
