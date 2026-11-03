import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const returning = vi.fn(async () => [{ key: 'claim-key' }]);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const captureWarning = vi.fn(async () => undefined);
  return {
    insert,
    onConflictDoNothing,
    returning,
    values,
    update,
    set,
    where,
    captureWarning,
  };
});

vi.mock('@/lib/db', () => ({
  db: { insert: mocks.insert, update: mocks.update },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mocks.captureWarning,
}));

import {
  OVIE_OPERATING_KV_ROW_BUDGET_BYTES,
  postgresRecordBackend,
} from './postgres-backend';

describe('postgresRecordBackend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts a claim only when absent without deriving expiry from claimant TTL', async () => {
    const backend = postgresRecordBackend();

    await expect(
      backend.setIfAbsent('claim-key', 'stored-lease', 120)
    ).resolves.toBe(true);

    expect(mocks.onConflictDoNothing).toHaveBeenCalledOnce();
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'claim-key', value: 'stored-lease' })
    );
  });

  it('compare-and-sets against the stored value rather than the incoming TTL', async () => {
    const backend = postgresRecordBackend();

    await expect(
      backend.compareAndSet('claim-key', 'stored-lease', 'next-lease', 120)
    ).resolves.toBe(true);

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'next-lease' })
    );
    expect(mocks.where).toHaveBeenCalledOnce();
  });

  it('passes structured decision values through the database compare-and-set', async () => {
    const backend = postgresRecordBackend();
    const expected = { id: 'dec_1', decided: '{"turns":[]}' };
    const next = { id: 'dec_1', decided: '{"turns":["next"]}' };

    await expect(
      backend.compareAndSet('decision-key', expected, next, 120)
    ).resolves.toBe(true);

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ value: next })
    );
    expect(mocks.where).toHaveBeenCalledOnce();
  });
  it('warns, without failing the write, when a row exceeds the size budget', async () => {
    const backend = postgresRecordBackend();
    const big = 'x'.repeat(OVIE_OPERATING_KV_ROW_BUDGET_BYTES + 1);

    await expect(
      backend.setIfAbsent('jovie:cert:ledger:row:1', big, 120)
    ).resolves.toBe(true);
    await expect(
      backend.compareAndSet(
        'jovie:cert:ledger:row:1',
        'old',
        { blob: big },
        120
      )
    ).resolves.toBe(true);

    expect(mocks.captureWarning).toHaveBeenCalledTimes(2);
    expect(mocks.captureWarning).toHaveBeenCalledWith(
      'ovie_operating_kv row over size budget',
      undefined,
      expect.objectContaining({
        keyPrefix: 'jovie:cert:ledger:row',
        budget: OVIE_OPERATING_KV_ROW_BUDGET_BYTES,
        bytes: expect.any(Number),
      })
    );
  });

  it('stays quiet for rows at or under the size budget', async () => {
    const backend = postgresRecordBackend();

    await backend.setIfAbsent(
      'small-key',
      'x'.repeat(OVIE_OPERATING_KV_ROW_BUDGET_BYTES),
      120
    );

    expect(mocks.captureWarning).not.toHaveBeenCalled();
  });
});
