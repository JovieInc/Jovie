import { describe, expect, it } from 'vitest';
import {
  buildMerchPricingSnapshot,
  estimateStripeFeeCents,
  formatMerchMoney,
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

  it('never creates negative payout estimates when costs exceed retail', () => {
    const pricing = buildMerchPricingSnapshot({
      retailPriceCents: 2000,
      printfulProductCostCents: 2500,
      shippingCostCents: 800,
      refundReserveCents: 300,
    });

    expect(pricing.artistPayoutPerUnitEstimateCents).toBe(0);
    expect(pricing.jovieMarginPerUnitEstimateCents).toBe(0);
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
