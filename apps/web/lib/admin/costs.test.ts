import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ orderBy: mocks.rows }) }),
    }),
    insert: mocks.insert,
  },
}));

import { getAdminCosts, mapAdminCostRow, normalizeCostCadence } from './costs';

describe('Manual cost reads', () => {
  beforeEach(() => vi.clearAllMocks());
  it('returns an empty observation without seeding fictional zero spend', async () => {
    mocks.rows.mockResolvedValue([]);
    await expect(getAdminCosts()).resolves.toEqual([]);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('propagates failed reads without writing configuration', async () => {
    mocks.rows.mockRejectedValue(new Error('database unavailable'));
    await expect(getAdminCosts()).rejects.toThrow('database unavailable');
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

describe('Cost row freshness budgets', () => {
  const NOW = new Date('2026-10-21T12:00:00.000Z');
  const base = {
    id: 'row',
    label: 'Anthropic',
    monthlyUsd: '0',
    observed30dUsd: '0',
    period: 'usage-based',
    notes: '',
    externalUrl: null,
    isActive: true,
  };

  it('marks a five-month-old usage-based row stale', () => {
    const row = mapAdminCostRow(
      { ...base, updatedAt: new Date('2026-05-20T00:00:00.000Z') },
      NOW
    );
    expect(row.freshness).toBe('stale');
    expect(row.observedAtIso).toBe('2026-05-20T00:00:00.000Z');
    expect(row.periodLabel).toBe('Usage-based');
  });

  it('uses the cadence budget: a 40-day-old monthly bill is still fresh, usage is not', () => {
    const updatedAt = new Date(NOW.getTime() - 40 * 24 * 60 * 60 * 1000);
    expect(
      mapAdminCostRow({ ...base, period: 'MONTHLY', updatedAt }, NOW).freshness
    ).toBe('fresh');
    expect(mapAdminCostRow({ ...base, updatedAt }, NOW).freshness).toBe(
      'stale'
    );
    expect(
      mapAdminCostRow({ ...base, period: 'yearly', updatedAt }, NOW).periodLabel
    ).toBe('Annual');
  });

  it('normalizes cadence spellings', () => {
    expect(normalizeCostCadence('usage')).toBe('usage-based');
    expect(normalizeCostCadence('Usage Based')).toBe('usage-based');
    expect(normalizeCostCadence('something-else')).toBe('monthly');
  });
});
