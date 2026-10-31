/**
 * Sender-side send intent and the single-alarm scheduler.
 *
 * A send is committed once, in the sender's own Mailbox DO, as
 * (id = from:correlationId) -> {digest, resolved recipients}. The client gets
 * 202 after that one commit; the fan-out is then driven to completion by the
 * DO alarm, so correctness never depends on the client retrying. The recipient
 * set is resolved once at commit, never recomputed on retry.
 */
import { type Envelope, LIMITS, type Sql } from './core.ts';

export type RecipientStatus = {
  to: string;
  state: 'pending' | 'stored' | 'replay' | 'conflict' | 'full';
  seq?: number;
  attempts: number;
};

export type Intent = {
  id: string;
  sha256: string;
  envelope: Envelope;
  recipients: RecipientStatus[];
  createdAt: number;
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL,
    envelope TEXT NOT NULL,
    recipients TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    done_at INTEGER
  )`,
  'CREATE INDEX IF NOT EXISTS outbox_open ON outbox (done_at, created_at)',
  'CREATE TABLE IF NOT EXISTS schedule (task TEXT PRIMARY KEY, due INTEGER NOT NULL)',
];

/** Full-jitter-free deterministic backoff for alarm-driven retries (ms). */
export const RETRY_BACKOFF_MS = [
  2_000, 10_000, 30_000, 120_000, 600_000,
] as const;
export const backoffFor = (attempts: number) =>
  RETRY_BACKOFF_MS[Math.min(attempts, RETRY_BACKOFF_MS.length - 1)] as number;

type Row = Record<string, unknown>;

function toIntent(row: Row): Intent {
  return {
    id: String(row.id),
    sha256: String(row.sha256),
    envelope: JSON.parse(String(row.envelope)) as Envelope,
    recipients: JSON.parse(String(row.recipients)) as RecipientStatus[],
    createdAt: Number(row.created_at),
  };
}

export const isOpen = (status: RecipientStatus) =>
  status.state === 'pending' || status.state === 'full';

export class Outbox {
  private readonly sql: Sql;
  constructor(sql: Sql) {
    this.sql = sql;
    for (const statement of SCHEMA) sql.exec(statement);
  }

  /** Sends committed today (UTC) by this sender, for the daily budget. */
  sentToday(now: number): number {
    const start = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate()
    );
    const rows = this.sql
      .exec('SELECT recipients FROM outbox WHERE created_at >= ?', start)
      .toArray();
    return rows.reduce(
      (sum, row) =>
        sum + (JSON.parse(String(row.recipients)) as unknown[]).length,
      0
    );
  }

  /**
   * Commit an intent idempotently. Same id + digest returns the stored intent
   * (replay); same id + other digest is a conflict.
   */
  commit(
    envelope: Envelope,
    recipients: readonly string[],
    now: number
  ):
    | { ok: true; intent: Intent; replay: boolean }
    | { ok: false; status: number; code: string } {
    const existing = this.get(envelope.id);
    if (existing) {
      if (existing.sha256 !== envelope.sha256)
        return { ok: false, status: 409, code: 'correlation_conflict' };
      return { ok: true, intent: existing, replay: true };
    }
    if (this.sentToday(now) + recipients.length > LIMITS.sendsPerSenderPerDay)
      return { ok: false, status: 429, code: 'daily_mesh_budget_exhausted' };
    const statuses: RecipientStatus[] = recipients.map(to => ({
      to,
      state: 'pending',
      attempts: 0,
    }));
    this.sql.exec(
      'INSERT INTO outbox (id, sha256, envelope, recipients, created_at) VALUES (?, ?, ?, ?, ?)',
      envelope.id,
      envelope.sha256,
      JSON.stringify(envelope),
      JSON.stringify(statuses),
      now
    );
    return {
      ok: true,
      intent: {
        id: envelope.id,
        sha256: envelope.sha256,
        envelope,
        recipients: statuses,
        createdAt: now,
      },
      replay: false,
    };
  }

  get(id: string): Intent | null {
    const row = this.sql
      .exec('SELECT * FROM outbox WHERE id = ?', id)
      .toArray()[0];
    return row ? toIntent(row) : null;
  }

  update(intent: Intent, now: number): void {
    const done = !intent.recipients.some(isOpen);
    this.sql.exec(
      'UPDATE outbox SET recipients = ?, done_at = ? WHERE id = ?',
      JSON.stringify(intent.recipients),
      done ? now : null,
      intent.id
    );
  }

  open(limit = 50): Intent[] {
    return this.sql
      .exec(
        'SELECT * FROM outbox WHERE done_at IS NULL ORDER BY created_at LIMIT ?',
        limit
      )
      .toArray()
      .map(toIntent);
  }

  /** One alarm per DO: tasks record their own due time; arm min(due). */
  schedule(task: string, due: number | null): void {
    if (due === null) {
      this.sql.exec('DELETE FROM schedule WHERE task = ?', task);
      return;
    }
    this.sql.exec(
      'INSERT INTO schedule (task, due) VALUES (?, ?) ON CONFLICT(task) DO UPDATE SET due = MIN(due, excluded.due)',
      task,
      due
    );
  }

  /** Replace (not min) a task's due time, for tasks that reschedule themselves. */
  reschedule(task: string, due: number): void {
    this.sql.exec(
      'INSERT INTO schedule (task, due) VALUES (?, ?) ON CONFLICT(task) DO UPDATE SET due = excluded.due',
      task,
      due
    );
  }

  dueTasks(now: number): string[] {
    return this.sql
      .exec('SELECT task FROM schedule WHERE due <= ?', now)
      .toArray()
      .map(row => String(row.task));
  }

  nextDue(): number | null {
    const row = this.sql
      .exec('SELECT min(due) AS due FROM schedule')
      .toArray()[0];
    return row?.due === null || row?.due === undefined ? null : Number(row.due);
  }
}
