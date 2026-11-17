import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFlagOverrideMap,
  revalidateFeatureFlags,
} from '@/lib/flags/overrides-store.server';

const mocks = vi.hoisted(() => ({
  table: vi.fn(),
  rows: vi.fn(),
  revalidateTag: vi.fn(),
  // Mirrors the Data Cache: a returned value is stored with no expiry, a
  // thrown error is not stored.
  store: new Map<string, unknown>(),
}));
vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, keyParts: string[]) => async () => {
      const key = keyParts.join(':');
      if (!mocks.store.has(key)) mocks.store.set(key, await fn());
      return mocks.store.get(key);
    },
  revalidateTag: mocks.revalidateTag,
}));
vi.mock('@/lib/db', () => ({
  doesTableExist: mocks.table,
  db: { select: () => ({ from: mocks.rows }) },
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));

beforeEach(() => {
  mocks.table.mockReset().mockResolvedValue(true);
  mocks.rows.mockReset().mockResolvedValue([]);
  mocks.revalidateTag.mockReset();
  mocks.store.clear();
});

describe('draft gate override availability', () => {
  it('distinguishes no configured rollout from an unreadable override store', async () => {
    expect(await getFlagOverrideMap('prod')).toEqual({});
    mocks.store.clear();
    mocks.rows.mockRejectedValue(new Error('database unavailable'));
    expect(await getFlagOverrideMap('prod')).toEqual({
      OUTBOUND_DOGFOOD_GATE: true,
    });
  });

  it('keeps draft gating closed when the table probe cannot confirm configuration', async () => {
    mocks.table.mockResolvedValue(false);
    expect(await getFlagOverrideMap('prod')).toEqual({
      OUTBOUND_DOGFOOD_GATE: true,
    });
    expect(mocks.rows).not.toHaveBeenCalled();
  });

  it('preserves explicit enable and disable overrides', async () => {
    for (const value of [true, false]) {
      mocks.rows.mockResolvedValue([
        { flagKey: 'OUTBOUND_DOGFOOD_GATE', value },
      ]);
      mocks.store.clear();
      expect(await getFlagOverrideMap('prod')).toEqual({
        OUTBOUND_DOGFOOD_GATE: value,
      });
    }
  });
});

describe('override cache correctness', () => {
  it('does not cache the fallback from a failed read: the next read retries the store', async () => {
    mocks.rows.mockRejectedValueOnce(new Error('database unavailable'));
    expect(await getFlagOverrideMap('prod')).toEqual({
      OUTBOUND_DOGFOOD_GATE: true,
    });

    mocks.rows.mockResolvedValue([{ flagKey: 'SOME_FLAG', value: false }]);
    expect(await getFlagOverrideMap('prod')).toEqual({ SOME_FLAG: false });
  });

  it('does not cache the fallback when the table probe fails transiently', async () => {
    mocks.table.mockResolvedValueOnce(false);
    expect(await getFlagOverrideMap('prod')).toEqual({
      OUTBOUND_DOGFOOD_GATE: true,
    });

    expect(await getFlagOverrideMap('prod')).toEqual({});
    expect(mocks.rows).toHaveBeenCalledTimes(1);
  });

  it('caches a successful read', async () => {
    await getFlagOverrideMap('prod');
    await getFlagOverrideMap('prod');
    expect(mocks.rows).toHaveBeenCalledTimes(1);
  });

  it('expires the override cache immediately after a write, not stale-while-revalidate', () => {
    revalidateFeatureFlags();
    expect(mocks.revalidateTag).toHaveBeenCalledWith('feature-flags', {
      expire: 0,
    });
  });
});
