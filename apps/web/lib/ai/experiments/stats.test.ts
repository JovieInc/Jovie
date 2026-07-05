import { describe, expect, it } from 'vitest';
import {
  type ArmStats,
  decidePromotion,
  isCostEligible,
  twoProportionZ,
} from './stats';

const arm = (overrides: Partial<ArmStats>): ArmStats => ({
  model: 'model',
  upVotes: 0,
  downVotes: 0,
  avgCostUsd: null,
  avgTotalTokens: null,
  ...overrides,
});

describe('twoProportionZ', () => {
  it('is ~0 for identical arms', () => {
    const a = arm({ model: 'a', upVotes: 50, downVotes: 50 });
    const b = arm({ model: 'b', upVotes: 50, downVotes: 50 });
    expect(Math.abs(twoProportionZ(a, b))).toBeLessThan(1e-9);
  });

  it('is positive when challenger is better', () => {
    const challenger = arm({ model: 'c', upVotes: 90, downVotes: 10 });
    const control = arm({ model: 'a', upVotes: 60, downVotes: 40 });
    expect(twoProportionZ(challenger, control)).toBeGreaterThan(1.645);
  });

  it('returns 0 when an arm has no votes', () => {
    expect(
      twoProportionZ(arm({ model: 'c' }), arm({ model: 'a', upVotes: 10 }))
    ).toBe(0);
  });
});

describe('isCostEligible', () => {
  it('prefers USD comparison when both priced', () => {
    const cheap = arm({ model: 'c', avgCostUsd: 0.001 });
    const control = arm({ model: 'a', avgCostUsd: 0.01 });
    expect(isCostEligible(cheap, control, 0.05)).toBe(true);
    expect(isCostEligible(control, cheap, 0.05)).toBe(false);
  });

  it('falls back to tokens when unpriced', () => {
    const lean = arm({ model: 'c', avgTotalTokens: 500 });
    const control = arm({ model: 'a', avgTotalTokens: 1000 });
    expect(isCostEligible(lean, control, 0.05)).toBe(true);
    expect(isCostEligible(control, lean, 0.05)).toBe(false);
  });

  it('allows tolerance headroom', () => {
    const challenger = arm({ model: 'c', avgCostUsd: 0.0104 });
    const control = arm({ model: 'a', avgCostUsd: 0.01 });
    expect(isCostEligible(challenger, control, 0.05)).toBe(true);
    expect(isCostEligible(challenger, control, 0)).toBe(false);
  });

  it('is neutral when no cost data exists on either side', () => {
    expect(isCostEligible(arm({ model: 'c' }), arm({ model: 'a' }), 0.05)).toBe(
      true
    );
  });
});

describe('decidePromotion', () => {
  const minVotesPerArm = 30;

  it('holds when control lacks sample', () => {
    const verdict = decidePromotion({
      arms: [
        arm({ model: 'a', upVotes: 5, downVotes: 5 }),
        arm({ model: 'b', upVotes: 40, downVotes: 5 }),
      ],
      minVotesPerArm,
      costTolerance: 0.05,
    });
    expect(verdict.kind).toBe('hold');
  });

  it('holds when the challenger is not significantly better', () => {
    const verdict = decidePromotion({
      arms: [
        arm({ model: 'a', upVotes: 20, downVotes: 20 }),
        arm({ model: 'b', upVotes: 22, downVotes: 18 }),
      ],
      minVotesPerArm,
      costTolerance: 0.05,
    });
    expect(verdict.kind).toBe('hold');
  });

  it('promotes a significantly better, cheaper challenger', () => {
    const verdict = decidePromotion({
      arms: [
        arm({ model: 'a', upVotes: 60, downVotes: 40, avgCostUsd: 0.01 }),
        arm({ model: 'b', upVotes: 90, downVotes: 10, avgCostUsd: 0.002 }),
      ],
      minVotesPerArm,
      costTolerance: 0.05,
    });
    expect(verdict).toEqual({ kind: 'promote', winner: 'b' });
  });

  it('escalates a better but materially more expensive challenger', () => {
    const verdict = decidePromotion({
      arms: [
        arm({ model: 'a', upVotes: 60, downVotes: 40, avgCostUsd: 0.001 }),
        arm({ model: 'b', upVotes: 90, downVotes: 10, avgCostUsd: 0.01 }),
      ],
      minVotesPerArm,
      costTolerance: 0.05,
    });
    expect(verdict).toEqual({ kind: 'needs_decision', winner: 'b' });
  });

  it('picks the best of multiple significant challengers', () => {
    const verdict = decidePromotion({
      arms: [
        arm({ model: 'a', upVotes: 50, downVotes: 50, avgCostUsd: 0.01 }),
        arm({ model: 'b', upVotes: 80, downVotes: 20, avgCostUsd: 0.01 }),
        arm({ model: 'c', upVotes: 95, downVotes: 5, avgCostUsd: 0.01 }),
      ],
      minVotesPerArm,
      costTolerance: 0.05,
    });
    expect(verdict).toEqual({ kind: 'promote', winner: 'c' });
  });

  it('ignores challengers below the vote floor', () => {
    const verdict = decidePromotion({
      arms: [
        arm({ model: 'a', upVotes: 60, downVotes: 40 }),
        arm({ model: 'b', upVotes: 29, downVotes: 0 }),
      ],
      minVotesPerArm,
      costTolerance: 0.05,
    });
    expect(verdict.kind).toBe('hold');
  });
});
