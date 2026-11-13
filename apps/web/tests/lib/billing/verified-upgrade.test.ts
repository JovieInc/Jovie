import { describe, expect, it } from 'vitest';
import {
  formatVerifiedPriceLabel,
  formatVerifiedUpgradeLabel,
  getPreferredVerifiedPrice,
} from '@/lib/billing/verified-upgrade';

describe('verified upgrade pricing helpers', () => {
  it('prefers monthly interval options when available', () => {
    const selected = getPreferredVerifiedPrice([
      {
        priceId: 'price_year',
        amount: 12000,
        currency: 'usd',
        interval: 'year',
        description: 'Pro annual',
      },
      {
        priceId: 'price_month',
        amount: 900,
        currency: 'usd',
        interval: 'month',
        description: 'Pro monthly',
      },
    ]);

    expect(selected?.priceId).toBe('price_month');
  });

  it('falls back to the first option when monthly is unavailable', () => {
    const selected = getPreferredVerifiedPrice([
      {
        priceId: 'price_year',
        amount: 12000,
        currency: 'usd',
        interval: 'year',
        description: 'Pro annual',
      },
    ]);

    expect(selected?.priceId).toBe('price_year');
  });

  it('formats currency labels and shows no price when unknown', () => {
    expect(
      formatVerifiedPriceLabel({
        priceId: 'price_month',
        amount: 900,
        currency: 'usd',
        interval: 'month',
        description: 'Pro monthly',
      })
    ).toBe('$9/mo');

    // No list-price fallback: an unknown price shows no price at all.
    expect(formatVerifiedPriceLabel(undefined)).toBeNull();
    expect(formatVerifiedUpgradeLabel(undefined)).toBe('Get Verified');
  });
});
