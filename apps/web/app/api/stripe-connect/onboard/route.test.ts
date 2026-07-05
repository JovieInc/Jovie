import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getUserByClerkId: vi.fn(),
  getAppFlagValue: vi.fn(),
  captureError: vi.fn().mockResolvedValue(undefined),
  captureWarning: vi.fn().mockResolvedValue(undefined),
  stripeAccountsCreate: vi.fn(),
  stripeAccountLinksCreate: vi.fn(),
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
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
  sanitizeErrorResponse: (
    userMessage: string,
    _debugInfo?: unknown,
    options?: { code?: string }
  ) => ({
    error: userMessage,
    ...(options?.code ? { code: options.code } : {}),
  }),
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: 'https://jov.ie' },
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    accounts: {
      create: hoisted.stripeAccountsCreate,
    },
    accountLinks: {
      create: hoisted.stripeAccountLinksCreate,
    },
  },
}));

vi.mock('@/lib/stripe/connect-errors', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/stripe/connect-errors')>();
  return {
    ...actual,
    isStripeConnectPlatformProfileBlocked: vi.fn(() => false),
  };
});

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    userId: 'user_id',
    stripeAccountId: 'stripe_account_id',
    displayName: 'display_name',
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
    update: () => ({
      set: () => ({
        where: () => hoisted.dbUpdate(),
      }),
    }),
  },
}));

const connectErrors = await import('@/lib/stripe/connect-errors');
const { POST } = await import('./route');

const PROFILE = {
  id: 'profile_123',
  stripeAccountId: null,
  displayName: 'Test Artist',
};

describe('POST /api/stripe-connect/onboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectErrors.clearStripeConnectPlatformProfileBlock();
    vi.mocked(
      connectErrors.isStripeConnectPlatformProfileBlocked
    ).mockReturnValue(false);
    hoisted.requireAuth.mockResolvedValue({ userId: 'clerk_user_123' });
    hoisted.getAppFlagValue.mockResolvedValue(true);
    hoisted.getUserByClerkId.mockResolvedValue({
      id: 'user_123',
      email: 'artist@example.com',
    });
    hoisted.dbSelect.mockResolvedValue([PROFILE]);
    hoisted.dbUpdate.mockResolvedValue(undefined);
    hoisted.stripeAccountLinksCreate.mockResolvedValue({
      url: 'https://connect.stripe.com/setup',
    });
  });

  it('returns 503 without calling Stripe when the platform guard is active', async () => {
    vi.mocked(
      connectErrors.isStripeConnectPlatformProfileBlocked
    ).mockReturnValue(true);

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(body).toEqual({
      error: 'Payout setup is temporarily unavailable. Please try again later.',
      code: 'platform_profile_incomplete',
    });
    expect(hoisted.captureWarning).toHaveBeenCalledTimes(1);
    expect(hoisted.captureError).not.toHaveBeenCalled();
    expect(hoisted.stripeAccountsCreate).not.toHaveBeenCalled();
    expect(hoisted.stripeAccountLinksCreate).not.toHaveBeenCalled();
  });

  it('returns 503 with a safe message when Stripe platform profile is incomplete', async () => {
    hoisted.stripeAccountsCreate.mockRejectedValue({
      type: 'StripeInvalidRequestError',
      message:
        'You must complete your platform profile to use Connect and create live connected accounts. Visit your dashboard at https://dashboard.stripe.com/connect/accounts/overview to answer the questionnaire.',
    });

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(body).toEqual({
      error: 'Payout setup is temporarily unavailable. Please try again later.',
      code: 'platform_profile_incomplete',
    });
    expect(hoisted.captureWarning).toHaveBeenCalledTimes(1);
    expect(hoisted.captureError).not.toHaveBeenCalled();
    expect(hoisted.stripeAccountLinksCreate).not.toHaveBeenCalled();
  });

  it('returns onboarding URL when account creation succeeds', async () => {
    hoisted.stripeAccountsCreate.mockResolvedValue({ id: 'acct_new' });

    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ url: 'https://connect.stripe.com/setup' });
    expect(hoisted.stripeAccountsCreate).toHaveBeenCalledTimes(1);
    expect(hoisted.stripeAccountLinksCreate).toHaveBeenCalledWith({
      account: 'acct_new',
      refresh_url: 'https://jov.ie/api/stripe-connect/onboard',
      return_url: 'https://jov.ie/api/stripe-connect/return',
      type: 'account_onboarding',
    });
  });
});
