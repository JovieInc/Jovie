import { describe, expect, it } from 'vitest';
import {
  type ConeEvidence,
  type ConeRequirementId,
  describeAcquisitionBlock,
  evaluateAcquisitionEligibility,
  REVENUE_CONE_REQUIREMENTS,
  unknownAcquisitionEligibility,
} from './eligibility';

const NOW = new Date('2026-10-03T18:00:00.000Z');
const HOUR = 60 * 60_000;

function receipt(
  requirement: ConeRequirementId,
  overrides: Partial<ConeEvidence> = {}
): ConeEvidence {
  return {
    detail: 'ok',
    maxAgeMs: 24 * HOUR,
    observedAt: new Date(NOW.getTime() - HOUR).toISOString(),
    ref: null,
    requirement,
    source: `test:${requirement}`,
    status: 'green',
    ...overrides,
  };
}

function allGreen(): ConeEvidence[] {
  return REVENUE_CONE_REQUIREMENTS.map(requirement => receipt(requirement.id));
}

function withReceipt(next: ConeEvidence): ConeEvidence[] {
  return [
    ...allGreen().filter(item => item.requirement !== next.requirement),
    next,
  ];
}

describe('evaluateAcquisitionEligibility', () => {
  it('is eligible only when every cone requirement is green and current', () => {
    const result = evaluateAcquisitionEligibility({
      evidence: allGreen(),
      now: NOW,
    });
    expect(result.eligible).toBe(true);
    expect(result.verdict).toBe('ELIGIBLE');
    expect(result.firstBlocker).toBeNull();
    expect(result.policy.outboundAcquisition).toBe('allowed');
    expect(result.policy.inbound).toBe('serve');
  });

  it('blocks on a red receipt and names the owner and next action', () => {
    const result = evaluateAcquisitionEligibility({
      evidence: withReceipt(
        receipt('payment_entitlement', {
          detail: 'Golden Path failed',
          source: 'github:golden-path-nightly.yml@main',
          status: 'red',
        })
      ),
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.verdict).toBe('BLOCKED');
    expect(result.firstBlocker?.id).toBe('payment_entitlement');
    expect(result.firstBlocker?.owner).toContain('JOV-7192');
    expect(result.firstBlocker?.explanation).toContain(
      'github:golden-path-nightly.yml@main: red - Golden Path failed'
    );
    expect(result.policy.outboundAcquisition).toBe('blocked');
    expect(result.policy.instruction).toContain(
      'Do not recommend outbound acquisition'
    );
  });

  it('reports the earliest journey blocker first', () => {
    const evidence = allGreen().map(item =>
      item.requirement === 'activation' || item.requirement === 'claim'
        ? { ...item, status: 'red' as const }
        : item
    );
    const result = evaluateAcquisitionEligibility({ evidence, now: NOW });
    expect(result.blockers.map(item => item.id)).toEqual([
      'claim',
      'activation',
    ]);
    expect(result.firstBlocker?.id).toBe('claim');
  });

  it('fails closed when a requirement has no evidence', () => {
    const result = evaluateAcquisitionEligibility({
      evidence: allGreen().filter(item => item.requirement !== 'entry'),
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.firstBlocker?.id).toBe('entry');
    expect(result.firstBlocker?.explanation).toBe(
      'No evidence source reported a receipt.'
    );
  });

  it('treats a stale, undated, or future green receipt as unknown', () => {
    for (const observedAt of [
      new Date(NOW.getTime() - 25 * HOUR).toISOString(),
      null,
      'not-a-date',
      new Date(NOW.getTime() + HOUR).toISOString(),
    ]) {
      const result = evaluateAcquisitionEligibility({
        evidence: withReceipt(receipt('profile_truth', { observedAt })),
        now: NOW,
      });
      expect(result.eligible).toBe(false);
      expect(result.firstBlocker?.id).toBe('profile_truth');
      expect(result.firstBlocker?.status).toBe('unknown');
    }
    const stale = evaluateAcquisitionEligibility({
      evidence: withReceipt(
        receipt('profile_truth', {
          observedAt: new Date(NOW.getTime() - 25 * HOUR).toISOString(),
        })
      ),
      now: NOW,
    });
    expect(stale.firstBlocker?.explanation).toContain('green but stale');
  });

  it('takes the worst of several sources for one requirement', () => {
    const result = evaluateAcquisitionEligibility({
      evidence: [
        ...allGreen(),
        receipt('profile_truth', { source: 'second', status: 'unknown' }),
      ],
      now: NOW,
    });
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.firstBlocker?.evidence).toHaveLength(2);
  });

  it('turns eligible again without a toggle once evidence recovers', () => {
    const red = withReceipt(receipt('claim', { status: 'red' }));
    expect(
      evaluateAcquisitionEligibility({ evidence: red, now: NOW }).eligible
    ).toBe(false);
    expect(
      evaluateAcquisitionEligibility({ evidence: allGreen(), now: NOW })
        .eligible
    ).toBe(true);
  });
});

describe('unknownAcquisitionEligibility', () => {
  it('is never eligible and explains why', () => {
    const result = unknownAcquisitionEligibility(NOW, 'composer crashed');
    expect(result.eligible).toBe(false);
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.blockers).toHaveLength(REVENUE_CONE_REQUIREMENTS.length);
    expect(result.firstBlocker?.explanation).toContain('composer crashed');
  });
});

describe('describeAcquisitionBlock', () => {
  it('summarizes the first blocker for logs and ramp reasons', () => {
    const result = evaluateAcquisitionEligibility({
      evidence: withReceipt(receipt('entry', { status: 'red' })),
      now: NOW,
    });
    expect(describeAcquisitionBlock(result)).toMatch(
      /^ACQUISITION_ELIGIBLE is false \(BLOCKED\): first blocker entry is red\./
    );
    expect(
      describeAcquisitionBlock(
        evaluateAcquisitionEligibility({ evidence: allGreen(), now: NOW })
      )
    ).toBe('ACQUISITION_ELIGIBLE: the $199 cone is green.');
  });
});
