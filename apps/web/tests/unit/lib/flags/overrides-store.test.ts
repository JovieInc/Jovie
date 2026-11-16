import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFlagOverrideMap } from '@/lib/flags/overrides-store.server';

const mocks = vi.hoisted(() => ({ table: vi.fn(), rows: vi.fn() }));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  doesTableExist: mocks.table,
  db: { select: () => ({ from: mocks.rows }) },
}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));

beforeEach(() => {
  mocks.table.mockReset().mockResolvedValue(true);
  mocks.rows.mockReset().mockResolvedValue([]);
});

describe('draft gate override availability', () => {
  it('distinguishes no configured rollout from an unreadable override store', async () => {
    expect(await getFlagOverrideMap('prod')).toEqual({});
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
      expect(await getFlagOverrideMap('prod')).toEqual({
        OUTBOUND_DOGFOOD_GATE: value,
      });
    }
  });
});
