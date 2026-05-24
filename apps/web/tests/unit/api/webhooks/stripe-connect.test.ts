import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockConstructEvent = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions })),
  eq: vi.fn((...conditions: unknown[]) => ({ type: 'eq', conditions })),
  isNull: vi.fn((column: unknown) => ({ type: 'isNull', column })),
  lt: vi.fn((...conditions: unknown[]) => ({ type: 'lt', conditions })),
  or: vi.fn((...conditions: unknown[]) => ({ type: 'or', conditions })),
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect',
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: mockDbUpdate,
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {
    id: 'id',
    stripeAccountId: 'stripe_account_id',
    stripeChargesEnabled: 'stripe_charges_enabled',
    stripePayoutsEnabled: 'stripe_payouts_enabled',
    stripeDetailsSubmitted: 'stripe_details_submitted',
    stripeOnboardingComplete: 'stripe_onboarding_complete',
    stripePayoutEmail: 'stripe_payout_email',
    stripeConnectLastSyncedAt: 'stripe_connect_last_synced_at',
    stripeConnectLastEventAt: 'stripe_connect_last_event_at',
    updatedAt: 'updated_at',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
  },
}));

function mockUpdateReturning(
  rows: Array<{ id: string }> = [{ id: 'profile_1' }]
) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDbUpdate.mockReturnValue(chain);
  return chain;
}

function makeRequest() {
  return new Request('https://example.com/api/webhooks/stripe-connect', {
    method: 'POST',
    headers: { 'stripe-signature': 'sig_connect' },
    body: '{}',
  }) as never;
}

describe('POST /api/webhooks/stripe-connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockUpdateReturning();
  });

  it('returns 400 when the Stripe signature header is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe-connect/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/stripe-connect', {
        method: 'POST',
        body: '{}',
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Missing signature',
    });
    expect(mockConstructEvent).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when the Stripe signature is invalid', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const { POST } = await import('@/app/api/webhooks/stripe-connect/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/stripe-connect', {
        method: 'POST',
        headers: { 'stripe-signature': 'bad-signature' },
        body: '{}',
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid signature',
    });
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Invalid Stripe Connect webhook signature',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/webhooks/stripe-connect',
      })
    );
  });

  it('syncs newer account.updated flags to the linked creator profile', async () => {
    const updateChain = mockUpdateReturning([{ id: 'profile_123' }]);
    mockConstructEvent.mockReturnValue({
      id: 'evt_connect_update',
      type: 'account.updated',
      created: 1_770_000_000,
      data: {
        object: {
          id: 'acct_123',
          charges_enabled: true,
          payouts_enabled: false,
          details_submitted: true,
          email: 'payout@example.com',
        },
      },
    });

    const { POST } = await import('@/app/api/webhooks/stripe-connect/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeChargesEnabled: true,
        stripePayoutsEnabled: false,
        stripeDetailsSubmitted: true,
        stripeOnboardingComplete: true,
        stripePayoutEmail: 'payout@example.com',
        stripeConnectLastEventAt: new Date(1_770_000_000 * 1000),
        updatedAt: expect.any(Date),
      })
    );
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it('logs a no-op when account.updated is stale or no profile is linked', async () => {
    mockUpdateReturning([]);
    mockConstructEvent.mockReturnValue({
      id: 'evt_connect_stale',
      type: 'account.updated',
      created: 1_770_000_000,
      data: {
        object: {
          id: 'acct_stale',
          charges_enabled: false,
          payouts_enabled: false,
          details_submitted: false,
          email: null,
        },
      },
    });

    const { POST } = await import('@/app/api/webhooks/stripe-connect/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[Stripe Connect Webhook] No update for account acct_stale (no profile or stale event)',
      expect.objectContaining({
        eventId: 'evt_connect_stale',
        eventCreatedAt: new Date(1_770_000_000 * 1000).toISOString(),
      })
    );
  });

  it('clears connected-account state when Stripe deauthorizes the account', async () => {
    const updateChain = mockUpdateReturning();
    mockConstructEvent.mockReturnValue({
      id: 'evt_deauth',
      type: 'account.application.deauthorized',
      account: 'acct_123',
      created: 1_770_000_100,
      data: { object: {} },
    });

    const { POST } = await import('@/app/api/webhooks/stripe-connect/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeAccountId: null,
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
        stripeDetailsSubmitted: false,
        stripeOnboardingComplete: false,
        stripePayoutEmail: null,
        stripeConnectLastEventAt: new Date(1_770_000_100 * 1000),
      })
    );
  });

  it('acknowledges deauthorization events without account ids without mutating profiles', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_deauth_missing',
      type: 'account.application.deauthorized',
      created: 1_770_000_100,
      data: { object: {} },
    });

    const { POST } = await import('@/app/api/webhooks/stripe-connect/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[Stripe Connect Webhook] account.application.deauthorized missing event.account',
      { eventId: 'evt_deauth_missing' }
    );
  });

  it('returns 405 for GET requests', async () => {
    const { GET } = await import('@/app/api/webhooks/stripe-connect/route');
    const response = await GET();

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({ error: 'Method not allowed' });
  });
});
