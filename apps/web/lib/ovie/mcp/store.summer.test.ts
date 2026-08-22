import { describe, expect, it } from 'vitest';
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
  createdAt: '2026-08-22T00:00:00.000Z',
  updatedAt: '2026-08-22T00:00:00.000Z',
});

describe('durable Ovie Summer turn store', () => {
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

  it('does not let enqueue retries overwrite claimed or completed state', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    const original = queued('turn_enqueue_retry');
    await store.putSummerTurn(original);
    await store.claimSummerTurn('turn_enqueue_retry', {
      workerId: 'current-mac',
      claimToken: 'current-claim',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });

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

  it('fences a stale claim completion and a later completion after failure', async () => {
    const store = new DurableOperatingStore(memoryRecordBackend());
    await store.putSummerTurn(queued('turn_fenced'));
    await store.claimSummerTurn('turn_fenced', {
      workerId: 'old-mac',
      claimToken: 'old-claim',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });
    await expect(
      store.completeSummerTurn('turn_fenced', {
        claimToken: 'old-claim',
        responseText: 'Stale answer',
        completedAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();

    const claimed = await store.claimSummerTurn('turn_fenced', {
      workerId: 'current-mac',
      claimToken: 'current-claim',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    expect(claimed?.claimToken).toBe('current-claim');
    await store.failSummerTurn('turn_fenced', {
      claimToken: 'current-claim',
      failureCode: 'summer-runtime-exit-1',
      failedAt: new Date().toISOString(),
    });
    await expect(
      store.completeSummerTurn('turn_fenced', {
        claimToken: 'current-claim',
        responseText: 'Late answer',
        completedAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
    await expect(store.getSummerTurn('turn_fenced')).resolves.toMatchObject({
      state: 'failed',
      failureCode: 'summer-runtime-exit-1',
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
    await store.claimSummerTurn('turn_failover', {
      workerId: 'current-mac',
      claimToken: 'current-claim',
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    await expect(
      store.putSummerTurn(queued('turn_failover'))
    ).resolves.toMatchObject({
      state: 'claimed',
      claimToken: 'current-claim',
    });
    await expect(primary.getSummerTurn('turn_failover')).resolves.toMatchObject(
      {
        state: 'claimed',
        claimToken: 'current-claim',
      }
    );
  });
});
