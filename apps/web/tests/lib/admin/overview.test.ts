import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.hoisted(() => vi.fn());
const mockDoesTableExist = vi.hoisted(() => vi.fn());
const mockGetCurrentUserEntitlements = vi.hoisted(() => vi.fn());
const mockCaptureError = vi.hoisted(() => vi.fn());
const mockCaptureWarning = vi.hoisted(() => vi.fn());
const mockGetAdminStripeOverviewMetrics = vi.hoisted(() => vi.fn());
const mockGetAdminMercuryMetrics = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  db: { select: mockSelect },
  doesTableExist: mockDoesTableExist,
  TABLE_NAMES: {
    creatorProfiles: 'creator_profiles',
    stripeWebhookEvents: 'stripe_webhook_events',
  },
}));

vi.mock('@/lib/db/schema/auth', () => ({
  users: { id: 'users.id', email: 'users.email' },
}));

vi.mock('@/lib/db/schema/billing', () => ({
  stripeWebhookEvents: { id: 'id', type: 'type', createdAt: 'created_at' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    userId: 'user_id',
    isClaimed: 'is_claimed',
    createdAt: 'created_at',
  },
}));

vi.mock('@/lib/db/sql-helpers', () => ({
  sqlTimestamp: (date: Date) => date.toISOString(),
}));

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: mockGetCurrentUserEntitlements,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
  captureWarning: mockCaptureWarning,
}));

vi.mock('@/lib/admin/stripe-metrics', () => ({
  getAdminStripeOverviewMetrics: mockGetAdminStripeOverviewMetrics,
}));

vi.mock('@/lib/admin/mercury-metrics', () => ({
  getAdminMercuryMetrics: mockGetAdminMercuryMetrics,
}));

import { getAdminOverviewMetrics } from '@/lib/admin/overview';

function mockClaimedCountQuery(rows: Array<{ count: number }>) {
  const where = vi.fn().mockResolvedValue(rows);
  const leftJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ leftJoin });
  mockSelect.mockReturnValue({ from });
  return { where, leftJoin, from };
}

describe('getAdminOverviewMetrics claimed creator count (JOV-7362)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentUserEntitlements.mockResolvedValue({
      isAuthenticated: true,
      isAdmin: true,
    });
    mockGetAdminStripeOverviewMetrics.mockResolvedValue({
      mrrUsd: 100,
      mrrGrowth30dUsd: 10,
      isConfigured: true,
      isAvailable: true,
    });
    mockGetAdminMercuryMetrics.mockResolvedValue({
      balanceUsd: 1000,
      burnRateUsd: 200,
      isConfigured: true,
      isAvailable: true,
    });
  });

  it('counts claimed creators joined to users with the internal-account exclusion', async () => {
    mockDoesTableExist.mockResolvedValue(true);
    const { where, leftJoin, from } = mockClaimedCountQuery([{ count: 7 }]);

    const metrics = await getAdminOverviewMetrics();

    expect(metrics.claimedCreators).toBe(7);
    expect(from).toHaveBeenCalledTimes(1);
    // The claimed count joins users so dogfood/QA emails can be excluded.
    expect(leftJoin).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
    const predicate = where.mock.calls[0][0];
    expect(predicate).toBeDefined();
  });

  it('returns 0 claimed creators when the creator_profiles table is missing', async () => {
    mockDoesTableExist.mockResolvedValue(false);
    const { from } = mockClaimedCountQuery([{ count: 7 }]);

    const metrics = await getAdminOverviewMetrics();

    expect(metrics.claimedCreators).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });

  it('fails closed to 0 claimed creators when the query throws', async () => {
    mockDoesTableExist.mockResolvedValue(true);
    const where = vi.fn().mockRejectedValue(new Error('db down'));
    const leftJoin = vi.fn().mockReturnValue({ where });
    mockSelect.mockReturnValue({ from: vi.fn().mockReturnValue({ leftJoin }) });

    const metrics = await getAdminOverviewMetrics();

    expect(metrics.claimedCreators).toBe(0);
    expect(mockCaptureError).toHaveBeenCalledWith(
      'Error fetching claimed creator count',
      expect.any(Error)
    );
  });
});
