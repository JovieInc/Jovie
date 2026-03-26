import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCaptureCriticalError = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: {
    STRIPE_WEBHOOK_SECRET_TIPS: 'whsec_tips',
  },
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  tips: {},
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
});
