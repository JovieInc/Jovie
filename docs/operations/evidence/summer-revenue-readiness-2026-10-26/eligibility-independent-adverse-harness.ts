import assert from 'node:assert/strict';
import { test } from 'node:test';
import { revalidateAcquisitionEligibilityReport } from '/workspace/Jovie/apps/web/lib/acquisition/eligibility-cache.ts';

const now = new Date('2026-10-26T12:00:00.000Z');
const sourceMap = {
  entry: ['m2-revenue-path:live#signed_out'],
  auth_signup: ['canary:auth-signup-onboarding'],
  claim: ['m2-revenue-path:live#claim'],
  profile_truth: [
    'canary:public-profile',
    'github:m2-revenue-path-canary.yml@main',
  ],
  selected_rail: ['commerce-decision:selected-rail'],
  offer_checkout: ['m2-revenue-path:live#pro_checkout_199'],
  jov6258_preflight: ['commerce-decision:jov-6258-preflight'],
  handoff_correlation: ['commerce-decision:handoff-correlation'],
  payment_journey: ['commerce-decision:payment-journey'],
  activation: ['m2-revenue-path:live#activation'],
  payment_entitlement: ['github:ci.yml#Golden Path (manual)@main'],
  reversal: ['commerce-decision:reversal'],
  commerce_canary: ['commerce-decision:canary'],
  instrumentation: ['founder-funnel:30d'],
};
const fixture = () => ({
  contract: 'jovie.acquisition-eligibility/v1',
  evaluatedAt: now.toISOString(),
  eligible: true,
  verdict: 'ELIGIBLE',
  requirements: Object.entries(sourceMap).map(([id, sources]) => ({
    id,
    evidence: sources.map(source => ({
      requirement: id,
      source,
      status: 'green',
      observedAt: now.toISOString(),
      maxAgeMs: 900000,
      ref: null,
      detail: 'controlled synthetic receipt',
    })),
  })),
  funnel: null,
  commerce: {
    contract: 'jovie.commerce-decision-projection/v1',
    matrixRevision: 'independent-fixture-r1',
    matrix: [
      {
        offer: 'artist-visibility-offer-contract-v1',
        channel: 'agent-handoff',
        rail: 'ordinary-web-checkout',
        accessState: 'supported',
        merchantOfRecord: 'jovie',
        decisionRevision: 'independent-decision-r1',
        nextReevaluationTrigger: 'policy-change',
        evidence: [
          'selected-rail',
          'jov-6258-preflight',
          'handoff-correlation',
          'payment-journey',
          'reversal',
        ].map(kind => ({
          kind,
          status: 'green',
          observedAt: now.toISOString(),
          freshnessBudgetMs: 900000,
        })),
        canary: {
          result: 'passed',
          observedAt: now.toISOString(),
          freshnessBudgetMs: 900000,
        },
        invalidations: [],
      },
    ],
  },
});
const valid = value =>
  revalidateAcquisitionEligibilityReport(value, now)?.eligible === true;
test('control: fresh complete evidence remains eligible', () =>
  assert.equal(valid(fixture()), true));
test('stale receipt cannot inherit cached eligible flag', () =>
  assert.notEqual(
    revalidateAcquisitionEligibilityReport(
      fixture(),
      new Date(now.getTime() + 900001)
    )?.eligible,
    true
  ));
test('missing requirement is not zero-success', () => {
  const v = fixture();
  v.requirements.pop();
  assert.equal(valid(v), false);
});
test('failed receipt overrides cached green', () => {
  const v = fixture();
  v.requirements[0].evidence[0].status = 'red';
  assert.equal(valid(v), false);
});
test('held cached decision cannot self-promote', () => {
  const v = fixture();
  v.eligible = false;
  v.verdict = 'UNKNOWN';
  assert.equal(valid(v), false);
});
test('profile cannot lose workflow producer silently', () => {
  const v = fixture();
  v.requirements.find(r => r.id === 'profile_truth')!.evidence.pop();
  assert.equal(valid(v), false);
});
test('malformed cache cannot raise existing freshness budget', () => {
  const v = fixture();
  v.requirements[0].evidence[0].maxAgeMs = 999999999999;
  v.requirements[0].evidence[0].observedAt = new Date(
    now.getTime() - 900001
  ).toISOString();
  assert.equal(valid(v), false);
});
test('contradictory duplicate commerce receipt cannot hide red', () => {
  const v = fixture();
  v.commerce.matrix[0].evidence.push({
    ...v.commerce.matrix[0].evidence[0],
    status: 'red',
  });
  assert.equal(valid(v), false);
});
