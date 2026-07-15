import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockProcessTipCompleted = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    audienceUpserted: true,
    emailSent: true,
    errors: [],
  })
);
const mockDbInsert = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());
const mockDbUpdate = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: {
    STRIPE_WEBHOOK_SECRET_TIPS: 'whsec_tips',
  },
}));

vi.mock('@/lib/db', () => {
  const chainable = {
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 'tip-123' }]),
    set: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ id: 'profile-123' }]),
  };
  return {
    db: {
      insert: mockDbInsert.mockReturnValue(chainable),
      select: mockDbSelect.mockReturnValue(chainable),
      update: mockDbUpdate.mockReturnValue(chainable),
    },
  };
});

vi.mock('@/lib/db/schema/analytics', () => ({
  tips: { paymentIntentId: 'payment_intent_id' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { usernameNormalized: 'username_normalized', id: 'id' },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
}));

vi.mock('@/lib/services/tips/process-tip-completed', () => ({
  processTipCompleted: mockProcessTipCompleted,
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: mockLoggerWarn,
  },
}));

function makeRequest(body = '{}') {
  return new Request('https://example.com/api/webhooks/stripe-tips', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': 'sig_test' },
  }) as never;
}

describe('POST /api/webhooks/stripe-tips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockCaptureCriticalError.mockResolvedValue(undefined);
  });

  it('returns 400 when the Stripe signature header is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
    const response = await POST(
      new Request('https://example.com/api/webhooks/stripe-tips', {
        method: 'POST',
        body: '{}',
      }) as never
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'No signature',
    });
    expect(mockCaptureCriticalError).not.toHaveBeenCalled();
  });

  it('returns 400 when Stripe rejects the tip webhook signature', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid signature',
    });
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockProcessTipCompleted).not.toHaveBeenCalled();
  });

  it('calls processTipCompleted on successful checkout with tipper email', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { handle: 'testartist', profile_id: 'profile-123' },
          payment_intent: 'pi_test',
          amount_total: 500,
          customer_details: { email: 'fan@example.com', name: 'Test Fan' },
          customer_email: null,
          id: 'cs_test',
        },
      },
    } as never);

    const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockProcessTipCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile-123',
        email: 'fan@example.com',
        name: 'Test Fan',
        amountCents: 500,
        source: 'tip',
      })
    );
  });

  it('resolves creator profile by handle when profile_id metadata is absent', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { handle: 'TestArtist' },
          payment_intent: { id: 'pi_from_object' },
          amount_total: 700,
          customer_details: { email: 'fan@example.com', name: null },
          customer_email: null,
          id: 'cs_handle',
        },
      },
    } as never);

    const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockDbSelect).toHaveBeenCalled();
    expect(mockProcessTipCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile-123',
        email: 'fan@example.com',
        amountCents: 700,
        metadata: expect.objectContaining({
          paymentIntentId: 'pi_from_object',
          checkoutSessionId: 'cs_handle',
        }),
      })
    );
  });

  it('acknowledges a resolved handle with no matching creator profile and records critical context', async () => {
    // Override the shared db mock's limit() so the by-handle lookup resolves
    // empty (profile not found), distinct from the shared beforeEach default
    // that always finds 'profile-123'. This exercises the branch at
    // route.ts:144-156 (`if (!creatorProfileId)`), which was previously
    // unreachable in this suite.
    const chainable = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockDbSelect.mockReturnValue(chainable);

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { handle: 'ghostartist' },
          payment_intent: 'pi_no_profile',
          amount_total: 900,
          customer_details: { email: 'fan@example.com', name: 'Test Fan' },
          customer_email: null,
          id: 'cs_no_profile',
        },
      },
    } as never);

    const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockDbSelect).toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockProcessTipCompleted).not.toHaveBeenCalled();
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Tip checkout completed but no creator profile found',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/webhooks/stripe-tips',
        handle: 'ghostartist',
        session_id: 'cs_no_profile',
        amount: 900,
      })
    );
  });

  it('acknowledges unattributable checkout sessions and records critical context', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: {},
          payment_intent: 'pi_missing_creator',
          amount_total: 500,
          customer_details: { email: 'fan@example.com', name: 'Test Fan' },
          customer_email: null,
          id: 'cs_missing_creator',
        },
      },
    } as never);

    const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockProcessTipCompleted).not.toHaveBeenCalled();
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Tip checkout completed without handle or profile_id metadata',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/webhooks/stripe-tips',
        session_id: 'cs_missing_creator',
        amount: 500,
        customer_email_domain: 'example.com',
      })
    );
  });

  it('skips processTipCompleted when tipper email is null', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { handle: 'testartist', profile_id: 'profile-123' },
          payment_intent: 'pi_test',
          amount_total: 500,
          customer_details: { email: null, name: null },
          customer_email: null,
          id: 'cs_test',
        },
      },
    } as never);

    const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockProcessTipCompleted).not.toHaveBeenCalled();
  });

  it('catches processTipCompleted errors without returning 500', async () => {
    mockProcessTipCompleted.mockRejectedValueOnce(
      new Error('DB connection timeout')
    );

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { handle: 'testartist', profile_id: 'profile-123' },
          payment_intent: 'pi_test',
          amount_total: 500,
          customer_details: { email: 'fan@example.com', name: 'Test Fan' },
          customer_email: null,
          id: 'cs_test',
        },
      },
    } as never);

    const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
    const response = await POST(makeRequest());

    // Should still return 200, not 500
    expect(response.status).toBe(200);
  });

  it('skips processTipCompleted on duplicate tip (onConflictDoNothing returns null)', async () => {
    // Override the insert mock to return empty (duplicate)
    const chainable = {
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([]),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ id: 'profile-123' }]),
    };
    mockDbInsert.mockReturnValue(chainable);

    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { handle: 'testartist', profile_id: 'profile-123' },
          payment_intent: 'pi_test',
          amount_total: 500,
          customer_details: { email: 'fan@example.com', name: 'Test Fan' },
          customer_email: null,
          id: 'cs_test',
        },
      },
    } as never);

    const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    // Duplicate tip should NOT call processTipCompleted
    expect(mockProcessTipCompleted).not.toHaveBeenCalled();
  });

  it('marks matching tips refunded when Stripe sends charge.refunded', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_123',
          payment_intent: 'pi_refunded',
        },
      },
    } as never);

    const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockDbUpdate).toHaveBeenCalled();
    const updateChain = mockDbUpdate.mock.results[0]?.value;
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'refunded',
        updatedAt: expect.any(Date),
      })
    );
  });

  it('does not mutate tips when a refunded charge lacks a payment intent', async () => {
    const { stripe } = await import('@/lib/stripe/client');
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_missing_pi',
          payment_intent: null,
        },
      },
    } as never);

    const { POST } = await import('@/app/api/webhooks/stripe-tips/route');
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(mockDbUpdate).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Charge refunded but no payment_intent ID',
      { charge_id: 'ch_missing_pi' }
    );
  });
});
