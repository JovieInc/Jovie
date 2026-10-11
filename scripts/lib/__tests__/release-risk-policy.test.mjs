import { describe, expect, it } from 'vitest';
import {
  buildReleaseRiskReceipt,
  measureReleaseRiskReceipt,
} from '../release-risk-policy.mjs';

const sha = 'a'.repeat(40);
const base = {
  lineageSha: sha,
  deployableWeb: true,
  mergeAt: '2026-10-03T12:00:00.000Z',
};
const risk = (risk_level, flags = {}) => ({
  sha,
  risk_level,
  requires_smoke: false,
  requires_preview: false,
  blocks_unattended: false,
  ...flags,
});
const plan = (riskReceipt, extra = {}) =>
  buildReleaseRiskReceipt({ ...base, riskReceipt, ...extra });

describe('release risk policy', () => {
  it.each([
    ['copy-only UI', 'low', {}, 'low', 300],
    ['reversible component', 'low', {}, 'low', 300],
    ['API write', 'medium', { requires_smoke: true }, 'medium', 900],
    ['auth boundary', 'high', { requires_preview: true }, 'high', 1800],
    ['migration', 'high', { requires_smoke: true }, 'high', 1800],
    ['payment', 'high', { requires_preview: true }, 'high', 1800],
    ['domain/routing', 'high', { requires_preview: true }, 'high', 1800],
    ['infrastructure', 'high', { requires_smoke: true }, 'high', 1800],
  ])('maps the existing %s receipt', (_name, level, flags, lane, target) => {
    const receipt = plan(risk(level, flags));
    expect(receipt).toMatchObject({
      policyVersion: 'jovie.release-risk-policy/2026-10-03.1',
      selectedLane: lane,
      latency: { targetP95Seconds: target },
      promotion: { unattendedAllowed: true },
    });
    expect(receipt.requiredProof).toContain(
      lane === 'low'
        ? 'targeted-surface-smoke'
        : lane === 'medium'
          ? 'selected-integration'
          : 'full-selected-evidence'
    );
  });

  it('emits an immediate not-applicable no-op lineage without mutation', () => {
    expect(
      plan(risk('high', { blocks_unattended: true }), {
        deployableWeb: false,
      })
    ).toMatchObject({
      selectedLane: 'not_applicable',
      promotion: { mutateStaging: false, mutateProduction: false },
    });
  });

  it('fails unknown evidence red and emits one exact Ovi decision packet', () => {
    const unknown = plan(null);
    expect(unknown.evidenceState).toBe('red');
    expect(unknown.promotion.certificationRequired).toBe(true);
    const ambiguous = plan(
      risk('high', {
        blocks_unattended: true,
        matched_rule_ids: ['ambiguous-authority'],
      })
    );
    expect(ambiguous.certificationPacket.id).toContain(`release:${sha}:`);
    expect(ambiguous.certificationPacket.nextDecision).toContain(sha);
  });

  it('records the measured SLO for Ovi', () => {
    const planned = plan(risk('medium'));
    const measured = measureReleaseRiskReceipt(
      planned,
      '2026-10-03T12:14:00.000Z'
    );
    expect(measured.latency).toMatchObject({
      measuredSeconds: 840,
      targetP95Seconds: 900,
    });
    expect(measured.ovie.measuredLatencySeconds).toBe(840);
  });
});
