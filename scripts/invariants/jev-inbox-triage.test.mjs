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
  const approval = {
    fingerprint: request.fingerprint,
    dataApproved: true,
    fundingApproved: true,
    expiresAt: 2000,
    authorityRef: 'test-only',
    availableUsd: 1,
    maxUsd: 0.01,
    estimatedUpperBoundUsd: 0.001,
  };
  return {
    approval,
    readCurrentFingerprint: () => request.fingerprint,
    now: () => 1000,
  };
};

const perfectOutcomes = opts => outcomesFor(corpus, labeled, opts);
const classify = (options, transport) =>
  classifyInboxEmail(baseInput, {
    ...admittedOptions(),
    ...options,
    transport,
  });
const summarize = (outcomes, cfg = config) =>
  summarizeOutcomes(corpus, outcomes, THRESHOLDS, cfg);

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
  const state = prepareInboxTriageRequest(redacted).request.state;
  assert.ok(!state.includes('@nowhere.test'));
  assert.ok(state.includes('[email]'));
  assert.ok(buildInboxTriageState(redacted).includes('[email]'));
});

test('empty email content never reaches the evaluator', async () => {
  let calls = 0;
  const receipt = await classifyInboxEmail(
    { ...baseInput, subject: '', bodyText: '' },
    {
      transport: async () => {
        calls += 1;
        return transportResult();
      },
    }
  );
  assert.equal(receipt.status, 'skipped');
  assert.equal(receipt.evaluatorCalls, 0);
  assert.equal(calls, 0);
});

test('labels outside the enums invalidate instead of producing unroutable output', async () => {
  const classifyResult = result => classify({}, async () => result);
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
    const receipt = await classifyResult(result);
    assert.equal(receipt.status, 'invalid-response');
    assert.equal(receipt.certified, false);
    assert.equal(receipt.decision, undefined);
  }
});

test('evaluated decisions carry concentration and never certification', async () => {
  const receipt = await classify({}, async () => transportResult());
  assert.equal(receipt.status, 'evaluated');
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
  const abstain = await classify({}, async () =>
    transportResult({
      category: UNCATEGORIZED_LABEL,
      priority: UNCATEGORIZED_LABEL,
    })
  );
  assert.ok(abstain.decision.abstained);

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
});

test('timeout, cancellation and admission failures stay fail-closed', async () => {
  let calls = 0;
  const unadmitted = await classify({ approval: null }, async () => {
    calls += 1;
    return transportResult();
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
    const { transport, ...rest } = overrides;
    const receipt = await classify(rest, transport);
    assert.equal(receipt.status, status);
  }
  const leaked = await classify({}, async () => {
    throw new Error('raw-secret-marker');
  });
  assert.ok(!JSON.stringify(leaked).includes('raw-secret-marker'));
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
  for (const [concentration, expected] of [
    [0.9, 'suggest'],
    [0.4, 'review'],
    [0.1, 'abstain'],
    [null, 'review'],
  ]) {
    assert.equal(
      decideInboxTriage(
        receiptFor('booking', 'high', concentration),
        THRESHOLDS
      ).action,
      expected
    );
  }
  for (const receipt of [
    receiptFor(null, null, null),
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
  assert.ok(
    config.sufficiency.requiredTags.every(t => report.stats.tags[t] > 0)
  );
  for (const mutate of [
    c => (c.schema = 'wrong'),
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
  const metrics = summarize(perfectOutcomes());
  assert.equal(metrics.evaluated, corpus.examples.length);
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
  assert.ok(metrics.estimatedCostUsd > 0);
  // No incumbent per-email cost recorded: whole-workflow stays null, not zero.
  const withIncumbent = summarize(perfectOutcomes(), cfgWithIncumbentCost);
  assert.ok(
    Math.abs(
      withIncumbent.estimatedWholeWorkflowCostUsd -
        (withIncumbent.estimatedCostUsd + 0.001 * corpus.examples.length)
    ) < 1e-9
  );

  // Protected metrics move on targeted failure modes.
  const scenario = decide => summarize(outcomesFor(corpus, decide));
  const missHigh = example =>
    example.expectedPriority === 'high' &&
    example.expectedCategory !== UNCATEGORIZED_LABEL
      ? receiptFor(example.expectedCategory, 'low', 0.9)
      : labeled(example);
  const wrongCategory = example =>
    example.expectedCategory === UNCATEGORIZED_LABEL
      ? receiptFor('spam', 'low', 0.9)
      : labeled(example);
  const bad = scenario(wrongCategory);
  assert.ok(
    bad.falseSuggestionRate > 0 &&
      bad.uncategorizedRecall < 1 &&
      bad.categoryAxis.perClass.spam.precision < 1
  );
  const miss = scenario(missHigh);
  assert.ok(miss.highValueMissRate > 0);
  assert.ok(miss.priorityAxis.perClass.high.recall < 1);
  assert.ok(
    scenario(example =>
      example.tags.includes('legit-resembling-spam')
        ? receiptFor('spam', 'low', 0.9)
        : labeled(example)
    ).spamOvercaptureRate > 0
  );
  const partial = summarize([
    { id: 'no-such-example', receipt: labeled(corpus.examples[0]) },
    {
      id: corpus.examples[0].id,
      decision: { action: 'review', category: 'press', priority: 'medium' },
    },
    { id: corpus.examples[1].id, receipt: null },
    { id: corpus.examples[2].id },
  ]);
  assert.deepEqual(partial.unmatched, ['no-such-example']);
  assert.equal(partial.evaluated, 3);
  assert.equal(partial.reviewRate, 1 / 3);
});

test('disposition distinguishes shadow observations from executed comparisons', () => {
  const R = (metrics, cfg = config, baselineMetrics = null) =>
    buildPilotReceipt({
      corpus,
      config: cfg,
      thresholds: THRESHOLDS,
      metrics,
      baselineMetrics,
    });
  const executedMetrics = summarize(perfectOutcomes(), cfgWithIncumbentCost);
  const baseline = Object.freeze({ macroF1: 0.7 });
  const cases = [
    // shadow-only evidence: no executed comparisons, no baseline, no cost
    [
      summarize(perfectOutcomes({ executed: false })),
      config,
      baseline,
      'inconclusive',
    ],
    [executedMetrics, cfgWithIncumbentCost, baseline, 'promote-candidate'],
    [executedMetrics, cfgWithIncumbentCost, { macroF1: 0.999 }, 'inconclusive'],
    // non-finite baseline macroF1 yields no delta — the model is retained
    [executedMetrics, cfgWithIncumbentCost, {}, 'retain'],
    // high-value miss breach blocks
    [
      summarize(
        outcomesFor(corpus, example =>
          example.expectedPriority === 'high' &&
          example.expectedCategory !== UNCATEGORIZED_LABEL
            ? receiptFor(example.expectedCategory, 'low', 0.9)
            : labeled(example)
        ),
        cfgWithIncumbentCost
      ),
      cfgWithIncumbentCost,
      baseline,
      'blocked',
    ],
  ];
  for (const [metrics, cfg, bl, expected] of cases) {
    assert.equal(R(metrics, cfg, bl).disposition, expected);
  }
  assert.equal(
    buildPilotReceipt({
      corpus,
      config,
      thresholds: null,
      metrics: executedMetrics,
    }).reasons.includes('no calibrated thresholds'),
    true
  );

  // Corpus integrity failure blocks outright: e2 shares e1's text across splits.
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
    examples: [ex, { ...ex, id: 'e2', split: 'holdout' }],
  };
  assert.equal(corpusIntegrityReport(tiny, config).ok, false);
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
