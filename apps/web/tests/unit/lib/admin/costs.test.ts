import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({
  doesTableExist: vi.fn(),
  db: {
    select: () => ({
      from: () => {
        const query = mocks.rows();
        return Object.assign(query, {
          where: () => ({ orderBy: () => query }),
        });
      },
    }),
  },
}));
vi.mock('@/lib/db/schema/admin', () => ({
  adminCosts: { isActive: 'is_active', label: 'label' },
  adminSystemSettings: { id: 'id', costsLastRefreshedAt: 'ts' },
}));

import {
  COST_FRESHNESS_BUDGET_MS,
  getAdminCosts,
  mapAdminCostRow,
} from '@/lib/admin/costs';
import type { AdminCost } from '@/lib/db/schema/admin';

const ROW: AdminCost = {
  id: '00000000-0000-0000-0000-000000000001',
  label: 'Vercel',
  monthlyUsd: '20',
  observed30dUsd: '12.5',
  period: 'monthly',
  notes: 'Application hosting',
  externalUrl: null,
  isActive: true,
  updatedAt: new Date('2026-10-01T00:00:00Z'),
};

describe('Admin cost source truth', () => {
  beforeEach(() => {
    mocks.rows.mockReset();
    mocks.rows.mockResolvedValue([]);
  });
  it('returns a genuinely empty read without fabricating refresh evidence', async () => {
    expect(await getAdminCosts()).toEqual([]);
  });
  it('rejects a malformed cost timestamp instead of rendering an observation', async () => {
    mocks.rows.mockResolvedValue([
      { ...ROW, updatedAt: 'not-a-timestamp' as unknown as Date },
    ]);
    await expect(getAdminCosts()).rejects.toThrow();
    expect(() =>
      mapAdminCostRow({
        ...ROW,
        updatedAt: 'not-a-timestamp' as unknown as Date,
      })
    ).toThrow();
  });
  it('marks an observation stale only against its own cadence budget', () => {
    const now = new Date('2026-11-01T00:00:00Z');
    const fresh = mapAdminCostRow(
      { ...ROW, updatedAt: new Date('2026-10-20T00:00:00Z') },
      now
    );
    expect(fresh.freshness).toBe('fresh');
    const stale = mapAdminCostRow(
      {
        ...ROW,
        updatedAt: new Date(
          now.getTime() - COST_FRESHNESS_BUDGET_MS.monthly - 1
        ),
      },
      now
    );
    expect(stale.freshness).toBe('stale');
    expect(stale.observedAtIso).not.toBeNull();
  });
  it('treats a missing observation time as unknown, never fresh', () => {
    const row = mapAdminCostRow(
      { ...ROW, updatedAt: null as unknown as Date },
      new Date()
    );
    expect(row.freshness).toBe('unknown');
    expect(row.observedAtIso).toBeNull();
  });
});
