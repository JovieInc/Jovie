import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  flag: vi.fn(),
  rateLimit: vi.fn(),
  retrieve: vi.fn(),
  create: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    displayName: 'displayName',
    username: 'username',
    isPublic: 'isPublic',
    stripeAccountId: 'stripeAccountId',
    stripePayoutsEnabled: 'stripePayoutsEnabled',
  },
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => mocks.select() }),
      }),
    }),
  },
}));
vi.mock('@/lib/flags/server', () => ({ getAppFlagValue: mocks.flag }));
vi.mock('@/lib/rate-limit', () => ({
  getClientIP: () => '127.0.0.1',
  tipCheckoutLimiter: { limit: mocks.rateLimit },
  createRateLimitHeaders: () => ({}),
}));
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    accounts: { retrieve: mocks.retrieve },
    checkout: { sessions: { create: mocks.create } },
  },
}));
vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_PROFILE_URL: 'https://jov.ie' },
}));
vi.mock('@/lib/env-server', () => ({
  env: { TIP_PLATFORM_FEE_PERCENT: undefined },
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { GET, POST } = await import('./route');
const profileId = '123e4567-e89b-12d3-a456-426614174000';
const publicProfile = {
  id: profileId,
  displayName: 'Artist',
  username: 'artist',
  isPublic: true,
  stripeAccountId: 'acct_123',
  stripePayoutsEnabled: true,
};

function request(method: 'GET' | 'POST', body?: unknown) {
  return new NextRequest(
    `https://jov.ie/api/tips/create-checkout?profileId=${profileId}`,
    method === 'POST' ? { method, body: JSON.stringify(body) } : { method }
  );
}

describe('/api/tips/create-checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockResolvedValue([publicProfile]);
    mocks.flag.mockResolvedValue(true);
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.retrieve.mockResolvedValue({
      charges_enabled: true,
      payouts_enabled: true,
      requirements: { currently_due: [] },
    });
    mocks.create.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
    });
  });

  it('shows Stripe only for a public connected recipient with payouts enabled', async () => {
    expect(await (await GET(request('GET'))).json()).toEqual({
      available: true,
      profileId,
    });
    mocks.flag.mockResolvedValue(false);
    expect(await (await GET(request('GET'))).json()).toEqual({
      available: false,
    });
    mocks.flag.mockResolvedValue(true);
    mocks.select.mockResolvedValue([
      { ...publicProfile, stripePayoutsEnabled: false },
    ]);
    expect(await (await GET(request('GET'))).json()).toEqual({
      available: false,
    });
  });

  it('resolves an eligible public artist by handle for the mobile Pay drawer', async () => {
    const response = await GET(
      new NextRequest('https://jov.ie/api/tips/create-checkout?handle=artist')
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true, profileId });
    expect(response.headers.get('Cache-Control')).toContain('no-store');
  });

  it('refuses checkout when the creator cannot receive the payment', async () => {
    mocks.select.mockResolvedValue([
      { ...publicProfile, stripeAccountId: null },
    ]);
    const response = await POST(
      request('POST', {
        profileId,
        handle: 'artist',
        amountCents: 1000,
      })
    );
    expect(response.status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('refuses a mismatched handle before creating a session', async () => {
    const response = await POST(
      request('POST', {
        profileId,
        handle: 'different-artist',
        amountCents: 1000,
      })
    );
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('refuses checkout if Stripe reports the account is no longer ready', async () => {
    mocks.retrieve.mockResolvedValue({
      charges_enabled: false,
      payouts_enabled: true,
      requirements: { currently_due: [] },
    });
    const response = await POST(
      request('POST', {
        profileId,
        handle: 'artist',
        amountCents: 1000,
      })
    );
    expect(response.status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('routes the tip to the verified creator and retains the configured fee', async () => {
    const response = await POST(
      request('POST', {
        profileId,
        handle: 'artist',
        amountCents: 1000,
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      sessionId: 'cs_test_123',
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent_data: expect.objectContaining({
          transfer_data: { destination: 'acct_123' },
          application_fee_amount: 30,
        }),
      })
    );
  });
});
