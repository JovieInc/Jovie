import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ retrieve: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/db/cache', () => ({
  cacheQuery: vi.fn(),
  invalidateCache: vi.fn(),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/env-server', () => ({
  env: { STRIPE_SECRET_KEY: 'sk_test_mock' },
}));
vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_PROFILE_URL: 'https://example.test' },
}));
vi.mock('./config', () => ({
  ACTIVE_PRICE_MAPPINGS: {
    price_visibility: { amount: 19900, currency: 'usd', interval: 'month' },
  },
}));
vi.mock('stripe', () => ({
  default: class {
    prices = { retrieve: mocks.retrieve };
    checkout = { sessions: { create: mocks.create } };
  },
}));

import { createCheckoutSession } from './client';

const args = {
  customerId: 'cus_test',
  priceId: 'price_visibility',
  userId: 'user_test',
  plan: 'pro',
  successUrl: 'https://example.test/success',
  cancelUrl: 'https://example.test/cancel',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.retrieve.mockResolvedValue({
    id: 'price_visibility',
    active: true,
    currency: 'usd',
    unit_amount: 19900,
    type: 'recurring',
    billing_scheme: 'per_unit',
    transform_quantity: null,
    recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
  });
  mocks.create.mockResolvedValue({ id: 'cs_test' });
});
describe('checkout validates billable price before session creation', () => {
  it('creates the exact matched single-price subscription', async () => {
    await expect(createCheckoutSession(args)).resolves.toEqual({
      id: 'cs_test',
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: 'price_visibility', quantity: 1 }],
        mode: 'subscription',
      }),
      undefined
    );
    expect(mocks.retrieve.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.create.mock.invocationCallOrder[0]
    );
  });
  it('never creates a session for an old $39 price', async () => {
    mocks.retrieve.mockResolvedValue({
      id: 'price_visibility',
      active: true,
      currency: 'usd',
      unit_amount: 3900,
    });
    await expect(createCheckoutSession(args)).rejects.toThrow('does not match');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('never creates a session when Stripe price retrieval fails', async () => {
    mocks.retrieve.mockRejectedValue(new Error('Stripe unavailable'));
    await expect(createCheckoutSession(args)).rejects.toThrow(
      'Stripe unavailable'
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
