import { describe, expect, it } from 'vitest';
import {
  dollarizeRevenueLiftCents,
  FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN,
  getRevenueLiftWeightsSnapshot,
  REVENUE_LIFT_WEIGHTS_VERSION,
  STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK,
} from './revenue-lift-weights';

describe('revenue-lift-weights', () => {
  it('exposes positive integer-cent weights', () => {
    expect(Number.isInteger(STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK)).toBe(
      true
    );
    expect(Number.isInteger(FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN)).toBe(true);
    expect(STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK).toBeGreaterThan(0);
    expect(FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN).toBeGreaterThan(0);
  });

  it('dollarizes revenue lift as gmv + weighted clicks + weighted fans', () => {
    const result = dollarizeRevenueLiftCents({
      gmvDeltaCents: 4200,
      dspClickDelta: 100,
      newFansDelta: 3,
    });

    expect(result).toBe(
      4200 +
        100 * STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK +
        3 * FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN
    );
  });

  it('returns zero lift for zero inputs', () => {
    expect(
      dollarizeRevenueLiftCents({
        gmvDeltaCents: 0,
        dspClickDelta: 0,
        newFansDelta: 0,
      })
    ).toBe(0);
  });

  it('embeds the version and validation date in the snapshot', () => {
    const snapshot = getRevenueLiftWeightsSnapshot();
    expect(snapshot.version).toBe(REVENUE_LIFT_WEIGHTS_VERSION);
    expect(snapshot.streamingValueWeightCentsPerDspClick).toBe(
      STREAMING_VALUE_WEIGHT_CENTS_PER_DSP_CLICK
    );
    expect(snapshot.fanCaptureLtvWeightCentsPerFan).toBe(
      FAN_CAPTURE_LTV_WEIGHT_CENTS_PER_FAN
    );
    // lastValidatedAt is either null (unvalidated) or an ISO date string
    expect(
      snapshot.lastValidatedAt === null ||
        /^\d{4}-\d{2}-\d{2}$/.test(snapshot.lastValidatedAt)
    ).toBe(true);
  });
});
