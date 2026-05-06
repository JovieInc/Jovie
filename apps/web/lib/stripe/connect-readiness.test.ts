import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dbSelect: vi.fn(),
  dbUpdate: vi.fn(),
  stripeAccountsRetrieve: vi.fn(),
  captureWarning: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: new Proxy(
    {},
    {
      get: (_, prop) => prop,
    }
  ),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    accounts: {
      retrieve: hoisted.stripeAccountsRetrieve,
    },
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: hoisted.captureWarning,
}));

const { getStripeConnectReadiness, STRIPE_CONNECT_CACHE_TTL_MS } = await import(
  './connect-readiness'
);

const FRESH_ROW = {
  id: 'profile_1',
  stripeAccountId: 'acct_1',
  stripeChargesEnabled: true,
  stripePayoutsEnabled: true,
  stripeDetailsSubmitted: true,
  stripeOnboardingComplete: true,
  stripePayoutEmail: 'payouts@example.com',
  stripeConnectLastSyncedAt: new Date(Date.now() - 60_000),
};
const STALE_ROW = {
  ...FRESH_ROW,
  stripeConnectLastSyncedAt: new Date(
    Date.now() - STRIPE_CONNECT_CACHE_TTL_MS - 60_000
  ),
};
const EMPTY_ROW = { ...FRESH_ROW, stripeConnectLastSyncedAt: null };

describe('getStripeConnectReadiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.dbUpdate.mockResolvedValue(undefined);
  });

  it('returns null when no profile is linked to the accountId', async () => {
    hoisted.dbSelect.mockResolvedValue([]);

    const result = await getStripeConnectReadiness('acct_x');

    expect(result).toBeNull();
    expect(hoisted.stripeAccountsRetrieve).not.toHaveBeenCalled();
  });

  it('returns cached readiness without calling Stripe when row is fresh', async () => {
    hoisted.dbSelect.mockResolvedValue([FRESH_ROW]);

    const result = await getStripeConnectReadiness('acct_1');

    expect(result?.source).toBe('cache');
    expect(result?.payoutsEnabled).toBe(true);
    expect(result?.payoutEmail).toBe('payouts@example.com');
    expect(hoisted.stripeAccountsRetrieve).not.toHaveBeenCalled();
    expect(hoisted.dbUpdate).not.toHaveBeenCalled();
  });

  it('falls back to Stripe + writes through when cache is empty (lastSyncedAt null)', async () => {
    hoisted.dbSelect.mockResolvedValue([EMPTY_ROW]);
    hoisted.stripeAccountsRetrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      email: 'live@example.com',
    });

    const result = await getStripeConnectReadiness('acct_1');

    expect(result?.source).toBe('stripe');
    expect(result?.payoutEmail).toBe('live@example.com');
    expect(hoisted.stripeAccountsRetrieve).toHaveBeenCalledWith('acct_1');
    expect(hoisted.dbUpdate).toHaveBeenCalledTimes(1);
  });

  it('falls back to Stripe when cache is older than TTL', async () => {
    hoisted.dbSelect.mockResolvedValue([STALE_ROW]);
    hoisted.stripeAccountsRetrieve.mockResolvedValue({
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      email: null,
    });

    const result = await getStripeConnectReadiness('acct_1');

    expect(result?.source).toBe('stripe');
    expect(result?.chargesEnabled).toBe(false);
    expect(result?.payoutsEnabled).toBe(false);
    expect(hoisted.dbUpdate).toHaveBeenCalledTimes(1);
  });

  it('forceRefresh=true bypasses freshness check and refetches from Stripe', async () => {
    hoisted.dbSelect.mockResolvedValue([FRESH_ROW]);
    hoisted.stripeAccountsRetrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      email: 'rotated@example.com',
    });

    const result = await getStripeConnectReadiness('acct_1', {
      forceRefresh: true,
    });

    expect(result?.source).toBe('stripe');
    expect(result?.payoutEmail).toBe('rotated@example.com');
    expect(hoisted.stripeAccountsRetrieve).toHaveBeenCalledWith('acct_1');
  });

  it('returns stale cache + emits captureWarning when Stripe fails on refresh', async () => {
    hoisted.dbSelect.mockResolvedValue([STALE_ROW]);
    const stripeErr = new Error('rate_limit');
    hoisted.stripeAccountsRetrieve.mockRejectedValue(stripeErr);

    const result = await getStripeConnectReadiness('acct_1');

    expect(result?.source).toBe('cache-stale-stripe-failed');
    expect(result?.payoutsEnabled).toBe(true); // pre-failure cached value
    expect(hoisted.captureWarning).toHaveBeenCalledTimes(1);
    expect(hoisted.dbUpdate).not.toHaveBeenCalled();
  });
});
