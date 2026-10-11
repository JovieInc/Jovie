import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertNoPrivateLeakage,
  classifyIntakeEvent,
  decideCandidate,
  isSourceStale,
  loadRegistry,
  normalizeDemandSignal,
  normalizeReleaseEvidence,
  reconcileRun,
  recordRun,
  selectQueue,
  validateRegistry,
} from './inbound-loop.mjs';

const registry = loadRegistry();

const demandInput = {
  sourceType: 'customer-question',
  privateSourceRef: 'private://support/thread-9917',
  publicSummary: 'Creators ask how to verify payout status before a release',
  observedAt: '2026-09-30T12:00:00Z',
  accessConstraints: 'anonymized; internal-only provenance',
  stream: 'customer-problem-solving',
  audience: 'independent artists',
  readerJob: 'confirm a payout cleared before announcing a release',
  canonicalEntity: 'payout-status',
  expectedBenefit: 'fewer failed announcement-day payouts',
  canonicalDestination: '/help/payouts',
  cta: 'connect payout account',
  effort: 'small',
  confidence: 0.7,
};

const releaseInput = {
  sourceType: 'verified-release-record',
  publicSourceRef: 'https://github.com/JovieInc/jovie/releases/tag/v2026.10.01',
  observedAt: '2026-10-01T00:00:00Z',
  accessConstraints: 'public',
  problem: 'Creators could not preview release pages before publishing',
  affectedAudience: 'independent artists preparing a launch',
  publicAvailability: 'available to all workspaces as of v2026.10.01',
  reproducibleEvidence:
    'recorded fixture release-preview.mov plus release notes',
  limitations: 'mobile editing not included',
  testedExample: 'apps/eve-pilot fixtures release-preview demo',
  permittedTechnicalDetail: 'public release notes and docs only',
  stream: 'launch-tutorial',
  audience: 'releasing artists',
  readerJob: 'preview a release page before making it public',
  canonicalEntity: 'release-preview',
  expectedBenefit: 'higher-quality launches with fewer corrections',
  canonicalDestination: '/changelog',
  effort: 'medium',
  confidence: 0.8,
};

const corpus = [
  {
    dedupeKey:
      'independent-artists::confirm-a-payout-cleared-before-announcing-a-release::payout-status',
    canonicalEntity: 'payout-status',
    readerJob: 'confirm a payout cleared before announcing a release',
    url: '/blog/payout-status',
    materiallyChanged: false,
  },
];

test('escaped private references cannot bypass public-artifact leakage checks', () => {
  for (const reference of [
    'C:\\private\\thread-9917',
    'private "quote"',
    'private\nthread',
  ]) {
    assert.throws(
      () =>
        assertNoPrivateLeakage(
          { nested: [{ summary: `source ${reference}` }] },
          [reference]
        ),
      /private source record leaked/
    );
  }
});

test('incomplete corpus entries do not crash matching against later complete records', () => {
  const candidate = normalizeDemandSignal(demandInput, registry);
  const result = decideCandidate(candidate, {
    registry,
    now: Date.parse('2026-10-01T00:00:00Z'),
    existingContent: [{ url: '/blog/other', dedupeKey: 'other' }, ...corpus],
  });
  assert.equal(result.decision, 'update-or-merge');
  assert.ok('existingUrl' in result);
  assert.equal(result.existingUrl, corpus[0].url);
});

test('punctuation-only inputs never produce colliding empty dedupe keys', () => {
  assert.throws(
    () =>
      normalizeDemandSignal(
        { ...demandInput, canonicalEntity: '---' },
        registry
      ),
    /normalized key part/
  );
});

test('invalid queue timestamps and contradictory run outcomes are rejected explicitly', () => {
  assert.throws(
    () => reconcileRun({ oldestActiveCandidateAt: 'invalid-date' }),
    /oldestActiveCandidateAt/
  );
  assert.throws(
    () => recordRun({}, { ok: true, disable: true }),
    /successful run.*disable/
  );
});

test('registry encodes the operating contract', () => {
  assert.equal(validateRegistry(registry), true);
  assert.equal(registry.queue.maxActiveCandidates, 3);
  assert.equal(registry.triggerPolicy.periodicLlmCrawl, false);
  assert.deepEqual(registry.readerStreams, [
    'customer-problem-solving',
    'launch-tutorial',
    'engineering-oss-research',
    'creator-release-discovery',
  ]);
});

test('demand signals require provenance, access constraints, and authorized adapters', () => {
  for (const field of [
    'privateSourceRef',
    'publicSummary',
    'accessConstraints',
  ]) {
    assert.throws(
      () => normalizeDemandSignal({ ...demandInput, [field]: '' }, registry),
      new RegExp(field)
    );
  }
  assert.throws(
    () =>
      normalizeDemandSignal(
        { ...demandInput, sourceType: 'private-dm-scrape' },
        registry
      ),
    /not permitted/
  );
});

test('release candidates require a complete evidence packet', () => {
  for (const field of [
    'problem',
    'publicAvailability',
    'reproducibleEvidence',
    'limitations',
    'testedExample',
    'permittedTechnicalDetail',
  ]) {
    assert.throws(
      () =>
        normalizeReleaseEvidence({ ...releaseInput, [field]: '' }, registry),
      new RegExp(field)
    );
  }
  const candidate = normalizeReleaseEvidence(releaseInput, registry);
  assert.equal(candidate.kind, 'release');
  assert.equal(candidate.stream, 'launch-tutorial');
});

test('dedup collapses on audience, reader job, and canonical entity rather than spelling', () => {
  const a = normalizeDemandSignal(demandInput, registry);
  const b = normalizeDemandSignal(
    {
      ...demandInput,
      readerJob: 'Confirm a payout cleared BEFORE announcing a release.',
    },
    registry
  );
  assert.equal(a.id, b.id);
});

test('decisions: duplicate becomes update-or-merge, material change refreshes, stale disables', () => {
  const candidate = normalizeDemandSignal(demandInput, registry);
  const now = Date.parse('2026-10-02T00:00:00Z');
  assert.equal(
    decideCandidate(candidate, { existingContent: corpus, now, registry })
      .decision,
    'update-or-merge'
  );
  const changed = corpus.map(c => ({ ...c, materiallyChanged: true }));
  assert.equal(
    decideCandidate(candidate, { existingContent: changed, now, registry })
      .decision,
    'refresh'
  );
  const stale = normalizeDemandSignal(
    { ...demandInput, observedAt: '2026-01-01T00:00:00Z' },
    registry
  );
  const staleDecision = decideCandidate(stale, { now, registry });
  assert.equal(staleDecision.decision, 'defer');
  assert.equal(staleDecision.active, false);
  assert.equal(isSourceStale(stale, registry.freshness, now), true);
});

test('bounded queue keeps at most three active candidates and empty is valid', () => {
  const now = Date.parse('2026-10-02T00:00:00Z');
  const make = (entity, confidence) =>
    normalizeDemandSignal(
      { ...demandInput, canonicalEntity: entity, confidence },
      registry
    );
  const queue = selectQueue(
    [make('a', 0.9), make('b', 0.8), make('c', 0.7), make('d', 0.6)],
    { now, registry }
  );
  assert.equal(queue.active.length, 3);
  assert.equal(queue.overflow.length, 1);
  assert.equal(queue.active[0].candidate.canonicalEntity, 'a');
  const empty = selectQueue([], { now, registry });
  assert.equal(empty.active.length, 0);
});

test('intake is event-driven; clocks only run authorized reconciliation', () => {
  assert.equal(
    classifyIntakeEvent({ class: 'demand-signal-new-or-changed' }, registry)
      .disposition,
    'process-now'
  );
  assert.equal(
    classifyIntakeEvent({ class: 'release-verified' }, registry).disposition,
    'process-now'
  );
  assert.equal(
    classifyIntakeEvent({ class: 'clock-fired' }, registry).disposition,
    'reject'
  );
  assert.equal(
    classifyIntakeEvent(
      { class: 'clock-fired', scheduled: 'daily-reconciliation' },
      registry
    ).disposition,
    'reconcile'
  );
  assert.equal(
    classifyIntakeEvent({ class: 'periodic-llm-crawl' }, registry).disposition,
    'reject'
  );
});

test('run state persists last success, failures, queue age, and disable controls', () => {
  let state = {};
  state = recordRun(state, { ok: true, attemptedAt: '2026-10-01T00:00:00Z' });
  state = recordRun(state, {
    ok: false,
    delivered: false,
    attemptedAt: '2026-10-01T06:00:00Z',
    reason: 'delivery-failed',
  });
  assert.equal(state.lastSuccessfulRunAt, '2026-10-01T00:00:00Z');
  assert.equal(state.consecutiveFailures, 1);
  assert.equal(state.missedDeliveries, 1);
  const recon = reconcileRun(
    { ...state, oldestActiveCandidateAt: '2026-09-20T00:00:00Z' },
    { now: Date.parse('2026-10-02T00:00:00Z') }
  );
  assert.equal(recon.needsReprioritization, true);
  state = recordRun(state, {
    ok: true,
    recovered: true,
    attemptedAt: '2026-10-02T00:00:00Z',
  });
  assert.equal(state.missedDeliveries, 0);
  assert.equal(state.consecutiveFailures, 0);
});

test('private source records never appear in public artifacts', () => {
  const candidate = normalizeDemandSignal(demandInput, registry);
  const publicArtifact = {
    title: 'Confirm payout status before a release',
    summary: candidate.source.publicSummary,
  };
  assert.equal(
    assertNoPrivateLeakage(publicArtifact, [candidate.source.privateSourceRef]),
    true
  );
  assert.throws(() =>
    assertNoPrivateLeakage(
      { summary: 'thread-9917 private://support/thread-9917' },
      [candidate.source.privateSourceRef]
    )
  );
});

test('legacy corpus fallback deduplicates only a complete matching audience, reader job and entity', () => {
  const candidate = normalizeDemandSignal(demandInput, registry);
  const legacy = {
    ...corpus[0],
    dedupeKey: undefined,
    audience: demandInput.audience,
  };
  const decide = entry =>
    decideCandidate(candidate, {
      registry,
      now: Date.parse('2026-10-01T00:00:00Z'),
      existingContent: [entry],
    });
  assert.equal(decide(legacy).decision, 'update-or-merge');
  for (const audience of ['labels', undefined, '---']) {
    assert.notEqual(
      decide({ ...legacy, audience }).decision,
      'update-or-merge'
    );
  }
  assert.equal(
    decide({ ...legacy, audience: 'Independent ARTISTS.' }).decision,
    'update-or-merge'
  );
});
