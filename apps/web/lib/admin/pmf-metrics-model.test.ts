import { describe, expect, it } from 'vitest';
import {
  computePmfMetrics,
  PMF_VERY_DISAPPOINTED_TARGET,
} from './pmf-metrics-model';

describe('computePmfMetrics', () => {
  it('computes activation and very-disappointed rates against the 40% bar', () => {
    const metrics = computePmfMetrics({
      admittedUsers: 50,
      activatedUsers: 20,
      surveyResponses: 10,
      veryDisappointed: 4,
    });
    expect(metrics.activationRate).toBe(0.4);
    expect(metrics.veryDisappointedRate).toBe(0.4);
    expect(metrics.target).toBe(PMF_VERY_DISAPPOINTED_TARGET);
    expect(PMF_VERY_DISAPPOINTED_TARGET).toBe(0.4);
    expect(metrics.meetsTarget).toBe(true);
  });

  it('reads below target when fewer than 40% are very disappointed', () => {
    const metrics = computePmfMetrics({
      admittedUsers: 3,
      activatedUsers: 1,
      surveyResponses: 8,
      veryDisappointed: 3,
    });
    expect(metrics.activationRate).toBeCloseTo(1 / 3);
    expect(metrics.veryDisappointedRate).toBe(0.375);
    expect(metrics.meetsTarget).toBe(false);
  });

  it('has no rate, and no verdict, without a denominator', () => {
    const metrics = computePmfMetrics({
      admittedUsers: 0,
      activatedUsers: 0,
      surveyResponses: 0,
      veryDisappointed: 0,
    });
    expect(metrics.activationRate).toBeNull();
    expect(metrics.veryDisappointedRate).toBeNull();
    expect(metrics.meetsTarget).toBeNull();
  });

  it('never reports a rate above 100% or a negative count', () => {
    const metrics = computePmfMetrics({
      admittedUsers: 2,
      activatedUsers: 5,
      surveyResponses: -1,
      veryDisappointed: Number.NaN,
    });
    expect(metrics.activationRate).toBe(1);
    expect(metrics.surveyResponses).toBe(0);
    expect(metrics.veryDisappointed).toBe(0);
    expect(metrics.veryDisappointedRate).toBeNull();
  });
});
