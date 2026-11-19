/**
 * Vercel Board shadow mirror (one-week pilot; Tim 2026-11-19 "Build the Board
 * pilot anyway" — an explicit exception to the 2026-11-11 hub freeze). Pushes
 * new `stages` rows to a receiver on the Jovie web deployment, which writes
 * them into a Vercel Board channel (channel `mesh/tasks`). The hub never calls
 * Board and holds no Vercel token: the receiver authenticates with Vercel's
 * own deployment OIDC.
 *
 * Rules (dispatch spec):
 * - OFF by default: with either BOARD_MIRROR_URL or BOARD_MIRROR_SECRET unset,
 *   nothing fetches, nothing writes KV, and every caller behaves as before.
 * - Never blocks, throws into, or changes the result of an op path: callers
 *   run `drain` under `ctx.waitUntil` and swallow every error.
 * - No new SQL and no wrangler migration: the cursor, stats and skip counter
 *   live in DO storage KV keys (`boardMirror:*`).
 * - Rows are HMAC-signed (`${timestamp}.${rawBody}`) with BOARD_MIRROR_SECRET.
 * - The cursor advances only to the `processedThrough` stage id the receiver
 *   returns; a failed post leaves it in place and the existing alarm retries
 *   in 60 s. A backlog over MIRROR.skipBacklog rows skips ahead (pilot: data
 *   loss is preferred to an ever-growing queue) and counts the rows skipped.
 *
 * This module is pure over injected KV/fetch/clock so node:sqlite-free tests
 * cover it. See workers/mesh-hub/BOARD-PILOT.md.
 */

export const MIRROR = {
  /** Max rows per POST (receiver re-verifies). */
  batchRows: 50,
  /** One POST may take at most this long before it is aborted. */
  fetchTimeoutMs: 5_000,
  /** Backlog above this many rows skips ahead instead of draining. */
  skipBacklog: 1_000,
  /** Drain at most this many batches per trigger; the alarm continues the rest. */
  maxDrainBatches: 4,
  /** Task body chars mirrored when BOARD_MIRROR_BODY=1. */
  bodyChars: 2_000,
  /** Result/note/answer chars mirrored when BOARD_MIRROR_BODY=1. */
  tailChars: 500,
  /** The alarm re-runs a backed-up mirror after this long. */
  retryInMs: 60_000,
} as const;

/** KV keys in DO storage. Never store the secret here (it lives in env). */
export const MIRROR_KEYS = {
  cursor: 'boardMirror:cursor',
  skipped: 'boardMirror:skipped',
  stats: 'boardMirror:stats',
} as const;

/** The subset of DurableObjectStorage the mirror uses. */
export type MirrorKv = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<unknown> | Promise<void> | void;
};

/** One stage row joined to its task, as the store's `mirrorRows` returns it. */
export type MirrorRow = {
  stageId: number;
  taskId: string;
  at: number;
  actor: string;
  stage: string;
  note: string | null;
  type: string;
  title: string;
  poster: string;
  assignee: string | null;
  caps: string[];
  parent: string | null;
  status: string;
  result: string | null;
  body: string;
  answers: Array<{ from: string; at: number; text: string }>;
};

/** What the mirror reads from the BoardStore. */
export type MirrorSource = {
  maxStageId(): number;
  rows(afterId: number, limit: number): MirrorRow[];
};

export type MirrorEnv = {
  url?: string;
  secret?: string;
  includeBody?: boolean;
};

export type MirrorStats = {
  enabled: boolean;
  cursor: number | null;
  maxStageId: number | null;
  backlog: number | null;
  lastOkAt: number | null;
  lastErrorCode: string | null;
  lastErrorAt: number | null;
  skipped: number;
  posts: number;
  failures: number;
};

type StoredStats = {
  lastOkAt: number | null;
  lastErrorCode: string | null;
  lastErrorAt: number | null;
  skipped: number;
  posts: number;
  failures: number;
};

const EMPTY_STATS: StoredStats = {
  lastOkAt: null,
  lastErrorCode: null,
  lastErrorAt: null,
  skipped: 0,
  posts: 0,
  failures: 0,
};

/** HMAC-SHA256 hex over `${timestamp}.${rawBody}`, as the receiver verifies it. */
export async function mirrorSignature(
  secret: string,
  timestamp: string,
  rawBody: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`)
  );
  return [...new Uint8Array(mac)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

const clipped = (value: string | null, max: number) =>
  value === null ? null : value.slice(0, max);

/** Wire shape of one row: join fields always; long text only in body mode. */
export function serializeRow(row: MirrorRow, includeBody: boolean) {
  const base = {
    stageId: row.stageId,
    taskId: row.taskId,
    type: row.type,
    title: row.title,
    poster: row.poster,
    assignee: row.assignee,
    caps: row.caps,
    parent: row.parent,
    status: row.status,
    actor: row.actor,
    stage: row.stage,
    at: row.at,
  };
  if (!includeBody) return base;
  return {
    ...base,
    body: row.body.slice(0, MIRROR.bodyChars),
    note: clipped(row.note, MIRROR.tailChars),
    result: clipped(row.result, MIRROR.tailChars),
    answers: row.answers.slice(-BOARD_ANSWERS_MAX).map(answer => ({
      from: answer.from,
      at: answer.at,
      text: answer.text.slice(0, MIRROR.tailChars),
    })),
  };
}

const BOARD_ANSWERS_MAX = 20;

/**
 * The shadow mirror: one per Board DO. All methods are best-effort — a drain
 * reports what happened but never throws (callers still `.catch()` it).
 */
export class BoardMirror {
  readonly enabled: boolean;
  private readonly includeBody: boolean;
  private readonly url: string;
  private readonly secret: string;
  private readonly kv: MirrorKv;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(
    env: MirrorEnv,
    kv: MirrorKv,
    fetchFn: typeof fetch,
    now: () => number = Date.now
  ) {
    this.enabled = Boolean(env.url && env.secret);
    this.includeBody = env.includeBody === true;
    this.url = env.url ?? '';
    this.secret = env.secret ?? '';
    this.kv = kv;
    this.fetchFn = fetchFn;
    this.now = now;
  }

  private async cursor(): Promise<number | null> {
    const raw = await this.kv.get(MIRROR_KEYS.cursor);
    const value = Number(raw);
    return Number.isFinite(value) && raw !== null && raw !== undefined
      ? value
      : null;
  }

  private async stats(): Promise<StoredStats> {
    const raw = (await this.kv.get(MIRROR_KEYS.stats)) as
      | Partial<StoredStats>
      | undefined;
    return { ...EMPTY_STATS, ...(raw ?? {}) };
  }

  private async save(cursor: number, stats: StoredStats) {
    await this.kv.put(MIRROR_KEYS.cursor, cursor);
    await this.kv.put(MIRROR_KEYS.stats, stats as unknown);
  }

  /** Alarm backoff: when the mirror is enabled and rows are pending, retry in 60 s. */
  async backoffAt(source: MirrorSource): Promise<number | null> {
    if (!this.enabled) return null;
    const cursor = await this.cursor();
    if (cursor === null) return null;
    return source.maxStageId() > cursor ? this.now() + MIRROR.retryInMs : null;
  }

  /** Health snapshot for GET /v1/board/mirror. Never the secret or the URL. */
  async status(source: MirrorSource): Promise<MirrorStats> {
    if (!this.enabled)
      return {
        enabled: false,
        cursor: null,
        maxStageId: null,
        backlog: null,
        ...EMPTY_STATS,
      };
    const [cursor, stats] = await Promise.all([this.cursor(), this.stats()]);
    const max = source.maxStageId();
    return {
      enabled: true,
      cursor,
      maxStageId: max,
      backlog: cursor === null ? null : Math.max(max - cursor, 0),
      ...stats,
    };
  }

  /**
   * Push every unmirrored stage row, in order, in batches. Resolves with a
   * short summary; never throws.
   */
  async drain(
    source: MirrorSource
  ): Promise<{ posted: number; failed: boolean }> {
    if (!this.enabled) return { posted: 0, failed: false };
    let cursor = await this.cursor();
    if (cursor === null) {
      // First enable: start at the current max stage id. No backfill.
      await this.kv.put(MIRROR_KEYS.cursor, source.maxStageId());
      return { posted: 0, failed: false };
    }
    const stats = await this.stats();
    const max = source.maxStageId();
    if (max - cursor > MIRROR.skipBacklog) {
      stats.skipped += max - cursor;
      await this.save(max, stats);
      return { posted: 0, failed: false };
    }
    let posted = 0;
    for (let batch = 0; batch < MIRROR.maxDrainBatches; batch++) {
      const rows = source.rows(cursor, MIRROR.batchRows);
      if (!rows.length) break;
      const rawBody = JSON.stringify({
        schema: 'jovie.board-mirror/v1',
        rows: rows.map(row => serializeRow(row, this.includeBody)),
      });
      const timestamp = String(this.now());
      try {
        const response = await this.fetchFn(this.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-mesh-timestamp': timestamp,
            'x-mesh-signature': await mirrorSignature(
              this.secret,
              timestamp,
              rawBody
            ),
          },
          body: rawBody,
          signal: AbortSignal.timeout(MIRROR.fetchTimeoutMs),
        });
        if (!response.ok) throw new Error(`mirror_http_${response.status}`);
        const out = (await response.json()) as {
          processedThrough?: unknown;
        };
        const through = Number(out.processedThrough);
        if (!Number.isFinite(through)) throw new Error('mirror_bad_receipt');
        // Advance only as far as the receiver says it processed; the rest
        // re-sends on the next drain.
        cursor = Math.max(
          cursor,
          Math.min(through, rows[rows.length - 1].stageId)
        );
        stats.posts++;
        stats.lastOkAt = this.now();
        stats.lastErrorCode = null;
        stats.lastErrorAt = null;
        posted++;
        await this.save(cursor, stats);
        if (through < rows[rows.length - 1].stageId) break;
      } catch (error) {
        stats.failures++;
        stats.lastErrorCode =
          error instanceof Error ? error.message : 'mirror_error';
        stats.lastErrorAt = this.now();
        await this.save(cursor, stats);
        return { posted, failed: true };
      }
    }
    return { posted, failed: false };
  }
}
