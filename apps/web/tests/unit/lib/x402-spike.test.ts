import { describe, expect, it } from 'vitest';
import {
  BASE_GAS_PER_CALL_USD,
  CDP_FREE_TIER_TX_PER_MONTH,
  CDP_METERED_FEE_PER_CALL_USD,
  clearsRailGate,
  MAX_RAIL_OVERHEAD,
  minViablePriceUsd,
  OFFRAMP_RATE_WORST_CASE,
  perCallRailFeeUsd,
  railOverheadRatio,
  TEMPLATE_PRICE_POINTS_USD,
} from '@/lib/x402-spike/unit-economics';

describe('x402 unit economics (spike #12750)', () => {
  describe('perCallRailFeeUsd', () => {
    it('is gas-only below the CDP free tier', () => {
      expect(perCallRailFeeUsd(CDP_FREE_TIER_TX_PER_MONTH)).toBeCloseTo(
        BASE_GAS_PER_CALL_USD,
        6
      );
    });

    it('adds CDP metering above the free tier', () => {
      expect(perCallRailFeeUsd(CDP_FREE_TIER_TX_PER_MONTH + 1)).toBeCloseTo(
        BASE_GAS_PER_CALL_USD + CDP_METERED_FEE_PER_CALL_USD,
        6
      );
    });
  });

  describe('railOverheadRatio', () => {
    it('is offRamp + fixedFee/price', () => {
      // metered volume, $0.01 price: 0.015 + 0.0011/0.01 = 0.125
      expect(railOverheadRatio(0.01, 10_000)).toBeCloseTo(0.125, 6);
    });

    it('treats a zero/negative price as infinite overhead', () => {
      expect(railOverheadRatio(0, 10_000)).toBe(Number.POSITIVE_INFINITY);
    });
  });

  describe('minViablePriceUsd', () => {
    it('metered regime floor is ~$0.0023 (well below a $0.01 tier)', () => {
      const floor = minViablePriceUsd(10_000);
      // 0.0011 / (0.5 - 0.015) = 0.0022680...
      expect(floor).toBeCloseTo(0.002268, 5);
      expect(floor).toBeLessThan(TEMPLATE_PRICE_POINTS_USD[0]);
    });

    it('free-tier floor is lower still (gas-dominated)', () => {
      expect(minViablePriceUsd(500)).toBeLessThan(minViablePriceUsd(10_000));
    });

    it('is infinite when off-ramp alone blows the budget', () => {
      expect(minViablePriceUsd(10_000, MAX_RAIL_OVERHEAD + 0.01)).toBe(
        Number.POSITIVE_INFINITY
      );
    });
  });

  describe('clearsRailGate — go/no-go per resource', () => {
    it('every Cloudflare template price point clears the gate at scale', () => {
      for (const price of TEMPLATE_PRICE_POINTS_USD) {
        expect(clearsRailGate(price, 100_000)).toBe(true);
      }
    });

    it('a sub-floor micro-price fails the gate (fees dominate)', () => {
      // $0.001 price at metered volume: 0.015 + 0.0011/0.001 = 1.115 overhead
      expect(clearsRailGate(0.001, 10_000)).toBe(false);
    });

    it('defaults the off-ramp arg to the worst case', () => {
      expect(OFFRAMP_RATE_WORST_CASE).toBe(0.015);
      // omitting offRampRate must behave identically to passing the worst case
      expect(railOverheadRatio(0.01, 10_000)).toBe(
        railOverheadRatio(0.01, 10_000, OFFRAMP_RATE_WORST_CASE)
      );
      expect(clearsRailGate(0.01, 10_000)).toBe(
        clearsRailGate(0.01, 10_000, OFFRAMP_RATE_WORST_CASE)
      );
    });
  });
});
