import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/acquisition/eligibility.server', () => ({
  getAcquisitionEligibility: vi.fn(),
}));

const { applyAcquisitionEligibility } = await import(
  '@/lib/leads/reporting-ramp'
);

const increase = {
  recommendedAction: 'increase' as const,
  recommendedNextDailyCap: 15,
  reasons: ['Claim click rate supports a controlled increase.'],
  sampleSize: 40,
  claimClickRate: 0.08,
  providerFailureRate: 0,
};

const blocked = {
  eligible: false,
  verdict: 'BLOCKED' as const,
  firstBlocker: {
    id: 'payment_entitlement' as const,
    label: 'payments',
    status: 'red' as const,
    owner: 'billing',
    nextAction: 'Fix the Golden Path lane.',
    explanation: 'red',
    evidence: [],
  },
};

describe('applyAcquisitionEligibility', () => {
  it('holds an increase at the current cap while the cone is not eligible', () => {
    const result = applyAcquisitionEligibility(increase, 10, blocked);
    expect(result.recommendedAction).toBe('hold');
    expect(result.recommendedNextDailyCap).toBe(10);
    expect(result.reasons.at(-1)).toContain(
      'first blocker payment_entitlement is red'
    );
  });

  it('keeps an increase once the cone is eligible', () => {
    expect(
      applyAcquisitionEligibility(increase, 10, {
        eligible: true,
        verdict: 'ELIGIBLE',
        firstBlocker: null,
      })
    ).toBe(increase);
  });

  it('never blocks a pause or hold', () => {
    const pause = {
      ...increase,
      recommendedAction: 'pause' as const,
      recommendedNextDailyCap: 0,
    };
    expect(applyAcquisitionEligibility(pause, 10, blocked)).toBe(pause);
  });
});
