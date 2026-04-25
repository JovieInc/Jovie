import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getUserByClerkId: vi.fn(),
  getAppFlagValue: vi.fn(),
  captureError: vi.fn().mockResolvedValue(undefined),
  captureWarning: vi.fn().mockResolvedValue(undefined),
  stripeAccountsRetrieve: vi.fn(),
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
  captureWarning: hoisted.captureWarning,
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    accounts: {
      retrieve: hoisted.stripeAccountsRetrieve,
    },
  },
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

  it('returns account email when Stripe retrieve succeeds', async () => {
    hoisted.stripeAccountsRetrieve.mockResolvedValue({
      email: 'payouts@example.com',
    });

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({
      connected: true,
      onboardingComplete: true,
      payoutsEnabled: true,
      email: 'payouts@example.com',
    });
    expect(hoisted.captureWarning).not.toHaveBeenCalled();
  });

  it('surfaces Stripe retrieve failure via captureWarning instead of silently swallowing it', async () => {
    const stripeErr = new Error('No such account: acct_abc');
    hoisted.stripeAccountsRetrieve.mockRejectedValue(stripeErr);

    const res = await GET();
    const body = await res.json();

    // Still returns 200 with cached DB flags and null email — user-facing
    // behaviour is unchanged.
    expect(res.status).toBe(200);
    expect(body).toEqual({
      connected: true,
      onboardingComplete: true,
      payoutsEnabled: true,
      email: null,
    });

    // The critical assertion: the Stripe error must be reported, not swallowed.
    expect(hoisted.captureWarning).toHaveBeenCalledTimes(1);
    const [message, err, context] = hoisted.captureWarning.mock.calls[0];
    expect(message).toBe('Stripe Connect account retrieve failed');
    expect(err).toBe(stripeErr);
    expect(context).toMatchObject({
      clerkUserId: 'clerk_user_123',
      stripeAccountId: 'acct_abc',
      route: '/api/stripe-connect/status',
    });
  });
});
