import { describe, expect, it } from 'vitest';
import {
  assertSellableMerchEconomics,
  buildMerchPricingSnapshot,
  estimateStripeFeeCents,
  formatMerchMoney,
  getMerchSellability,
  MERCH_MIN_JOVIE_MARGIN_CENTS,
  MERCH_MIN_JOVIE_MARGIN_RATE_BPS,
} from './pricing';

describe('merch pricing', () => {
  it('estimates Stripe fixed plus percentage fees in cents', () => {
    expect(estimateStripeFeeCents(5025)).toBe(176);
  });

  it('defaults artist payout to 50% of estimated net profit', () => {
    const pricing = buildMerchPricingSnapshot();

    expect(pricing.currency).toBe('USD');
    expect(pricing.retailPriceCents).toBe(4500);
    expect(pricing.estimatedPrintfulProductCostCents).toBe(1750);
    expect(pricing.estimatedShippingCostCents).toBe(525);
    expect(pricing.refundReserveCents).toBe(200);
    expect(pricing.stripeFeeEstimateCents).toBe(176);
    expect(pricing.artistRoyaltyRateBps).toBe(5000);
    expect(pricing.artistPayoutPerUnitEstimateCents).toBe(1187);
    expect(pricing.jovieMarginPerUnitEstimateCents).toBe(1187);
  });

  it('marks below-cost pricing as unsellable instead of trusting zeroed payouts', () => {
    const pricing = buildMerchPricingSnapshot({
      retailPriceCents: 2000,
      printfulProductCostCents: 2500,
      shippingCostCents: 800,
      refundReserveCents: 300,
    });

    expect(pricing.artistPayoutPerUnitEstimateCents).toBe(0);
    expect(pricing.jovieMarginPerUnitEstimateCents).toBe(0);
    expect(getMerchSellability(pricing)).toEqual({
      sellable: false,
      reasons: expect.arrayContaining([
        'Retail price must be greater than Printful product cost.',
        'Jovie margin must be at least $5.00 per unit.',
      ]),
    });
    expect(() => assertSellableMerchEconomics(pricing)).toThrow(
      'Merch item is not sellable'
    );
  });

  it('blocks live sale below the Jovie margin floor', () => {
    const pricing = buildMerchPricingSnapshot({
      retailPriceCents: 2900,
      printfulProductCostCents: 2100,
      shippingCostCents: 525,
      refundReserveCents: 200,
    });

    const minimumRateFloor = Math.ceil(
      (pricing.retailPriceCents * MERCH_MIN_JOVIE_MARGIN_RATE_BPS) / 10_000
    );

    expect(minimumRateFloor).toBeLessThan(MERCH_MIN_JOVIE_MARGIN_CENTS);
    expect(pricing.jovieMarginPerUnitEstimateCents).toBeLessThan(
      MERCH_MIN_JOVIE_MARGIN_CENTS
    );
    expect(getMerchSellability(pricing).sellable).toBe(false);
  });

  it('requires known fresh Printful cost before live sale', () => {
    const pricing = buildMerchPricingSnapshot({
      retailPriceCents: 4500,
      printfulProductCostCents: 0,
    });

    const result = getMerchSellability(pricing, {
      requireKnownPrintfulCost: true,
      printfulCostUpdatedAt: null,
    });

    expect(result.sellable).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'Printful product cost must be known before sale.',
        'Printful product cost must come from a fresh provider snapshot.',
      ])
    );
  });

  it('accepts pricing that clears cost, artist payout, and Jovie margin floors', () => {
    const pricing = buildMerchPricingSnapshot();

    expect(getMerchSellability(pricing)).toEqual({
      sellable: true,
      reasons: [],
    });
    expect(() => assertSellableMerchEconomics(pricing)).not.toThrow();
  });

  it('rejects invalid pricing inputs before calculating payouts', () => {
    expect(() => buildMerchPricingSnapshot({ retailPriceCents: -1 })).toThrow(
      'retailPriceCents must be a non-negative integer'
    );
    expect(() =>
      buildMerchPricingSnapshot({ artistRoyaltyRateBps: 10_001 })
    ).toThrow('artistRoyaltyRateBps must be between 0 and 10000');
    expect(() =>
      buildMerchPricingSnapshot({ shippingCostCents: 12.5 })
    ).toThrow('shippingCostCents must be a non-negative integer');
  });

  it('formats merch money in USD', () => {
    expect(formatMerchMoney(4500)).toBe('$45.00');
  });
});
