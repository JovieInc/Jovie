import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyFounderFeedback,
  calibrateJudgment,
  classifyDiscoveryEvent,
  convergeEvidence,
  loadRegistry,
  normalizeObservation,
  routeEvidence,
  validateRegistry,
} from './idea-radar.mjs';

const input = {
  problemOpportunity: 'Creators cannot reconcile royalties',
  affectedUser: 'independent artists',
  affectedCapability: 'royalty recovery',
  sourceUrl: 'https://example.com/item/42?utm_source=test#comments',
  sourceType: 'hacker-news',
  sourceItemId: '42',
  observedAt: '2026-09-27T04:00:00Z',
  accessConstraints: 'public; attribution required',
  freshness: 'new within 24h',
  engagementQuality: 0.8,
  evidenceQuality: 'reported pain; not demand proof',
  corroboration: ['https://other.example/report'],
  novelty: { comparedWith: ['idea-7'], summary: 'new affected segment' },
  initialDemandEvidence: 'one complaint',
  uncertainty: 'willingness to pay unknown',
  cheapestValidationAction: 'interview three affected artists',
  capacityClass: 'research-small',
  revenuePathConflict: 'none',
  hypothesisWeight: 2,
};

test('shipped registry disables legacy authorities and maps every legacy source without loss', () => {
  const registry = loadRegistry();
  assert.equal(validateRegistry(registry), true);
  assert.equal(registry.legacyMigration.sources.length, 4);
});

test('duplicate adapter events converge on one stable evidence identity', () => {
  const first = normalizeObservation(input);
  const changed = normalizeObservation({
    ...input,
    sourceUrl: 'https://example.com/different',
    observedAt: '2026-09-27T05:00:00Z',
    corroboration: ['https://third.example/proof'],
  });
  assert.equal(first.id, changed.id);
  const merged = convergeEvidence(first, changed);
  assert.equal(merged.id, first.id);
  assert.deepEqual(merged.corroboration, [
    'https://other.example/report',
    'https://third.example/proof',
  ]);
});

test('normalization requires provenance, access, freshness, quality, uncertainty, validation, and capacity fields', () => {
  for (const field of [
    'accessConstraints',
    'freshness',
    'evidenceQuality',
    'uncertainty',
    'cheapestValidationAction',
    'capacityClass',
  ]) {
    assert.throws(
      () => normalizeObservation({ ...input, [field]: '' }),
      new RegExp(field)
    );
  }
});

test('material events run immediately while clock events cannot drive discovery', () => {
  const policy = loadRegistry().triggerPolicy;
  assert.equal(
    classifyDiscoveryEvent({ class: 'source-item-new-or-changed' }, policy)
      .disposition,
    'process-now'
  );
  assert.equal(
    classifyDiscoveryEvent({ class: 'clock-fired' }, policy).disposition,
    'reject'
  );
  assert.equal(
    classifyDiscoveryEvent(
      { class: 'missed-event-catch-up', missedEventEvidence: true },
      policy
    ).disposition,
    'catch-up'
  );
  assert.equal(
    classifyDiscoveryEvent(
      { semanticSignature: 'royalty:missing', expectedInformationValue: 0.5 },
      policy
    ).disposition,
    'accumulate'
  );
  assert.equal(
    classifyDiscoveryEvent(
      { semanticSignature: 'royalty:missing', expectedInformationValue: 0.8 },
      policy
    ).disposition,
    'process-now'
  );
});

test('routing avoids backlog spam and sends benchmarks and founder decisions to their owners', () => {
  const evidence = normalizeObservation(input);
  assert.deepEqual(routeEvidence(evidence), {
    destination: 'canonical-evidence-lifecycle',
    createsLinearIssue: false,
  });
  assert.equal(
    routeEvidence(evidence, { benchmarkRequired: true }).destination,
    'JOV-2966'
  );
  assert.equal(
    routeEvidence(evidence, { founderJudgment: true }).destination,
    'ovi-certification-inbox'
  );
  assert.equal(
    routeEvidence(evidence, { executableNextAction: true }).createsLinearIssue,
    true
  );
});

test('founder up-vote changes weight but cannot bypass validation or capacity admission', () => {
  const evidence = normalizeObservation(input);
  const voted = applyFounderFeedback(evidence, 'up');
  assert.equal(voted.hypothesisWeight, 3);
  assert.equal(voted.admissionAuthorized, false);
  assert.equal(voted.requiredNextGate, input.cheapestValidationAction);
});

test('outcomes calibrate judgments while separating taste from paid demand', () => {
  assert.deepEqual(
    calibrateJudgment('GO', { paidBehavior: true, founderTaste: 'up' }),
    {
      predictedPositive: true,
      realizedPositive: true,
      correct: true,
      customerDemand: true,
      founderTaste: 'up',
    }
  );
  assert.equal(
    calibrateJudgment('GO', { paidBehavior: false, realizedValue: false })
      .correct,
    false
  );
});
