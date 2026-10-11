import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ exists: vi.fn(), rows: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/error-tracking', () => ({ captureWarning: vi.fn() }));
vi.mock('@/lib/db', () => ({
  doesTableExist: mocks.exists,
  db: {
    select: () => ({
      from: () => {
        const query = mocks.rows();
        return Object.assign(query, {
          where: () => ({ orderBy: () => ({ limit: () => query }) }),
        });
      },
    }),
  },
}));

import { getFeatureFlagAdminRows } from './admin-features.server';
import { getFeatureFlagAuditEvents } from './audit-log.server';

describe('Admin flag source truth', () => {
  beforeEach(() => {
    mocks.exists.mockResolvedValue(true);
    mocks.rows.mockResolvedValue([]);
  });
  it.each([getFeatureFlagAdminRows, getFeatureFlagAuditEvents])(
    'propagates a failed read instead of fabricating defaults or empty history',
    async read => {
      mocks.rows.mockRejectedValue(new Error('source timeout'));
      await expect(read()).rejects.toThrow('source timeout');
    }
  );
  it.each([getFeatureFlagAdminRows, getFeatureFlagAuditEvents])(
    'reports unavailable storage instead of claiming a successful read',
    async read => {
      mocks.exists.mockResolvedValue(false);
      await expect(read()).rejects.toThrow(/unavailable/);
    }
  );
  it('returns genuinely empty history and code defaults after successful reads', async () => {
    expect(await getFeatureFlagAuditEvents()).toEqual([]);
    expect((await getFeatureFlagAdminRows()).length).toBeGreaterThan(0);
  });
  it('retains explicit overrides and revision-relevant audit values on a successful read', async () => {
    const { APP_FLAG_DEFAULTS } = await import('./contracts');
    const flagKey = Object.keys(APP_FLAG_DEFAULTS)[0];
    mocks.rows.mockResolvedValueOnce([
      { flagKey, dev: true, staging: null, prod: false },
    ]);
    expect(await getFeatureFlagAdminRows()).toContainEqual(
      expect.objectContaining({
        flagKey,
        dev: true,
        staging: null,
        prod: false,
      })
    );
    mocks.rows.mockResolvedValueOnce([
      {
        id: 'audit-1',
        flagKey,
        envTier: 'prod',
        action: 'disable',
        actor: 'admin',
        previousValue: true,
        newValue: false,
        reason: 'rollback',
        createdAt: new Date('2026-10-02T10:00:00Z'),
      },
    ]);
    expect(
      await getFeatureFlagAuditEvents({ flagKey, envTier: 'prod', limit: 1 })
    ).toEqual([
      expect.objectContaining({
        id: 'audit-1',
        previousEffective: true,
        newEffective: false,
        canRollback: true,
        createdAt: '2026-10-02T10:00:00.000Z',
      }),
    ]);
  });
});
