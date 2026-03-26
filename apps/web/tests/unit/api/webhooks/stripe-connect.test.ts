import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureCriticalError = vi.hoisted(() => vi.fn());
const mockConstructEvent = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: {
    STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect',
  },
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: {},
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
    warn: vi.fn(),
  },
}));

describe('POST /api/webhooks/stripe-connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
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
});
