import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  accountLinksCreateMock,
  accountsCreateMock,
  dbSelectLimitMock,
  dbUpdateSetMock,
  dbUpdateWhereMock,
  getAppFlagValueMock,
  getUserByClerkIdMock,
  requireAuthMock,
} = vi.hoisted(() => ({
  accountLinksCreateMock: vi.fn(),
  accountsCreateMock: vi.fn(),
  dbSelectLimitMock: vi.fn(),
  dbUpdateSetMock: vi.fn(),
  dbUpdateWhereMock: vi.fn(),
  getAppFlagValueMock: vi.fn(),
  getUserByClerkIdMock: vi.fn(),
  requireAuthMock: vi.fn(),
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: requireAuthMock,
}));

vi.mock('@/lib/db/queries/shared', () => ({
  getUserByClerkId: getUserByClerkIdMock,
}));

vi.mock('@/lib/flags/server', () => ({
  getAppFlagValue: getAppFlagValueMock,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    NEXT_PUBLIC_APP_URL: 'https://jov.ie',
  },
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    accountLinks: {
      create: accountLinksCreateMock,
    },
    accounts: {
      create: accountsCreateMock,
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
    displayName: 'display_name',
    updatedAt: 'updated_at',
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
          limit: dbSelectLimitMock,
        }),
      }),
    }),
    update: () => ({
      set: dbUpdateSetMock,
    }),
  },
}));

describe('Stripe Connect action routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ userId: 'clerk_user_123' });
    getAppFlagValueMock.mockResolvedValue(true);
    getUserByClerkIdMock.mockResolvedValue({
      id: 'user_123',
      email: 'artist@example.com',
    });
    dbSelectLimitMock.mockResolvedValue([
      {
        id: 'profile_123',
        displayName: 'Test Artist',
        stripeAccountId: 'acct_existing',
      },
    ]);
    dbUpdateSetMock.mockReturnValue({ where: dbUpdateWhereMock });
    dbUpdateWhereMock.mockResolvedValue(undefined);
    accountLinksCreateMock.mockResolvedValue({
      url: 'https://connect.stripe.test/onboard',
    });
    accountsCreateMock.mockResolvedValue({ id: 'acct_new' });
  });

  it('starts onboarding when Stripe Connect is enabled', async () => {
    const { POST } = await import('@/app/api/stripe-connect/onboard/route');
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: 'https://connect.stripe.test/onboard',
    });
    expect(getAppFlagValueMock).toHaveBeenCalledWith('STRIPE_CONNECT_ENABLED', {
      userId: 'clerk_user_123',
    });
    expect(accountLinksCreateMock).toHaveBeenCalledWith({
      account: 'acct_existing',
      refresh_url: 'https://jov.ie/api/stripe-connect/onboard',
      return_url: 'https://jov.ie/api/stripe-connect/return',
      type: 'account_onboarding',
    });
    expect(accountsCreateMock).not.toHaveBeenCalled();
  });

  it('keeps the Stripe Connect kill switch as an explicit blocker', async () => {
    getAppFlagValueMock.mockResolvedValueOnce(false);

    const { POST } = await import('@/app/api/stripe-connect/onboard/route');
    const response = await POST();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Stripe Connect is not enabled',
    });
    expect(accountLinksCreateMock).not.toHaveBeenCalled();
  });

  it('disconnects the creator profile without deleting the Stripe account', async () => {
    const { POST } = await import('@/app/api/stripe-connect/disconnect/route');
    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ disconnected: true });
    expect(dbUpdateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        stripePayoutsEnabled: false,
      })
    );
  });
});
