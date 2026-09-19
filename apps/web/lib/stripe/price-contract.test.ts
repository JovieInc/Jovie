import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./config', () => ({
  ACTIVE_PRICE_MAPPINGS: {
    price_visibility: { amount: 19900, currency: 'usd', interval: 'month' },
  },
}));

import { assertCheckoutPriceContract } from './price-contract';

const validPrice = {
  id: 'price_visibility',
  active: true,
  currency: 'usd',
  unit_amount: 19900,
  type: 'recurring',
  billing_scheme: 'per_unit',
  transform_quantity: null,
  recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' },
} as Stripe.Price;
const retrieve = vi.fn<(id: string) => Promise<Stripe.Price>>();
beforeEach(() => {
  retrieve.mockReset().mockResolvedValue(validPrice);
});
describe('billable Stripe offer validation', () => {
  it('accepts the matching live billable contract', async () => {
    await expect(
      assertCheckoutPriceContract('price_visibility', retrieve)
    ).resolves.toBeUndefined();
  });
  it.each([
    { unit_amount: 3900 },
    { currency: 'eur' },
    { active: false },
    { id: 'other' },
    { type: 'one_time' },
    { billing_scheme: 'tiered' },
    { transform_quantity: { divide_by: 10, round: 'up' } },
    { recurring: null },
    {
      recurring: {
        interval: 'year',
        interval_count: 1,
        usage_type: 'licensed',
      },
    },
    {
      recurring: {
        interval: 'month',
        interval_count: 2,
        usage_type: 'licensed',
      },
    },
    {
      recurring: {
        interval: 'month',
        interval_count: 1,
        usage_type: 'metered',
      },
    },
  ])('rejects mismatch %j', async mismatch => {
    retrieve.mockResolvedValue({ ...validPrice, ...mismatch } as Stripe.Price);
    await expect(
      assertCheckoutPriceContract('price_visibility', retrieve)
    ).rejects.toThrow('does not match');
  });
  it('rejects retired and unknown prices without a provider request', async () => {
    await expect(
      assertCheckoutPriceContract('price_old', retrieve)
    ).rejects.toThrow('not available');
    expect(retrieve).not.toHaveBeenCalled();
  });
  it('fails closed on Stripe failure', async () => {
    retrieve.mockRejectedValue(new Error('unavailable'));
    await expect(
      assertCheckoutPriceContract('price_visibility', retrieve)
    ).rejects.toThrow('unavailable');
  });
});
