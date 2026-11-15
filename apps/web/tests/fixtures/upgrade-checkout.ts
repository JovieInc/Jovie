import { vi } from 'vitest';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';

/** Canonical-price checkout doubles; no network or live payments. */
export function createUpgradeCheckoutFixture() {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    track: vi.fn(),
    push: vi.fn(),
    pricing: {
      data: {
        options: [
          {
            priceId: 'price_presence',
            amount: toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd),
            currency: ARTIST_VISIBILITY_OFFER.pro.currency,
            interval: 'month',
            description: ARTIST_VISIBILITY_OFFER.pro.displayName,
          },
        ],
      },
      isPending: false,
      error: null,
    },
  };
}
