import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getUserByClerkId: vi.fn(),
  getAppFlagValue: vi.fn(),
  captureError: vi.fn().mockResolvedValue(undefined),
  getStripeConnectReadiness: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: hoisted.requireAuth,
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByClerkId: hoisted.getUserByClerkId,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: hoisted.getAppFlagValue,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: hoisted.captureError,
}));

vi.mock('@/lib/stripe/connect-readiness', () => ({
  getStripeConnectReadiness: hoisted.getStripeConnectReadiness,
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    userId: 'user_id',
    stripeAccountId: 'stripe_account_id',
    stripeOnboardingComplete: 'stripe_onboarding_complete',
    stripePayoutsEnabled: 'stripe_payouts_enabled',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => hoisted.dbSelect(),
        }),
      }),
    }),
  },
}));

const { GET } = await import('./route');

describe('GET /api/stripe-connect/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.requireAuth.mockResolvedValue({ userId: 'clerk_user_123' });
    hoisted.getAppFlagValue.mockResolvedValue(true);
    hoisted.getUserByClerkId.mockResolvedValue({
      id: 'user_123',
      email: 'a@example.com',
    });
    hoisted.dbSelect.mockResolvedValue([
      {
        id: 'profile_123',
        stripeAccountId: 'acct_abc',
        stripeOnboardingComplete: true,
        stripePayoutsEnabled: true,
      },
    ]);
  });

  it('returns cached readiness from getStripeConnectReadiness', async () => {
    hoisted.getStripeConnectReadiness.mockResolvedValue({
      stripeAccountId: 'acct_abc',
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
      onboardingComplete: true,
      payoutEmail: 'payouts@example.com',
      lastSyncedAt: new Date(),
      source: 'cache',
    });

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({
      connected: true,
      onboardingComplete: true,
      payoutsEnabled: true,
      email: 'payouts@example.com',
    });
    expect(hoisted.getStripeConnectReadiness).toHaveBeenCalledWith('acct_abc');
  });

  it('falls back to DB-cached flags when readiness lookup returns null (no creator linked)', async () => {
    hoisted.getStripeConnectReadiness.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      connected: true,
      onboardingComplete: true,
      payoutsEnabled: true,
      email: null,
    });
  });

  it('returns disconnected status when no Stripe account is linked', async () => {
    hoisted.dbSelect.mockResolvedValue([
      {
        id: 'profile_123',
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        stripePayoutsEnabled: false,
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      connected: false,
      onboardingComplete: false,
      payoutsEnabled: false,
      email: null,
    });
    expect(hoisted.getStripeConnectReadiness).not.toHaveBeenCalled();
  });
});
