import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  applyFounderFeedback,
  calibrateJudgment,
  classifyDiscoveryEvent,
  convergeEvidence,
  getOriginalSource,
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

// Synthetic source wording only; never copy private founder content into fixtures.
const originalSource = {
  text: '  Could a shared sketchbook help teams?\nI am still exploring.  ',
  author: 'synthetic-founder',
  sourceTimestamp: '2026-09-27T03:30:00+00:00',
};
const interpretation = {
  generatedAt: '2026-09-27T04:01:00Z',
  summary: 'A shared sketchbook for teams',
  hypotheses: ['Teams may benefit from a shared draft space.'],
  suggestions: ['Interview one team.'],
};

function idea(overrides = {}) {
  return normalizeObservation({ ...input, originalSource, ...overrides });
}

test('original retrieval preserves exact source wording and provenance without model prose', () => {
  const evidence = idea({ interpretations: [interpretation] });
  const source = getOriginalSource(evidence);
  assert.equal(source.text, originalSource.text);
  assert.equal(source.author, originalSource.author);
  assert.equal(source.sourceTimestamp, originalSource.sourceTimestamp);
  assert.deepEqual(source.provenance, {
    sourceUrl: input.sourceUrl,
    sourceType: input.sourceType,
    sourceItemId: input.sourceItemId,
    accessConstraints: input.accessConstraints,
  });
  assert.equal(source.intent, 'exploratory');
  assert.equal(source.kind, 'original-source');
  for (const field of [
    'summary',
    'hypotheses',
    'suggestions',
    'model',
    'interpretations',
  ])
    assert.equal(Object.hasOwn(source, field), false);
  assert.equal(JSON.stringify(source).includes(interpretation.summary), false);
  assert.equal(routeEvidence(evidence).createsLinearIssue, false);
  assert.equal(Object.hasOwn(evidence, 'admissionAuthorized'), false);
});

test('repeated deliveries converge original and interpretation records regardless of delivery time', () => {
  const first = idea({ interpretations: [interpretation] });
  const replay = idea({
    observedAt: '2026-09-28T00:00:00Z',
    interpretations: [interpretation],
  });
  const merged = convergeEvidence(first, replay);
  assert.equal(merged.id, first.id);
  assert.deepEqual(merged.sourceRevisions, first.sourceRevisions);
  assert.deepEqual(merged.interpretations, first.interpretations);
  assert.deepEqual(getOriginalSource(merged), getOriginalSource(first));
});

test('explicit source revision preserves the original through replay and out-of-order convergence', () => {
  const first = idea({ interpretations: [interpretation] });
  const revised = idea({
    originalSource: {
      ...originalSource,
      text: 'Could a shared sketchbook help remote teams?',
      sourceTimestamp: '2026-09-28T03:30:00Z',
      supersedes: first.sourceRevisions[0].id,
    },
    observedAt: '2026-09-28T04:00:00Z',
    interpretations: [
      { ...interpretation, summary: 'A remote team sketchbook' },
    ],
  });
  const merged = convergeEvidence(first, revised);
  assert.deepEqual(getOriginalSource(merged), first.sourceRevisions[0]);
  assert.deepEqual(
    getOriginalSource(merged, revised.sourceRevisions[0].id),
    revised.sourceRevisions[0]
  );
  assert.equal(merged.sourceRevisions.length, 2);
  assert.equal(merged.interpretations.length, 2);
  assert.deepEqual(
    convergeEvidence(revised, first).sourceRevisions,
    merged.sourceRevisions
  );
  assert.deepEqual(
    convergeEvidence(merged, revised).sourceRevisions,
    merged.sourceRevisions
  );
  assert.deepEqual(
    convergeEvidence(merged, first).interpretations,
    merged.interpretations
  );
  assert.equal(getOriginalSource(merged, 'unknown-revision'), null);
  assert.throws(() => getOriginalSource(revised), /unknown revision/);
});

test('changed wording or provenance must explicitly supersede an existing source revision', () => {
  const first = idea();
  for (const changed of [
    idea({ originalSource: { ...originalSource, text: 'A different idea.' } }),
    idea({ sourceUrl: 'https://example.com/item/42#corrected-source' }),
    idea({ originalSource: { ...originalSource, author: 'corrected-author' } }),
  ]) {
    assert.throws(
      () => convergeEvidence(first, changed),
      /explicit supersedes/
    );
  }
  const dangling = idea({
    originalSource: { ...originalSource, supersedes: 'missing-source' },
  });
  assert.throws(() => convergeEvidence(first, dangling), /unknown revision/);
});

test('multiple model versions retain separate interpretations and never rewrite source facts', () => {
  const first = idea({
    interpretations: [
      { ...interpretation, model: { name: 'example-model', version: '1' } },
    ],
  });
  const second = idea({
    interpretations: [
      { ...interpretation, model: { name: 'example-model', version: '2' } },
      {
        ...interpretation,
        model: { name: 'another-model', version: '1' },
        suggestions: ['Try a paper prototype.'],
      },
    ],
  });
  const merged = convergeEvidence(first, second);
  assert.equal(merged.interpretations.length, 3);
  assert.deepEqual(
    merged.interpretations
      .map(item => `${item.model.name}/${item.model.version}`)
      .sort(),
    ['another-model/1', 'example-model/1', 'example-model/2']
  );
  for (const item of merged.interpretations) {
    assert.equal(item.kind, 'model-interpretation');
    assert.equal(item.sourceRevisionId, first.sourceRevisions[0].id);
    assert.deepEqual(item.hypotheses, interpretation.hypotheses);
  }
  assert.deepEqual(getOriginalSource(merged), getOriginalSource(first));
  assert.equal(merged.problemOpportunity, input.problemOpportunity);
});

test('unknown attribution stays explicit and later attribution appends a distinct interpretation', () => {
  const first = idea({ interpretations: [interpretation] });
  assert.deepEqual(first.interpretations[0].model, {
    name: 'unknown',
    version: 'unknown',
  });
  const second = idea({
    interpretations: [
      { ...interpretation, model: { name: 'example-model' } },
      { ...interpretation, model: { version: 'observed-version' } },
    ],
  });
  const merged = convergeEvidence(first, second);
  assert.equal(merged.interpretations.length, 3);
  assert.deepEqual(
    merged.interpretations
      .map(item => item.model)
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
      ),
    [
      { name: 'example-model', version: 'unknown' },
      { name: 'unknown', version: 'observed-version' },
      { name: 'unknown', version: 'unknown' },
    ]
  );
});

test('interpretation-only events bind to an existing source and reject unknown references', () => {
  const first = idea();
  const incoming = normalizeObservation({
    ...input,
    interpretations: [
      { ...interpretation, sourceRevisionId: first.sourceRevisions[0].id },
    ],
  });
  assert.equal(convergeEvidence(first, incoming).interpretations.length, 1);
  assert.throws(
    () => normalizeObservation({ ...input, interpretations: [interpretation] }),
    /sourceRevisionId/
  );
  const dangling = normalizeObservation({
    ...input,
    interpretations: [
      { ...interpretation, sourceRevisionId: 'missing-source' },
    ],
  });
  assert.throws(
    () => convergeEvidence(first, dangling),
    /unknown source revision/
  );
});

test('source and interpretation records cannot be mutated or silently changed after storage', () => {
  const mutable = { ...originalSource };
  const mutableInterpretation = {
    ...interpretation,
    suggestions: ['Interview one team.'],
  };
  const evidence = idea({
    originalSource: mutable,
    interpretations: [mutableInterpretation],
  });
  mutable.text = 'Overwrite';
  mutableInterpretation.suggestions.push('New suggestion');
  assert.equal(getOriginalSource(evidence).text, originalSource.text);
  assert.equal(evidence.interpretations[0].suggestions.length, 1);
  assert.equal(
    Reflect.set(evidence.sourceRevisions[0], 'text', 'Overwrite'),
    false
  );
  assert.equal(
    Reflect.set(
      evidence.sourceRevisions[0].provenance,
      'sourceUrl',
      'https://example.com/changed'
    ),
    false
  );
  assert.throws(
    () =>
      Array.prototype.push.call(
        evidence.sourceRevisions,
        evidence.sourceRevisions[0]
      ),
    TypeError
  );
  assert.throws(
    () =>
      Array.prototype.push.call(
        evidence.interpretations[0].suggestions,
        'Overwrite'
      ),
    TypeError
  );
  const stored = JSON.parse(JSON.stringify(evidence));
  const retrieved = getOriginalSource(stored);
  stored.sourceRevisions[0].text = 'Tampered';
  assert.equal(retrieved.text, originalSource.text);
  assert.throws(() => getOriginalSource(stored), /immutable content mismatch/);
  assert.throws(
    () => convergeEvidence(evidence, stored),
    /immutable content mismatch/
  );
  const alteredInterpretation = JSON.parse(JSON.stringify(evidence));
  alteredInterpretation.interpretations[0].model.version = 'invented';
  assert.throws(
    () => convergeEvidence(evidence, alteredInterpretation),
    /immutable content mismatch/
  );
});

test('legacy evidence retains its shape and cannot erase preserved content on newer delivery', () => {
  const legacy = normalizeObservation(input);
  assert.equal(Object.hasOwn(legacy, 'sourceRevisions'), false);
  assert.equal(Object.hasOwn(legacy, 'interpretations'), false);
  assert.equal(getOriginalSource(legacy), null);
  const captured = idea({ interpretations: [interpretation] });
  const newer = normalizeObservation({
    ...input,
    observedAt: '2026-10-01T00:00:00Z',
  });
  const merged = convergeEvidence(captured, newer);
  assert.deepEqual(getOriginalSource(merged), getOriginalSource(captured));
  assert.deepEqual(merged.interpretations, captured.interpretations);
  assert.equal(merged.provenance.observedAt, newer.provenance.observedAt);
  assert.deepEqual(
    convergeEvidence(newer, captured).sourceRevisions,
    merged.sourceRevisions
  );
  assert.equal(
    Object.hasOwn(convergeEvidence(legacy, newer), 'sourceRevisions'),
    false
  );
});

test('original capture requires source authorship, timestamp and wording; model text stays typed', () => {
  for (const field of ['text', 'author', 'sourceTimestamp']) {
    assert.throws(
      () => idea({ originalSource: { ...originalSource, [field]: '' } }),
      new RegExp(field)
    );
  }
  assert.throws(
    () =>
      idea({
        originalSource: { ...originalSource, sourceTimestamp: 'not a date' },
      }),
    /sourceTimestamp/
  );
  assert.throws(
    () => idea({ originalSource: { ...originalSource, supersedes: '' } }),
    /supersedes/
  );
  assert.throws(() => idea({ interpretations: {} }), /must be an array/);
  assert.throws(() => idea({ interpretations: [null] }), /must be an object/);
  assert.throws(
    () =>
      idea({ interpretations: [{ ...interpretation, hypotheses: 'untyped' }] }),
    /hypotheses must be an array/
  );
  assert.throws(
    () => idea({ interpretations: [{ ...interpretation, suggestions: [''] }] }),
    /suggestions/
  );
  assert.throws(
    () =>
      idea({ interpretations: [{ ...interpretation, model: { name: 42 } }] }),
    /model.name/
  );
  assert.throws(
    () =>
      idea({
        interpretations: [{ ...interpretation, model: 'provider-name' }],
      }),
    /model must be an object/
  );
  assert.deepEqual(
    idea({
      interpretations: [
        { ...interpretation, model: { name: '  ', version: '' } },
      ],
    }).interpretations[0].model,
    { name: 'unknown', version: 'unknown' }
  );
});

test('source-only hydration projects known source fields even when stored extras have a valid hash', () => {
  const stored = JSON.parse(JSON.stringify(idea()));
  const source = stored.sourceRevisions[0];
  source.summary = 'Model summary accidentally stored on the source';
  source.suggestions = ['A model suggestion'];
  source.provenance.modelNotes = 'Model provenance notes';
  const { id: _id, ...content } = source;
  // Reproduce a valid producer hash for a malformed record, not a tamper error.
  const serialized = JSON.stringify(content, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map(key => [key, value[key]])
        )
      : value
  );
  source.id = `original-source:${createHash('sha256').update(serialized).digest('hex')}`;
  const retrieved = getOriginalSource(stored);
  assert.deepEqual(Object.keys(retrieved).sort(), [
    'author',
    'id',
    'intent',
    'kind',
    'provenance',
    'sourceTimestamp',
    'supersedes',
    'text',
  ]);
  assert.deepEqual(retrieved.provenance, getOriginalSource(idea()).provenance);
  assert.equal(JSON.stringify(retrieved).includes('Model'), false);
});
