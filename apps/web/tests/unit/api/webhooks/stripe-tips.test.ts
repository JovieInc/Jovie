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
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ id: 'profile-123' }]),
  };
  return {
    db: {
      insert: mockDbInsert.mockReturnValue(chainable),
      select: mockDbSelect.mockReturnValue(chainable),
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
    warn: vi.fn(),
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
});
