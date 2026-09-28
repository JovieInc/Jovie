import { describe, expect, it } from 'vitest';
import {
  buildReleaseRiskReceipt,
  measureReleaseRiskReceipt,
  RELEASE_RISK_POLICY_VERSION,
} from '../release-risk-policy.mjs';

const sha = 'a'.repeat(40);
const base = {
  lineageSha: sha,
  deployableWeb: true,
  selectedProductLanes: ['web'],
  mergeAt: '2026-09-28T12:00:00.000Z',
};
const risk = (riskLevel, flags = {}) => ({
  riskLevel,
  requiresSmoke: false,
  requiresPreview: false,
  blocksUnattended: false,
  matchedRuleIds: [],
  ...flags,
});
const plan = (riskReceipt, extra = {}) =>
  buildReleaseRiskReceipt({ ...base, riskReceipt, ...extra });
const smokePreview = { requiresSmoke: true, requiresPreview: true };
const matrix = {
  'copy-only UI': ['low', {}, 'low', 300],
  'reversible component': ['low', {}, 'low', 300],
  'API write': ['medium', { requiresSmoke: true }, 'medium', 900],
  'auth boundary': ['high', smokePreview, 'high', 1800],
  migration: ['high', { requiresSmoke: true }, 'high', 1800],
  payment: ['high', smokePreview, 'high', 1800],
  'domain/routing': ['high', { requiresPreview: true }, 'high', 1800],
  infrastructure: ['high', { requiresSmoke: true }, 'high', 1800],
};
describe('release risk policy', () => {
  it.each(Object.entries(matrix))(
    'maps the existing %s receipt',
    (_name, [level, flags, lane, target]) => {
      const receipt = plan(risk(level, flags));
      expect(receipt).toMatchObject({
        policyVersion: RELEASE_RISK_POLICY_VERSION,
        selectedLane: lane,
        latency: { targetP95Seconds: target },
        promotion: { unattendedAllowed: true },
      });
    }
  );
  it('emits an immediate not-applicable lineage for no-op/non-web changes', () => {
    const receipt = plan(risk('high', { blocksUnattended: true }), {
      deployableWeb: false,
      selectedProductLanes: ['operations'],
    });
    expect(receipt).toMatchObject({
      selectedLane: 'not_applicable',
      promotion: {
        mutateStaging: false,
        mutateProduction: false,
        unattendedAllowed: true,
      },
    });
    expect(receipt.requiredProof).toEqual(['sealed-no-web-impact']);
  });
  it('keeps copy-only low risk automatic without preview or certification', () => {
    const receipt = plan(risk('low'));
    expect(receipt.requiredProof).not.toContain(
      'risk-required-staging-preview'
    );
    expect(receipt.certificationPacket).toBeNull();
  });
  it('auto-promotes a medium authenticated write after selected proof', () => {
    const receipt = plan(risk('medium', { requiresSmoke: true }));
    expect(receipt.requiredProof).toEqual(
      expect.arrayContaining([
        'exact-production-candidate',
        'selected-integration',
        'targeted-canary',
        'risk-required-smoke',
      ])
    );
    expect(receipt.promotion.unattendedAllowed).toBe(true);
  });
  it('cannot override a migration-class high receipt lower', () => {
    for (const requestedLane of ['low', 'medium']) {
      expect(() =>
        plan(risk('high'), {
          override: {
            id: 'ovr-1',
            actor: 'release-admin',
            reason: 'test',
            requestedLane,
          },
        })
      ).toThrow('cannot lower');
    }
  });
  it('creates one Ovi packet with the exact next decision for ambiguous authority', () => {
    const receipt = plan(
      risk('high', {
        blocksUnattended: true,
        matchedRuleIds: ['ambiguous-authority'],
      })
    );
    expect(receipt.promotion.unattendedAllowed).toBe(false);
    expect(receipt.certificationPacket).toMatchObject({
      contract: 'jovie.ovi-release-certification/v1',
      id: `release:${sha}:${RELEASE_RISK_POLICY_VERSION}`,
    });
    expect(receipt.certificationPacket.nextDecision).toContain(sha);
  });
  it('fails unknown material inputs into high risk', () => {
    const receipt = plan(null);
    expect(receipt).toMatchObject({
      selectedLane: 'high',
      promotion: { certificationRequired: true },
    });
    expect(receipt.originalClassification.uncertainties).not.toEqual([]);
  });
  it('records measured latency for Ovi and the lane SLO', () => {
    const receipt = measureReleaseRiskReceipt(
      plan(risk('medium')),
      '2026-09-28T12:14:00.000Z'
    );
    expect(receipt.latency).toMatchObject({
      measuredSeconds: 840,
      targetP95Seconds: 900,
      withinTarget: true,
    });
    expect(receipt.ovie).toMatchObject({
      policyVersion: RELEASE_RISK_POLICY_VERSION,
      selectedLane: 'medium',
      measuredLatencySeconds: 840,
    });
  });
});
