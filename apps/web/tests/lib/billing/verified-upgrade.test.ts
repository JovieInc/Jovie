import { describe, expect, it } from 'vitest';
import {
  FALLBACK_VERIFIED_PRICE_LABEL,
  formatVerifiedPriceLabel,
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

  it('formats currency labels and falls back when missing', () => {
    expect(
      formatVerifiedPriceLabel({
        priceId: 'price_month',
        amount: 900,
        currency: 'usd',
        interval: 'month',
        description: 'Pro monthly',
      })
    ).toBe('$9/mo');

    expect(formatVerifiedPriceLabel(undefined)).toBe(
      FALLBACK_VERIFIED_PRICE_LABEL
    );
  });
});
