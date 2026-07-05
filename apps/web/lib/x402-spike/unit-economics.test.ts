import { describe, expect, it } from 'vitest';
import {
  estimateX402RailCostUsd,
  evaluateX402UnitEconomics,
  minimumViableX402PriceUsd,
  recommendedFloorClearsMarginGate,
  X402_MIN_GROSS_MARGIN_RATE,
  X402_RECOMMENDED_PRICE_FLOOR_USD,
} from './unit-economics';

describe('x402 unit economics', () => {
  it('estimates fixed rail cost at ~$0.0011 when above CDP free tier', () => {
    expect(estimateX402RailCostUsd()).toBeCloseTo(0.0011, 4);
  });

  it('drops CDP metering below the 1,000 tx/mo free tier', () => {
    expect(
      estimateX402RailCostUsd({
        facilitatorSettlementFeeUsd: 0,
        gasPerCallUsd: 0.0001,
        cdpMeteringPerTxUsd: 0.001,
        aboveCdpFreeTier: false,
        offRampFeeRate: 0.0075,
      })
    ).toBeCloseTo(0.0001, 4);
  });

  it('computes minimum viable price near $0.0023 at default rails', () => {
    expect(minimumViableX402PriceUsd()).toBeCloseTo(0.0023, 3);
  });

  it('clears the 50% gross-margin gate at the $0.01 recommended floor', () => {
    const result = evaluateX402UnitEconomics(X402_RECOMMENDED_PRICE_FLOOR_USD);
    expect(result.clearsMarginGate).toBe(true);
    expect(result.grossMarginRate).toBeGreaterThanOrEqual(
      X402_MIN_GROSS_MARGIN_RATE
    );
    expect(result.railCostUsd).toBeCloseTo(0.0011, 4);
    expect(result.offRampCostUsd).toBeCloseTo(0.000075, 5);
  });

  it('fails the margin gate below minimum viable price', () => {
    const floor = minimumViableX402PriceUsd();
    const below = evaluateX402UnitEconomics(floor * 0.5);
    expect(below.clearsMarginGate).toBe(false);
  });

  it('confirms recommended floor helper', () => {
    expect(recommendedFloorClearsMarginGate()).toBe(true);
  });
});
