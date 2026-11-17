import { buildPriceLockView } from '@/lib/billing/price-lock-view';
import type { PriceLockSnapshot } from '@/lib/billing/price-versions';

export function priceLockViewFixture(
  overrides: Partial<PriceLockSnapshot> = {}
) {
  return buildPriceLockView({
    plan: 'pro',
    priceVersionId: 'pro-2026-10-20-m12',
    currency: 'usd',
    monthlyAmountCents: 1200,
    yearlyAmountCents: null,
    stripePriceIdMonthly: 'price_12',
    stripePriceIdYearly: null,
    source: 'signup',
    lockedAt: '2026-10-29T00:00:00.000Z',
    ...overrides,
  });
}
