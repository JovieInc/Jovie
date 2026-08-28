import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    default: {
      ...actual,
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
    },
  };
});

vi.mock('@/lib/admin/stripe-metrics', () => ({
  getAdminStripeOverviewMetrics: vi.fn(),
}));

vi.mock('@/lib/admin/mercury-metrics', () => ({
  getAdminMercuryMetrics: vi.fn(),
}));

function stripeAvailable() {
  return {
    mrrUsd: 5200,
    activeSubscribers: 10,
    mrrUsd30dAgo: 5000,
    mrrGrowth30dUsd: 200,
    isConfigured: true,
    isAvailable: true,
  };
}

function mercuryAvailable(
  overrides: Partial<Awaited<ReturnType<typeof getAdminMercuryMetrics>>> = {}
) {
  return {
    balanceUsd: 10_000,
    burnRateUsd: 2000,
    burnWindowDays: 30,
    burnRateAvailable: true,
    isConfigured: true,
    isAvailable: true,
    defaultStatus: 'alive' as const,
    ...overrides,
  };
}

describe('getOvieMacHudSnapshot', () => {
  beforeEach(() => {
    vi.mocked(getAdminStripeOverviewMetrics).mockResolvedValue(
      stripeAvailable()
    );
    vi.mocked(getAdminMercuryMetrics).mockResolvedValue(mercuryAvailable());
  });

  it('fails closed when Mercury burn telemetry is incomplete', async () => {
    vi.mocked(getAdminMercuryMetrics).mockResolvedValue(
      mercuryAvailable({
        burnRateUsd: 0,
        burnRateAvailable: false,
        defaultStatus: 'unknown',
        errorMessage: 'Mercury transaction window timed out.',
      })
    );

    const { getOvieMacHudSnapshot } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    const snapshot = await getOvieMacHudSnapshot(
      Date.parse('2026-08-22T00:00:00.000Z')
    );

    expect(snapshot.alive.available).toBe(false);
    expect(snapshot.alive.status).toBe('unknown');
    expect(snapshot.alive.weeklyBurnUsd).toBeNull();
    expect(snapshot.alive.cashUsd).toBeNull();
  });

  it('fails closed when a Mercury producer omits burn completeness', async () => {
    vi.mocked(getAdminMercuryMetrics).mockResolvedValue({
      balanceUsd: 10_000,
      burnRateUsd: 0,
      burnWindowDays: 30,
      isConfigured: true,
      isAvailable: true,
      defaultStatus: 'alive',
    } as never);

    const { getOvieMacHudSnapshot } = await import(
      '@/lib/hud/ovie-mac-hud.server'
    );
    const snapshot = await getOvieMacHudSnapshot(
      Date.parse('2026-08-22T00:00:00.000Z')
    );

    expect(snapshot.alive.available).toBe(false);
    expect(snapshot.alive.status).toBe('unknown');
  });
});
