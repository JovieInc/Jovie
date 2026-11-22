import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/env-server', () => ({ env: { LINEAR_API_KEY: undefined } }));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/redis', () => ({ getRedis: () => null }));
vi.mock('@/lib/ovie/mcp/founder-work', () => ({
  createLiveFounderWorkReader: vi.fn(),
}));

import {
  getLinearIssueSnapshot,
  LINEAR_ISSUE_SNAPSHOT_KEY,
  LINEAR_ISSUE_SNAPSHOT_SCHEMA,
  type LinearIssueSnapshotDeps,
  linearIssueSnapshotCronJob,
  scheduleLinearIssueSnapshotRefresh,
} from '@/lib/ovie/linear-issue-snapshot.server';

const NOW = new Date('2026-11-22T12:00:00.000Z');

function makeRedis(initial?: unknown) {
  const store = new Map<string, unknown>();
  if (initial !== undefined) store.set(LINEAR_ISSUE_SNAPSHOT_KEY, initial);
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
      return 'OK';
    }),
  };
}

const snapshotAt = (iso: string) => ({
  schema: LINEAR_ISSUE_SNAPSHOT_SCHEMA,
  generatedAt: iso,
  issues: [],
});

function deps(
  redis: ReturnType<typeof makeRedis>,
  fetchIssues: LinearIssueSnapshotDeps['fetchIssues']
): LinearIssueSnapshotDeps {
  return {
    redis: redis as unknown as LinearIssueSnapshotDeps['redis'],
    fetchIssues,
    now: () => NOW,
  };
}

describe('linear issue snapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('serves a snapshot younger than 15 minutes without reading Linear', async () => {
    const fetchIssues = vi.fn(async () => []);
    const redis = makeRedis(
      JSON.stringify(snapshotAt('2026-11-22T11:50:00.000Z'))
    );
    const result = await getLinearIssueSnapshot(deps(redis, fetchIssues));
    expect(result.status).toBe('ok');
    expect(fetchIssues).not.toHaveBeenCalled();
  });

  it('does one live read and writes it when the snapshot is missing or stale', async () => {
    const fetchIssues = vi.fn(async () => []);
    const redis = makeRedis(
      JSON.stringify(snapshotAt('2026-11-22T11:00:00.000Z'))
    );
    const result = await getLinearIssueSnapshot(deps(redis, fetchIssues));
    expect(fetchIssues).toHaveBeenCalledTimes(1);
    expect(result.status === 'ok' && result.snapshot.generatedAt).toBe(
      NOW.toISOString()
    );
    expect(redis.set).toHaveBeenCalledWith(
      LINEAR_ISSUE_SNAPSHOT_KEY,
      expect.stringContaining(NOW.toISOString())
    );
  });

  it('dedupes concurrent stale reads into one live read', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const fetchIssues = vi.fn(async () => {
      await gate;
      return [];
    });
    const redis = makeRedis();
    const d = deps(redis, fetchIssues);
    const calls = [
      getLinearIssueSnapshot(d),
      getLinearIssueSnapshot(d),
      getLinearIssueSnapshot(d),
    ];
    await vi.waitFor(() => expect(fetchIssues).toHaveBeenCalledTimes(1));
    release();
    await Promise.all(calls);
    expect(fetchIssues).toHaveBeenCalledTimes(1);
  });

  it('reports unreachable, keeping the older copy, when Linear fails', async () => {
    const stale = snapshotAt('2026-11-22T09:00:00.000Z');
    const redis = makeRedis(JSON.stringify(stale));
    const result = await getLinearIssueSnapshot(
      deps(
        redis,
        vi.fn(async () => {
          throw new Error('down');
        })
      )
    );
    expect(result).toMatchObject({
      status: 'unreachable',
      snapshot: { generatedAt: stale.generatedAt },
    });
  });

  it('reports unreachable with no snapshot when nothing is stored', async () => {
    const result = await getLinearIssueSnapshot(
      deps(
        makeRedis(),
        vi.fn(async () => {
          throw new Error('down');
        })
      )
    );
    expect(result).toEqual({ status: 'unreachable', snapshot: null });
  });

  it('ignores non-Issue and non-JOV webhook payloads', async () => {
    const { after } = await import('next/server');
    scheduleLinearIssueSnapshotRefresh({ type: 'Comment' });
    scheduleLinearIssueSnapshotRefresh({
      type: 'Issue',
      data: { team: { key: 'OTH' } },
    });
    expect(after).not.toHaveBeenCalled();
    scheduleLinearIssueSnapshotRefresh({
      type: 'Issue',
      data: { team: { key: 'JOV' } },
    });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('cron backstop skips instead of failing when Linear is not configured', async () => {
    await expect(linearIssueSnapshotCronJob()).resolves.toEqual({
      skipped: 'linear_not_configured',
    });
  });
});
