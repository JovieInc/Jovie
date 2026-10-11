import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ASSET_CLASSES,
  canAllocateStandaloneCapacity,
  canEnactRecommendation,
  loadRegistry,
  MONETIZATION_FORMS,
  matchSignal,
  normalizeSignal,
  OPPORTUNITY_STAGES,
  oviProjection,
  projectCompanyAsset,
  registryDigest,
  requiresGovernedCertification,
  SIGNAL_CLASSES,
  SIGNAL_WEIGHTS,
  validateAssetRegistry,
} from './company-assets.mjs';

function registry() {
  return loadRegistry();
}

test('committed registry validates', () => {
  assert.equal(validateAssetRegistry(registry()), true);
  assert.equal(registry().issue, 'JOV-5945');
  assert.equal(registry().evidenceLifecycleIssue, 'JOV-5916');
});

test('rejects wrong schema, second ledger, and auto-build queue', () => {
  const base = registry();
  assert.throws(() => validateAssetRegistry({ ...base, schema: 'x' }));
  assert.throws(() => validateAssetRegistry({ ...base, secondLedger: true }));
  assert.throws(() => validateAssetRegistry({ ...base, autoBuildQueue: true }));
});

test('every asset class and monetization form is enumerable', () => {
  assert.ok(ASSET_CLASSES.includes('feature-combination'));
  assert.ok(ASSET_CLASSES.includes('model-router'));
  assert.ok(MONETIZATION_FORMS.includes('api-mcp-cli'));
  assert.ok(MONETIZATION_FORMS.includes('spinout'));
  for (const cls of SIGNAL_CLASSES) {
    assert.ok(SIGNAL_WEIGHTS[cls] > 0);
  }
});

test('projectCompanyAsset projects existing records without a second truth', () => {
  const asset = projectCompanyAsset({
    id: 'symphony-model-routing',
    assetClass: 'model-router',
    owner: 'agentos',
    version: '1.0.0',
    sourceRegistry: 'capability-benchmark-registry.json',
    internalValue: { basis: 'lane routing', certainty: 'medium' },
  });
  assert.equal(asset.schema, 'jovie.company-asset/v1');
  assert.equal(asset.sourceRef, 'symphony-model-routing');
  assert.equal(asset.externalOptionValue.certainty, 'unknown');
  assert.throws(() => projectCompanyAsset({ id: 'x', assetClass: 'bogus' }));
});

test('signals normalize into JOV-5916 shape with provenance and weight', () => {
  const normalized = normalizeSignal({
    class: 'willingness-to-pay',
    subject: 'Smart Links',
    summary: 'Customer attempted to pay for bulk attribution exports.',
    provenance: 'stripe-webhook',
    observedAt: '2026-09-27T00:00:00Z',
  });
  assert.equal(normalized.canonicalLifecycle, 'JOV-5916');
  assert.equal(normalized.evidentiaryWeight, 1.0);
  assert.equal(normalized.founderHypothesisOnly, false);
});

test('founder observations are high-weight hypotheses, not proof', () => {
  const normalized = normalizeSignal({
    class: 'founder-observation',
    summary: 'this could be a company',
    provenance: 'founder',
    observedAt: '2026-09-27T00:00:00Z',
  });
  assert.equal(normalized.founderHypothesisOnly, true);
  assert.ok(
    normalized.evidentiaryWeight < SIGNAL_WEIGHTS['willingness-to-pay']
  );
});

test('duplicate signals converge on one opportunity', () => {
  const reg = registry();
  const dup = matchSignal(
    {
      class: 'repeated-unexpected-use',
      subject: 'smart-links',
      summary:
        'Customers use smart links with analytics as an attribution system rather than a creator link!',
      provenance: 'support',
      observedAt: '2026-09-27T00:00:00Z',
    },
    reg.opportunities
  );
  assert.equal(dup.disposition, 'attach');
  assert.equal(dup.opportunityId, 'opp-smart-link-attribution');
});

test('a genuinely new signal produces a new opportunity, not spam', () => {
  const dup = matchSignal(
    {
      class: 'workaround-export-support-signal',
      subject: 'commerce',
      summary: 'fans export receipts to reconcile taxes manually',
      provenance: 'support',
      observedAt: '2026-09-27T00:00:00Z',
    },
    registry().opportunities
  );
  assert.equal(dup.disposition, 'new-opportunity');
});

test('model-router opportunity links to JOV-2966 inside-out assessment', () => {
  const opp = registry().opportunities.find(
    o => o.id === 'opp-model-routing-b2b'
  );
  assert.equal(opp.benchmarkLink, 'JOV-2966');
  assert.ok(opp.assets.includes('symphony-model-routing'));
  assert.equal(opp.cheapestTest, 'customer-conversation');
});

test('smart-link alternate use yields a bounded hypothesis, not a build', () => {
  const opp = registry().opportunities.find(
    o => o.id === 'opp-smart-link-attribution'
  );
  assert.equal(opp.stage, 'hypothesis');
  assert.equal(opp.cheapestTest, 'relabeling-or-packaging');
  assert.ok(canAllocateStandaloneCapacity(opp));
});

test('high-consequence recommendations cannot self-enact without certified evidence', () => {
  const opp = registry().opportunities.find(
    o => o.id === 'opp-smart-link-attribution'
  );
  assert.equal(requiresGovernedCertification(opp), true);
  assert.equal(canEnactRecommendation(opp), false);
  const certified = {
    ...opp,
    stage: 'certified-outcome',
    recommendation: {
      type: 'icp-or-packaging-change',
      evidence: {
        comparableExpectedValue: true,
        downsideAssessed: true,
        reversibilityAssessed: true,
        capacityImpactAssessed: true,
        certifiedOutcomeReceipt: true,
      },
    },
  };
  assert.equal(canEnactRecommendation(certified), true);
});

test('routine recommendations inside authority do not need the gate', () => {
  const opp = registry().opportunities.find(
    o => o.id === 'opp-model-routing-b2b'
  );
  assert.equal(requiresGovernedCertification(opp), false);
});

test('Ovi surfaces only decision-worthy opportunities', () => {
  const items = oviProjection(registry());
  assert.equal(items.length, 1);
  assert.equal(items[0].opportunityId, 'opp-smart-link-attribution');
  assert.ok(items[0].actions.includes('certify-test'));
  assert.ok(items[0].actions.includes('hold-as-option'));
});

test('killed opportunities require a preserved rejection reason', () => {
  const reg = registry();
  reg.opportunities.push({
    id: 'opp-dead',
    stage: 'kill',
    observedSignal: 'x',
    signalClass: 'workaround-export-support-signal',
    signalSignatures: ['deadbeef0'],
    assets: ['commerce'],
    internalValue: { basis: 'x', certainty: 'low' },
    externalHypothesis: { buyer: 'x', problem: 'x' },
    cheapestTest: 'customer-conversation',
    capacity: { successThreshold: 'x', killCriteria: 'x' },
    confidence: 'low',
    cannibalizationRisk: 'none',
    recommendation: { type: 'retain-internal-leverage' },
  });
  assert.throws(() => validateAssetRegistry(reg));
});

test('an opportunity cannot preempt revenue blockers silently', () => {
  const reg = registry();
  reg.opportunities[0].preemptsRevenueBlocker = true;
  assert.throws(() => validateAssetRegistry(reg));
  reg.opportunities[0].challengerAllocation = 'approved JOV-XXXX';
  assert.equal(validateAssetRegistry(reg), true);
});

test('feature combinations reference real components and a missing capability', () => {
  const combo = registry().featureCombinations.find(
    c => c.id === 'programmatic-attribution'
  );
  assert.deepEqual(combo.components, ['smart-links', 'identity', 'analytics']);
  assert.ok(combo.minimumMissingCapability.length > 0);
});

test('lifecycle stages match the issue contract', () => {
  assert.equal(OPPORTUNITY_STAGES[0], 'signal');
  assert.ok(OPPORTUNITY_STAGES.includes('certified-outcome'));
  assert.ok(OPPORTUNITY_STAGES.includes('hold'));
});

test('registry digest is stable for identical content', () => {
  assert.equal(registryDigest(registry()), registryDigest(registry()));
});
