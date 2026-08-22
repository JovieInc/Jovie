import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DurableOperatingStore,
  FailoverOperatingStore,
  memoryRecordBackend,
} from './store';
import type { OvieSummerTurn } from './types';

const queued = (id: string): OvieSummerTurn => ({
  id,
  kind: 'summer-turn',
  conversationId: 'summer-session:current',
  userText: 'Continue the founder conversation.',
  state: 'queued',
  createdAt: '2026-08-21T23:40:00.000Z',
  updatedAt: '2026-08-21T23:40:00.000Z',
});

const liveClaim = (claimToken: string) => ({
  workerId: 'current-mac',
  claimToken,
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
  ttlSeconds: 120,
});

describe('durable Ovie Summer turn store', () => {
  afterEach(() => vi.useRealTimers());

  it('persists one indexed turn across store instances', async () => {
    const backend = memoryRecordBackend();
    const writer = new DurableOperatingStore(backend);
    const reader = new DurableOperatingStore(backend);
    await writer.putSummerTurn(queued('turn_persisted'));
    await writer.putSummerTurn(queued('turn_persisted'));
    await expect(reader.getSummerTurn('turn_persisted')).resolves.toMatchObject(
      {
        state: 'queued',
      }
    );
    await expect(reader.listSummerTurns()).resolves.toHaveLength(1);
  });

  it('recovers an expired claim while fencing its stale completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T23:40:00.000Z'));
    const store = new DurableOperatingStore(memoryRecordBackend());
    await store.putSummerTurn(queued('turn_recovered'));
    await expect(
      store.claimSummerTurn('turn_recovered', {
        workerId: 'old-mac',
        claimToken: 'old-claim',
        expiresAt: '2026-08-21T23:40:01.000Z',
        ttlSeconds: 1,
      })
    ).resolves.toMatchObject({ claimToken: 'old-claim' });
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(
      store.claimSummerTurn('turn_recovered', {
        workerId: 'current-mac',
        claimToken: 'current-claim',
        expiresAt: '2026-08-21T23:42:01.001Z',
        ttlSeconds: 120,
      })
    ).resolves.toMatchObject({ claimToken: 'current-claim' });
    await expect(
      store.completeSummerTurn('turn_recovered', {
        claimToken: 'old-claim',
        responseText: 'Stale answer',
        completedAt: '2026-08-21T23:40:02.000Z',
      })
    ).resolves.toBeUndefined();
    await expect(
      store.completeSummerTurn('turn_recovered', {
        claimToken: 'current-claim',
        responseText: 'Current Summer answer',
        completedAt: '2026-08-21T23:40:02.000Z',
      })
    ).resolves.toMatchObject({
      state: 'completed',
      responseText: 'Current Summer answer',
    });
  });

  it('uses the stored lease expiry when a durable backend retains expired claims', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T23:40:00.000Z'));
    const durableBackend = memoryRecordBackend();
    const baseSetIfAbsent = durableBackend.setIfAbsent;
    durableBackend.setIfAbsent = async (key, value) =>
      baseSetIfAbsent(key, value, 60 * 60 * 24 * 14);
    const store = new DurableOperatingStore(durableBackend);
    await store.putSummerTurn(queued('turn_postgres_recovery'));
    await store.claimSummerTurn('turn_postgres_recovery', {
      workerId: 'old-mac',
      claimToken: 'old-claim',
      expiresAt: '2026-08-21T23:40:01.000Z',
      ttlSeconds: 1,
    });

    await vi.advanceTimersByTimeAsync(1_001);

    await expect(
      store.claimSummerTurn('turn_postgres_recovery', {
        workerId: 'current-mac',
        claimToken: 'current-claim',
        expiresAt: '2026-08-21T23:42:01.001Z',
        ttlSeconds: 120,
      })
    ).resolves.toMatchObject({
      claimedBy: 'current-mac',
      claimToken: 'current-claim',
    });
  });

  it('does not let enqueue retries overwrite claimed or completed state', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    const original = queued('turn_enqueue_retry');
    await store.putSummerTurn(original);
    await store.claimSummerTurn(
      'turn_enqueue_retry',
      liveClaim('current-claim')
    );

    await expect(store.putSummerTurn(original)).resolves.toMatchObject({
      state: 'claimed',
      claimToken: 'current-claim',
    });

    await store.completeSummerTurn('turn_enqueue_retry', {
      claimToken: 'current-claim',
      responseText: 'Current Summer answer',
      completedAt: new Date().toISOString(),
    });

    await expect(store.putSummerTurn(original)).resolves.toMatchObject({
      state: 'completed',
      responseText: 'Current Summer answer',
    });
  });

  it('atomically returns one winner for concurrent enqueue retries', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    const first = queued('turn_concurrent_enqueue');
    const conflictingRetry = {
      ...first,
      userText: 'Conflicting retry payload.',
    };

    const [winner, retryResult] = await Promise.all([
      store.putSummerTurn(first),
      store.putSummerTurn(conflictingRetry),
    ]);

    expect(retryResult).toEqual(winner);
    await expect(
      store.getSummerTurn('turn_concurrent_enqueue')
    ).resolves.toEqual(winner);
    await expect(store.listSummerTurns()).resolves.toEqual([winner]);
  });

  it('lets only one live claimant win a concurrent race', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    await store.putSummerTurn(queued('turn_claim_race'));
    const [first, second] = await Promise.all([
      store.claimSummerTurn('turn_claim_race', liveClaim('claim-a')),
      store.claimSummerTurn('turn_claim_race', liveClaim('claim-b')),
    ]);
    const winners = [first, second].filter(Boolean);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.state).toBe('claimed');
    const loserToken =
      winners[0]?.claimToken === 'claim-a' ? 'claim-b' : 'claim-a';
    await expect(
      store.completeSummerTurn('turn_claim_race', {
        claimToken: loserToken,
        responseText: 'Loser answer',
        completedAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });

  it('fences a terminal failure against a later completion', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    await store.putSummerTurn(queued('turn_failed'));
    await store.claimSummerTurn('turn_failed', liveClaim('failure-claim'));
    await expect(
      store.failSummerTurn('turn_failed', {
        claimToken: 'failure-claim',
        failureCode: 'summer-runtime-exit-1',
        failedAt: new Date().toISOString(),
      })
    ).resolves.toMatchObject({
      state: 'failed',
      failureCode: 'summer-runtime-exit-1',
    });
    await expect(
      store.completeSummerTurn('turn_failed', {
        claimToken: 'failure-claim',
        responseText: 'Late answer',
        completedAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });

  it('keeps Postgres fallback authoritative when Redis has a split-brain claim', async () => {
    const primary = new DurableOperatingStore(memoryRecordBackend());
    const fallback = new DurableOperatingStore(memoryRecordBackend());
    await fallback.putSummerTurn(queued('turn_split'));
    await fallback.claimSummerTurn('turn_split', liveClaim('pg-claim'));
    await primary.putSummerTurn(queued('turn_split'));
    await primary.claimSummerTurn('turn_split', liveClaim('redis-claim'));

    const store = new FailoverOperatingStore({
      primary,
      fallback,
      isPrimaryFailure: () => false,
    });

    await expect(
      store.completeSummerTurn('turn_split', {
        claimToken: 'redis-claim',
        responseText: 'Redis split-brain answer',
        completedAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
    await expect(
      store.completeSummerTurn('turn_split', {
        claimToken: 'pg-claim',
        responseText: 'Postgres authoritative answer',
        completedAt: new Date().toISOString(),
      })
    ).resolves.toMatchObject({
      state: 'completed',
      responseText: 'Postgres authoritative answer',
    });
    await expect(store.getSummerTurn('turn_split')).resolves.toMatchObject({
      state: 'completed',
      claimToken: 'pg-claim',
    });
    await expect(primary.getSummerTurn('turn_split')).resolves.toMatchObject({
      state: 'claimed',
      claimToken: 'redis-claim',
    });
  });

  it('keeps the fallback claimed record when an enqueue retry hits failover', async () => {
    const fallback = new DurableOperatingStore(memoryRecordBackend());
    const primary = new DurableOperatingStore(memoryRecordBackend());
    const store = new FailoverOperatingStore({
      primary,
      fallback,
      isPrimaryFailure: () => false,
      writeThrough: true,
    });
    await store.putSummerTurn(queued('turn_failover'));
    await store.claimSummerTurn('turn_failover', liveClaim('current-claim'));
    await expect(
      store.putSummerTurn(queued('turn_failover'))
    ).resolves.toMatchObject({
      state: 'claimed',
      claimToken: 'current-claim',
    });
    await expect(
      fallback.getSummerTurn('turn_failover')
    ).resolves.toMatchObject({
      state: 'claimed',
      claimToken: 'current-claim',
    });
  });
});
