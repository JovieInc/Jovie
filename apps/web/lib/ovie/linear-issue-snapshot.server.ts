import 'server-only';

import { after } from 'next/server';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { createLiveFounderWorkReader } from '@/lib/ovie/mcp/founder-work';
import { getRedis } from '@/lib/redis';
import type { LinearIssueRow } from './linear-issue-task-view';

export const LINEAR_ISSUE_SNAPSHOT_KEY = 'ovie:linear-issues:v1';
export const LINEAR_ISSUE_SNAPSHOT_SCHEMA = 'ovie.linear-issues.v1';
/** Page reads older than this do one live read. Webhook and cron keep it fresher. */
export const LINEAR_ISSUE_SNAPSHOT_MAX_AGE_MS = 15 * 60_000;
const ISSUE_LIMIT = 100;

type RedisStore = NonNullable<ReturnType<typeof getRedis>>;

export interface LinearIssueSnapshot {
  readonly schema: typeof LINEAR_ISSUE_SNAPSHOT_SCHEMA;
  readonly generatedAt: string;
  readonly issues: readonly LinearIssueRow[];
}

export type LinearIssueSnapshotResult =
  | { readonly status: 'ok'; readonly snapshot: LinearIssueSnapshot }
  /** Live read failed; `snapshot` is the older copy, if any. */
  | {
      readonly status: 'unreachable';
      readonly snapshot: LinearIssueSnapshot | null;
    };

export interface LinearIssueSnapshotDeps {
  readonly redis: RedisStore | null;
  readonly fetchIssues: () => Promise<readonly LinearIssueRow[]>;
  readonly now: () => Date;
}

const liveDeps = (): LinearIssueSnapshotDeps => ({
  redis: getRedis(),
  fetchIssues: async () =>
    (
      await createLiveFounderWorkReader().listLinearIssues(ISSUE_LIMIT, true)
    ).filter((issue): issue is typeof issue & LinearIssueRow =>
      Boolean(issue.id && issue.identifier && issue.title && issue.url)
    ),
  now: () => new Date(),
});

export function decodeLinearIssueSnapshot(
  value: unknown
): LinearIssueSnapshot | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    const record = parsed as Partial<LinearIssueSnapshot> | null;
    return record &&
      typeof record === 'object' &&
      record.schema === LINEAR_ISSUE_SNAPSHOT_SCHEMA &&
      typeof record.generatedAt === 'string' &&
      Array.isArray(record.issues)
      ? (record as LinearIssueSnapshot)
      : null;
  } catch {
    return null;
  }
}

export function isLinearIssueSnapshotFresh(
  snapshot: LinearIssueSnapshot,
  now: Date
): boolean {
  const age = now.getTime() - new Date(snapshot.generatedAt).getTime();
  return (
    Number.isFinite(age) && age >= 0 && age < LINEAR_ISSUE_SNAPSHOT_MAX_AGE_MS
  );
}

async function readStored(
  redis: RedisStore | null
): Promise<LinearIssueSnapshot | null> {
  if (!redis) return null;
  try {
    return decodeLinearIssueSnapshot(
      await redis.get<unknown>(LINEAR_ISSUE_SNAPSHOT_KEY)
    );
  } catch {
    return null;
  }
}

// One live read per instance at a time, however many callers ask.
let inFlight: Promise<LinearIssueSnapshot> | null = null;

/** Read Linear and write the snapshot. Throws if Linear cannot be read. */
export function refreshLinearIssueSnapshot(
  deps: LinearIssueSnapshotDeps = liveDeps()
): Promise<LinearIssueSnapshot> {
  if (inFlight) return inFlight;
  const run = (async () => {
    const issues = await deps.fetchIssues();
    const snapshot: LinearIssueSnapshot = {
      schema: LINEAR_ISSUE_SNAPSHOT_SCHEMA,
      generatedAt: deps.now().toISOString(),
      issues,
    };
    if (deps.redis) {
      try {
        await deps.redis.set(
          LINEAR_ISSUE_SNAPSHOT_KEY,
          JSON.stringify(snapshot)
        );
      } catch (error) {
        await captureError('Linear issue snapshot write failed', error, {
          route: 'ovie/linear-issue-snapshot',
        });
      }
    }
    return snapshot;
  })();
  inFlight = run;
  const clear = () => {
    if (inFlight === run) inFlight = null;
  };
  run.then(clear, clear);
  return run;
}

/** Page read: serve a fresh snapshot, else one deduped live read. */
export async function getLinearIssueSnapshot(
  deps: LinearIssueSnapshotDeps = liveDeps()
): Promise<LinearIssueSnapshotResult> {
  const stored = await readStored(deps.redis);
  if (stored && isLinearIssueSnapshotFresh(stored, deps.now())) {
    return { status: 'ok', snapshot: stored };
  }
  try {
    return { status: 'ok', snapshot: await refreshLinearIssueSnapshot(deps) };
  } catch (error) {
    await captureError('Linear issue snapshot read failed', error, {
      route: 'ovie/linear-issue-snapshot',
    });
    return { status: 'unreachable', snapshot: stored };
  }
}

/** Webhook hook: refresh after the response on a JOV `Issue` event. */
export function scheduleLinearIssueSnapshotRefresh(payload: {
  readonly type?: string;
  readonly data?: unknown;
}) {
  if (payload.type !== 'Issue') return;
  const teamKey = (payload.data as { team?: { key?: string } } | undefined)
    ?.team?.key;
  if (teamKey && teamKey !== 'JOV') return;
  const task = async () => {
    try {
      await refreshLinearIssueSnapshot();
    } catch (error) {
      await captureError(
        'Linear issue snapshot webhook refresh failed',
        error,
        {
          route: '/api/webhooks/linear',
        }
      );
    }
  };
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Cron backstop. */
export async function linearIssueSnapshotCronJob(): Promise<
  Record<string, unknown>
> {
  if (!env.LINEAR_API_KEY) return { skipped: 'linear_not_configured' };
  const snapshot = await refreshLinearIssueSnapshot();
  return { issues: snapshot.issues.length };
}
