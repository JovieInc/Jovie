import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  ensure: vi.fn(),
  critical: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/auth/cached', () => ({ getCachedAuth: mocks.getCachedAuth }));
vi.mock('@/lib/billing/price-lock.server', () => ({
  ensurePriceLockForUser: mocks.ensure,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mocks.critical,
}));

import { GET } from './route';

const LOCK = {
  plan: 'pro',
  priceVersionId: 'pro-2026-10-20-m12',
  currency: 'usd',
  monthlyAmountCents: 1200,
  yearlyAmountCents: null,
  stripePriceIdMonthly: 'price_12',
  stripePriceIdYearly: null,
  source: 'signup',
  lockedAt: '2026-10-29T00:00:00.000Z',
};

beforeEach(() => vi.clearAllMocks());

describe('GET /api/billing/price-lock', () => {
  it('401s a signed-out visitor and never creates a lock', async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: null });
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });

  it("returns the person's locked price, uncached", async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user_1' });
    mocks.ensure.mockResolvedValue(LOCK);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.ensure).toHaveBeenCalledWith('user_1', 'first_view');
    const body = await response.json();
    expect(body.priceLock).toMatchObject({
      locked: true,
      priceVersionId: 'pro-2026-10-20-m12',
      month: { amountCents: 1200, priceId: 'price_12', interval: 'month' },
      year: null,
    });
  });

  it('fails with 500 (never a list price) when the lock cannot be loaded', async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user_1' });
    mocks.ensure.mockRejectedValue(new Error('db down'));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(mocks.critical).toHaveBeenCalledTimes(1);
  });
});
