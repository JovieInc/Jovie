/**
 * Stand-in for `@/lib/billing/price-lock.server` in route unit tests: no lock
 * applies, so the requested (list) price passes through unchanged. Price lock
 * behavior itself is covered by checkout-price-lock.test.ts.
 */
export async function resolveCheckoutPriceForUser(
  _userId: string,
  priceId: string
) {
  return {
    decision: { kind: 'list' as const, priceId },
    lock: {
      plan: 'pro',
      priceVersionId: 'pro-2026-10-20-m12',
      currency: 'usd',
      monthlyAmountCents: 1200,
      yearlyAmountCents: null,
      stripePriceIdMonthly: 'price_123',
      stripePriceIdYearly: null,
      source: 'signup',
      lockedAt: '2026-10-29T00:00:00.000Z',
    },
  };
}
