import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  EVAL_INPUT as baseInput,
  buildCorpus,
  buildPilotConfig,
  labeledOutcome as labeled,
  outcomesFor,
  receiptFor,
  transportResult,
} from './fixtures/inbox-triage-corpus.gen.mjs';
import {
  buildPilotReceipt,
  corpusIntegrityReport,
  loadInboxCorpus,
  summarizeOutcomes,
} from './jev-inbox-pilot.mjs';
import {
  buildInboxTriageState,
  classifyInboxEmail,
  decideInboxTriage,
  INBOX_CATEGORIES,
  INBOX_PRIORITIES,
  INBOX_TRIAGE_SCHEMA,
  INBOX_TRIAGE_STAGE,
  interpretInboxTriage,
  prepareInboxTriageRequest,
  UNCATEGORIZED_LABEL,
  validateInboxTriageThresholds,
} from './jev-inbox-triage.mjs';

const corpus = loadInboxCorpus(buildCorpus());
const config = buildPilotConfig();
const THRESHOLDS = Object.freeze({ suggest: 0.55, review: 0.35 });
const cfgWithIncumbentCost = {
  ...config,
  pricingEstimate: {
    ...config.pricingEstimate,
    incumbentCostPerEmailUsd: 0.001,
  },
};

const admittedOptions = () => {
  const { request } = prepareInboxTriageRequest(baseInput);
  return {
    approval: {
      fingerprint: request.fingerprint,
      dataApproved: true,
      fundingApproved: true,
      expiresAt: 2000,
      authorityRef: 'test-only',
      availableUsd: 1,
      maxUsd: 0.01,
      estimatedUpperBoundUsd: 0.001,
    },
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
  };
};

const perfectOutcomes = opts => outcomesFor(corpus, labeled, opts);

test('request carries two bounded choice questions over the fixed enums', () => {
  const { request } = prepareInboxTriageRequest(baseInput);
  assert.equal(request.schema, INBOX_TRIAGE_SCHEMA);
  assert.equal(request.stage, INBOX_TRIAGE_STAGE);
  for (const [question, labels] of [
    [request.questions.category, INBOX_CATEGORIES],
    [request.questions.priority, INBOX_PRIORITIES],
  ]) {
    assert.equal(question.type, 'choice');
    assert.deepEqual(
      Object.keys(question.criteria).sort(),
      [...labels, UNCATEGORIZED_LABEL].sort()
    );
  }
  assert.ok(request.state.includes('<<<email'));
  assert.ok(request.state.includes('Festival booking for April'));
  assert.notEqual(
    prepareInboxTriageRequest({ ...baseInput, subject: 'Different subject' })
      .request.fingerprint,
    request.fingerprint
  );
  for (const bad of [
    { ...baseInput, subject: '', bodyText: '' },
    { ...baseInput, sourceSha: 'main' },
  ]) {
    assert.throws(() => prepareInboxTriageRequest(bad));
  }
});

test('sender address never enters state and inline addresses are redacted', () => {
  const redacted = {
    ...baseInput,
    fromName: 'Dana <dana>',
    subject: 'Reach me at artist@nowhere.test please',
    bodyText: 'Call me. My assistant is ops@nowhere.test. Booking for June.',
  };
  for (const state of [
    buildInboxTriageState(redacted),
    prepareInboxTriageRequest(redacted).request.state,
  ]) {
    assert.ok(!state.includes('@nowhere.test'));
    assert.ok(state.includes('[email]'));
  }
});

test('empty email content never reaches the evaluator', async () => {
  let calls = 0;
  const options = {
    transport: async () => {
      calls += 1;
      return transportResult();
    },
  };
  for (const input of [
    { ...baseInput, subject: '', bodyText: '' },
    { ...baseInput, subject: '   ', bodyText: null },
    { ...baseInput, subject: null, bodyText: '   ' },
    { ...baseInput, sourceSha: 'not-a-sha' },
  ]) {
    const receipt = await classifyInboxEmail(
      /** @type {any} */ (input),
      options
    );
    assert.equal(receipt.status, 'skipped');
    assert.equal(receipt.evaluatorCalls, 0);
  }
  assert.equal(calls, 0);
});

test('labels outside the enums invalidate instead of producing unroutable output', async () => {
  const options = admittedOptions();
  for (const result of [
    transportResult({ category: 'made-up' }),
    transportResult({ priority: 'critical' }),
    { ...transportResult(), warnings: [{}] },
    { ...transportResult(), response: { modelId: 'other/model' } },
    {
      ...transportResult(),
      answers: {
        category: { type: 'boolean', choice: 'booking' },
        priority: { type: 'choice', choice: 'high' },
      },
    },
    null,
  ]) {
    const receipt = await classifyInboxEmail(baseInput, {
      ...options,
      transport: async () => result,
    });
    assert.equal(receipt.status, 'invalid-response');
    assert.equal(receipt.certified, false);
    assert.equal(receipt.decision, undefined);
  }
});

test('evaluated decisions carry concentration and never certification', async () => {
  const receipt = await classifyInboxEmail(baseInput, {
    ...admittedOptions(),
    transport: async () => transportResult(),
  });
  assert.equal(receipt.status, 'evaluated');
  assert.equal(receipt.schema, INBOX_TRIAGE_SCHEMA);
  assert.equal(receipt.evaluatorCalls, 1);
  assert.deepEqual(
    [
      receipt.decision.category,
      receipt.decision.priority,
      receipt.decision.abstained,
      receipt.decision.categoryConcentration,
    ],
    ['booking', 'high', false, 0.8]
  );
  assert.equal(receipt.certified, false);
  assert.equal(receipt.humanCertified, false);
  assert.equal(receipt.billedCostUsd, null);
  const abstain = await classifyInboxEmail(baseInput, {
    ...admittedOptions(),
    transport: async () =>
      transportResult({
        category: UNCATEGORIZED_LABEL,
        priority: UNCATEGORIZED_LABEL,
      }),
  });
  assert.ok(
    abstain.decision.abstained &&
      abstain.decision.category === null &&
      abstain.decision.priority === null
  );

  // Malformed probability payloads yield unavailable concentration, not junk.
  const malformed = transportResult({ category: 'press', priority: 'low' });
  malformed.answers.category.probabilities = /** @type {any} */ ('nope');
  malformed.answers.priority.probabilities = /** @type {any} */ ({
    low: 'high',
  });
  const read = interpretInboxTriage(malformed);
  assert.equal(read.invalid, undefined);
  assert.equal(read.detail.decision.categoryConcentration, null);
  assert.equal(read.detail.decision.priorityConcentration, null);
  assert.equal(read.detail.decision.category, 'press');
  assert.equal(read.detail.decision.priority, 'low');
});

test('timeout, cancellation and admission failures stay fail-closed', async () => {
  const options = admittedOptions();
  let calls = 0;
  const unadmitted = await classifyInboxEmail(baseInput, {
    ...options,
    approval: null,
    transport: async () => {
      calls += 1;
      return transportResult();
    },
  });
  assert.equal(unadmitted.status, 'not-admitted');
  assert.equal(calls, 0);
  const pre = new AbortController();
  pre.abort();
  const cases = /** @type {Array<[Record<string, unknown>, string]>} */ ([
    [{ signal: pre.signal }, 'cancelled'],
    [{ timeoutMs: 5, transport: () => new Promise(() => {}) }, 'timeout'],
    [
      {
        transport: async () => {
          throw new Error('Bearer raw-provider-error');
        },
      },
      'provider-error',
    ],
  ]);
  for (const [overrides, status] of cases) {
    const receipt = await classifyInboxEmail(baseInput, {
      ...options,
      ...overrides,
    });
    assert.equal(receipt.status, status);
  }
  assert.ok(
    !JSON.stringify(
      await classifyInboxEmail(baseInput, {
        ...options,
        transport: async () => {
          throw new Error('raw-secret-marker');
        },
      })
    ).includes('raw-secret-marker')
  );
  assert.equal(decideInboxTriage(unadmitted, THRESHOLDS).action, 'abstain');
});

test('concentration thresholds reject legacy cutoffs and gate actions', () => {
  for (const bad of [
    null,
    {},
    { suggest: 0.7, review: 0.3 },
    { suggest: 0.9, review: 0.6 },
    { suggest: 0.5, review: 0.7 },
    { suggest: 1.2, review: 0.2 },
    { suggest: '0.8', review: 0.3 },
  ]) {
    assert.throws(() =>
      validateInboxTriageThresholds(/** @type {any} */ (bad))
    );
  }
  const evaluated = decision =>
    Object.freeze({
      status: 'evaluated',
      decision: Object.freeze({ abstained: false, ...decision }),
    });
  for (const [concentration, expected] of [
    [0.9, 'suggest'],
    [0.4, 'review'],
    [0.1, 'abstain'],
    [null, 'review'],
  ]) {
    const action = decideInboxTriage(
      evaluated({
        category: 'booking',
        categoryConcentration: concentration,
        priority: 'high',
      }),
      THRESHOLDS
    );
    assert.equal(action.action, expected);
  }
  for (const receipt of [
    evaluated({
      category: null,
      priority: null,
      abstained: true,
      categoryConcentration: null,
    }),
    null,
    { status: 'timeout' },
    { status: 'skipped', decision: {} },
  ]) {
    assert.equal(decideInboxTriage(receipt, THRESHOLDS).action, 'abstain');
  }
});

test('versioned corpus loads, is hash-pinned and covers required fixture classes', () => {
  assert.equal(
    createHash('sha256').update(JSON.stringify(buildCorpus())).digest('hex'),
    config.corpusSha256
  );
  const report = corpusIntegrityReport(corpus, config);
  assert.ok(report.ok && report.issues.length === 0);
  for (const tag of config.sufficiency.requiredTags) {
    assert.ok(report.stats.tags[tag] > 0, tag);
  }
  for (const mutate of [
    c => (c.schema = 'wrong'),
    c => (c.version = ''),
    c => (c.examples = null),
    c => (c.examples[0].split = 'nope'),
    c => (c.examples[0].expectedCategory = 'not-a-category'),
    c => (c.examples[0].expectedPriority = 'critical'),
    c => {
      c.examples[1].subject = c.examples[0].subject;
      c.examples[1].body = c.examples[0].body;
    },
  ]) {
    const tampered = structuredClone(corpus);
    mutate(tampered);
    assert.throws(() => loadInboxCorpus(tampered));
  }
});

test('summarizeOutcomes reports per-axis metrics, abstention, latency and cost', () => {
  const metrics = summarizeOutcomes(
    corpus,
    perfectOutcomes(),
    THRESHOLDS,
    config
  );
  assert.equal(metrics.evaluated, corpus.examples.length);
  assert.deepEqual(metrics.unmatched, []);
  assert.equal(metrics.evidenceBasis.executed, corpus.examples.length);
  for (const [key, expected] of /** @type {Array<[string, unknown]>} */ ([
    ['macroF1', 1],
    ['falseSuggestionRate', 0],
    ['correctionRate', 0],
    ['uncategorizedRecall', 1],
    ['highValueMissRate', 0],
    ['spamOvercaptureRate', 0],
    ['billedCostUsd', null],
    ['incumbentCallRetained', true],
    ['estimatedWholeWorkflowCostUsd', null],
  ])) {
    assert.equal(metrics[key], expected, key);
  }
  assert.equal(metrics.priorityAxis.macroF1, 1);
  assert.equal(metrics.latencyMs.p50, 800);
  assert.equal(metrics.latencyMs.p95, 800);

  assert.ok(metrics.estimatedCostUsd > 0);
  // No incumbent per-email cost recorded: whole-workflow stays null, not zero.
  const withIncumbent = summarizeOutcomes(
    corpus,
    perfectOutcomes(),
    THRESHOLDS,
    cfgWithIncumbentCost
  );
  assert.ok(
    Math.abs(
      withIncumbent.estimatedWholeWorkflowCostUsd -
        (withIncumbent.estimatedCostUsd + 0.001 * corpus.examples.length)
    ) < 1e-9
  );

  // Protected metrics move on targeted failure modes.
  const missHigh = example =>
    example.expectedPriority === 'high' &&
    example.expectedCategory !== UNCATEGORIZED_LABEL
      ? receiptFor(example.expectedCategory, 'low', 0.9)
      : labeled(example);
  const scenarioMetrics = decide =>
    summarizeOutcomes(corpus, outcomesFor(corpus, decide), THRESHOLDS, config);
  const wrongCategory = example =>
    example.expectedCategory === UNCATEGORIZED_LABEL
      ? receiptFor('spam', 'low', 0.9)
      : labeled(example);
  const badMetrics = scenarioMetrics(wrongCategory);
  assert.ok(badMetrics.falseSuggestionRate > 0);
  assert.ok(badMetrics.correctionRate > 0);
  assert.ok(badMetrics.uncategorizedRecall < 1);
  assert.ok(badMetrics.categoryAxis.perClass.spam.precision < 1);
  const missMetrics = scenarioMetrics(missHigh);
  assert.ok(missMetrics.highValueMissRate > 0);
  assert.ok(missMetrics.priorityAxis.perClass.high.recall < 1);
  assert.equal(missMetrics.macroF1, 1);
  assert.ok(
    scenarioMetrics(example =>
      example.tags.includes('legit-resembling-spam')
        ? receiptFor('spam', 'low', 0.9)
        : labeled(example)
    ).spamOvercaptureRate > 0
  );
  const partial = summarizeOutcomes(
    corpus,
    [
      { id: 'no-such-example', receipt: labeled(corpus.examples[0]) },
      {
        id: corpus.examples[0].id,
        decision: { action: 'review', category: 'press', priority: 'medium' },
      },
      { id: corpus.examples[1].id, receipt: null },
      { id: corpus.examples[2].id },
    ],
    THRESHOLDS,
    config
  );
  assert.deepEqual(partial.unmatched, ['no-such-example']);
  assert.equal(partial.evaluated, 3);
  assert.equal(partial.reviewRate, 1 / 3);
});

test('disposition distinguishes shadow observations from executed comparisons', () => {
  const summarize = (outcomes, cfg = config) =>
    summarizeOutcomes(corpus, outcomes, THRESHOLDS, cfg);
  const receipt = buildPilotReceipt({
    corpus,
    config,
    thresholds: THRESHOLDS,
    metrics: summarize(perfectOutcomes({ executed: false })),
  });
  assert.equal(receipt.disposition, 'inconclusive');
  assert.ok(
    receipt.reasons.some(r => r.includes('executed comparisons')) &&
      receipt.reasons.some(r => r.includes('no executed baseline')) &&
      receipt.reasons.some(r => r.includes('whole-workflow cost'))
  );
  assert.equal(receipt.schema, 'jev-inbox-pilot-disposition/v1');
  assert.equal(receipt.issue, 'JOV-6421');

  const executedMetrics = summarize(perfectOutcomes(), cfgWithIncumbentCost);
  const promoted = buildPilotReceipt({
    corpus,
    config: cfgWithIncumbentCost,
    thresholds: THRESHOLDS,
    metrics: executedMetrics,
    baselineMetrics: Object.freeze({ macroF1: 0.7 }),
  });
  assert.equal(promoted.disposition, 'promote-candidate');
  assert.ok(promoted.reasons.some(r => r.includes('admits nothing')));
  const deltaMissed = buildPilotReceipt({
    corpus,
    config: cfgWithIncumbentCost,
    thresholds: THRESHOLDS,
    metrics: executedMetrics,
    baselineMetrics: Object.freeze({ macroF1: 0.999 }),
  });
  assert.equal(deltaMissed.disposition, 'inconclusive');
  assert.ok(deltaMissed.reasons.some(r => r.includes('delta vs baseline')));

  // Non-finite baseline macroF1 yields no delta — the model is retained.
  assert.equal(
    buildPilotReceipt({
      corpus,
      config: cfgWithIncumbentCost,
      thresholds: THRESHOLDS,
      metrics: executedMetrics,
      baselineMetrics: Object.freeze({}),
    }).disposition,
    'retain'
  );
  assert.ok(
    buildPilotReceipt({
      corpus,
      config,
      thresholds: null,
      metrics: executedMetrics,
    }).reasons.includes('no calibrated thresholds')
  );

  // High-value miss breach blocks.
  const breach = buildPilotReceipt({
    corpus,
    config: cfgWithIncumbentCost,
    thresholds: THRESHOLDS,
    metrics: summarize(
      outcomesFor(corpus, example =>
        example.expectedPriority === 'high' &&
        example.expectedCategory !== UNCATEGORIZED_LABEL
          ? receiptFor(example.expectedCategory, 'low', 0.9)
          : labeled(example)
      ),
      cfgWithIncumbentCost
    ),
    baselineMetrics: Object.freeze({ macroF1: 0.7 }),
  });
  assert.equal(breach.disposition, 'blocked');
  assert.ok(breach.reasons.some(r => r.includes('highValueMissRate')));

  // Corpus integrity failure blocks outright.
  const ex = {
    id: 'e1',
    subject: 'x',
    body: 'y',
    expectedCategory: 'booking',
    expectedPriority: 'high',
    split: 'tuning',
    tags: [],
  };
  const tiny = {
    schema: 'inbox-triage-corpus/v1',
    version: 'test',
    // e2 shares e1's text in the other split: exercises the overlap check.
    examples: [ex, { ...ex, id: 'e2', split: 'holdout' }],
  };
  const report = corpusIntegrityReport(tiny, config);
  assert.equal(report.ok, false);
  assert.ok(report.issues.some(i => i.includes('overlap')));
  assert.equal(
    buildPilotReceipt({
      corpus: tiny,
      config,
      thresholds: THRESHOLDS,
      metrics: summarizeOutcomes(tiny, [], THRESHOLDS, config),
    }).disposition,
    'blocked'
  );
});
