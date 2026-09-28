import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildCorpus } from './fixtures/inbox-triage-corpus.gen.mjs';
import {
  buildPilotReceipt,
  calibrateConcentrationThresholds,
  corpusIntegrityReport,
  loadInboxCorpus,
  main,
  resolveOutcomeAction,
  runCorpusEvaluation,
  summarizeOutcomes,
} from './jev-inbox-pilot.mjs';
import { UNCATEGORIZED_LABEL } from './jev-inbox-triage.mjs';

const corpus = loadInboxCorpus(buildCorpus());
const config = JSON.parse(
  readFileSync(
    new URL('./fixtures/inbox-triage-pilot-config.json', import.meta.url),
    'utf8'
  )
);

const THRESHOLDS = Object.freeze({ suggest: 0.55, review: 0.35 });

function receiptFor(category, priority, concentration, extra = {}) {
  const abstained = category === null;
  return {
    status: 'evaluated',
    responseId: 'fx-test',
    inputTokens: 60,
    outputTokens: 8,
    decision: {
      category,
      categoryLabel: category ?? UNCATEGORIZED_LABEL,
      categoryConcentration: concentration,
      categoryProbabilities: null,
      priority,
      priorityLabel: priority ?? UNCATEGORIZED_LABEL,
      priorityConcentration: null,
      priorityProbabilities: null,
      abstained,
    },
    ...extra,
  };
}

function outcomesFor(corpusLike, decide, { executed = true } = {}) {
  return corpusLike.examples.map(example => ({
    id: example.id,
    receipt: decide(example),
    latencyMs: 800,
    executed,
  }));
}

const perfect = example =>
  receiptFor(
    example.expectedCategory === UNCATEGORIZED_LABEL
      ? null
      : example.expectedCategory,
    example.expectedPriority === UNCATEGORIZED_LABEL
      ? null
      : example.expectedPriority,
    0.9
  );

test('versioned corpus loads, is hash-pinned and covers required fixture classes', () => {
  assert.ok(corpus.examples.length >= corpus.targetSize.min);
  assert.ok(corpus.examples.length <= corpus.targetSize.max);
  assert.equal(
    createHash('sha256').update(JSON.stringify(buildCorpus())).digest('hex'),
    config.corpusSha256
  );
  const report = corpusIntegrityReport(corpus, config);
  assert.deepEqual(report.issues, []);
  assert.ok(report.ok);
  for (const tag of config.sufficiency.requiredTags) {
    assert.ok(report.stats.tags[tag] > 0, tag);
  }
  assert.throws(() => loadInboxCorpus({ schema: 'wrong' }));
  const tampered = structuredClone(corpus);
  tampered.examples[0].expectedCategory = 'not-a-category';
  assert.throws(() => loadInboxCorpus(tampered));
  const badPriority = structuredClone(corpus);
  badPriority.examples[0].expectedPriority = 'critical';
  assert.throws(() => loadInboxCorpus(badPriority));
  const dup = structuredClone(corpus);
  dup.examples[1].subject = dup.examples[0].subject;
  dup.examples[1].body = dup.examples[0].body;
  assert.throws(() => loadInboxCorpus(dup));
});

test('summarizeOutcomes reports per-axis metrics, abstention, latency and cost', () => {
  const outcomes = outcomesFor(corpus, perfect);
  const metrics = summarizeOutcomes(corpus, outcomes, THRESHOLDS, config);
  assert.equal(metrics.evaluated, corpus.examples.length);
  assert.equal(metrics.unmatched.length, 0);
  assert.equal(metrics.evidenceBasis.executed, corpus.examples.length);
  assert.equal(metrics.macroF1, 1);
  assert.equal(metrics.priorityAxis.macroF1, 1);
  assert.equal(metrics.falseSuggestionRate, 0);
  assert.equal(metrics.correctionRate, 0);
  assert.equal(metrics.uncategorizedRecall, 1);
  assert.equal(metrics.highValueMissRate, 0);
  assert.equal(metrics.spamOvercaptureRate, 0);
  assert.equal(metrics.latencyMs.p50, 800);
  assert.equal(metrics.latencyMs.p95, 800);
  assert.equal(metrics.billedCostUsd, null);
  assert.ok(metrics.estimatedCostUsd > 0);
  // No incumbent per-email cost recorded: whole-workflow stays null, not zero.
  assert.equal(metrics.incumbentCallRetained, true);
  assert.equal(metrics.estimatedWholeWorkflowCostUsd, null);
  const withIncumbent = summarizeOutcomes(corpus, outcomes, THRESHOLDS, {
    ...config,
    pricingEstimate: {
      ...config.pricingEstimate,
      incumbentCostPerEmailUsd: 0.001,
    },
  });
  assert.ok(
    Math.abs(
      withIncumbent.estimatedWholeWorkflowCostUsd -
        (withIncumbent.estimatedCostUsd + 0.001 * corpus.examples.length)
    ) < 1e-9
  );

  // Every uncategorized example wrongly suggested: protected metrics move.
  const bad = outcomesFor(corpus, example =>
    example.expectedCategory === UNCATEGORIZED_LABEL
      ? receiptFor('spam', 'low', 0.9)
      : perfect(example)
  );
  const badMetrics = summarizeOutcomes(corpus, bad, THRESHOLDS, config);
  assert.ok(badMetrics.falseSuggestionRate > 0);
  assert.ok(badMetrics.correctionRate > 0);
  assert.ok(badMetrics.uncategorizedRecall < 1);
  assert.ok(badMetrics.categoryAxis.perClass.spam.precision < 1);

  // High-priority misses: expected-high predicted low.
  const missHigh = outcomesFor(corpus, example =>
    example.expectedPriority === 'high' &&
    example.expectedCategory !== UNCATEGORIZED_LABEL
      ? receiptFor(example.expectedCategory, 'low', 0.9)
      : perfect(example)
  );
  const missMetrics = summarizeOutcomes(corpus, missHigh, THRESHOLDS, config);
  assert.ok(missMetrics.highValueMissRate > 0);
  assert.ok(missMetrics.priorityAxis.perClass.high.recall < 1);
  assert.equal(missMetrics.macroF1, 1);

  // Legitimate mail overcaptured as spam.
  const overSpam = outcomesFor(corpus, example =>
    example.tags.includes('legit-resembling-spam')
      ? receiptFor('spam', 'low', 0.9)
      : perfect(example)
  );
  const overSpamMetrics = summarizeOutcomes(
    corpus,
    overSpam,
    THRESHOLDS,
    config
  );
  assert.ok(overSpamMetrics.spamOvercaptureRate > 0);

  const partial = summarizeOutcomes(
    corpus,
    [{ id: 'no-such-example', receipt: perfect(corpus.examples[0]) }],
    THRESHOLDS,
    config
  );
  assert.deepEqual(partial.unmatched, ['no-such-example']);
});

test('resolveOutcomeAction handles receipts, recorded decisions and junk', () => {
  assert.equal(
    resolveOutcomeAction(
      { receipt: receiptFor('booking', 'high', 0.9) },
      THRESHOLDS
    ).action,
    'suggest'
  );
  assert.equal(
    resolveOutcomeAction(
      { decision: { action: 'review', category: 'press', priority: 'medium' } },
      THRESHOLDS
    ).action,
    'review'
  );
  assert.equal(
    resolveOutcomeAction({ receipt: null }, THRESHOLDS).action,
    'abstain'
  );
  assert.equal(
    resolveOutcomeAction({}, THRESHOLDS).reason,
    'unresolvable-outcome'
  );
});

test('calibration tunes on tuning split only and never emits legacy cutoffs', () => {
  const tuning = corpus.examples.filter(e => e.split === 'tuning');
  const outcomes = tuning.map(example => ({
    id: example.id,
    receipt: perfect(example),
  }));
  const calibrated = calibrateConcentrationThresholds(outcomes, corpus, config);
  assert.ok(calibrated);
  assert.equal(calibrated.calibratedFrom, 'tuning');
  assert.ok(calibrated.suggest > calibrated.review);
  assert.notEqual(calibrated.suggest, 0.6);
  assert.notEqual(calibrated.suggest, 0.7);
  assert.notEqual(calibrated.review, 0.6);
  assert.notEqual(calibrated.review, 0.7);
  const holdoutOnly = corpus.examples
    .filter(e => e.split === 'holdout')
    .map(example => ({ id: example.id, receipt: perfect(example) }));
  assert.equal(
    calibrateConcentrationThresholds(holdoutOnly, corpus, config),
    null
  );
  assert.equal(calibrateConcentrationThresholds([], corpus, config), null);
  const flat = tuning.map(example => ({
    id: example.id,
    receipt: {
      status: 'evaluated',
      decision: {
        category: 'spam',
        abstained: false,
        categoryConcentration: 0.99,
      },
    },
  }));
  const capped = calibrateConcentrationThresholds(flat, corpus, {
    ...config,
    materiality: { maxFalseSuggestionRate: 0 },
  });
  assert.equal(capped, null);
});

test('disposition distinguishes shadow observations from executed comparisons', () => {
  const shadowOutcomes = outcomesFor(corpus, perfect, { executed: false });
  const shadowMetrics = summarizeOutcomes(
    corpus,
    shadowOutcomes,
    THRESHOLDS,
    config
  );
  const receipt = buildPilotReceipt({
    corpus,
    config,
    thresholds: THRESHOLDS,
    calibration: null,
    metrics: shadowMetrics,
  });
  assert.equal(receipt.disposition, 'inconclusive');
  assert.ok(
    receipt.reasons.some(r => r.includes('executed comparisons')) &&
      receipt.reasons.some(r => r.includes('no executed baseline')) &&
      receipt.reasons.some(r => r.includes('whole-workflow cost'))
  );
  assert.equal(receipt.schema, 'jev-inbox-pilot-disposition/v1');
  assert.equal(receipt.issue, 'JOV-6421');
  assert.equal(receipt.corpusVersion, corpus.version);

  const executedMetrics = summarizeOutcomes(
    corpus,
    outcomesFor(corpus, perfect),
    THRESHOLDS,
    {
      ...config,
      pricingEstimate: {
        ...config.pricingEstimate,
        incumbentCostPerEmailUsd: 0.001,
      },
    }
  );
  const baseline = Object.freeze({ macroF1: 0.7 });
  const cfgCost = {
    ...config,
    pricingEstimate: {
      ...config.pricingEstimate,
      incumbentCostPerEmailUsd: 0.001,
    },
  };
  const promoted = buildPilotReceipt({
    corpus,
    config: cfgCost,
    thresholds: THRESHOLDS,
    calibration: { suggest: 0.55, review: 0.35, calibratedFrom: 'tuning' },
    metrics: executedMetrics,
    baselineMetrics: baseline,
  });
  assert.equal(promoted.disposition, 'promote-candidate');
  assert.ok(promoted.reasons.some(r => r.includes('admits nothing')));

  const retained = buildPilotReceipt({
    corpus,
    config: cfgCost,
    thresholds: THRESHOLDS,
    metrics: executedMetrics,
    baselineMetrics: Object.freeze({ macroF1: 0.999 }),
  });
  assert.equal(retained.disposition, 'inconclusive');
  assert.ok(retained.reasons.some(r => r.includes('delta vs baseline')));

  // High-value miss breach blocks.
  const missHigh = outcomesFor(corpus, example =>
    example.expectedPriority === 'high' &&
    example.expectedCategory !== UNCATEGORIZED_LABEL
      ? receiptFor(example.expectedCategory, 'low', 0.9)
      : perfect(example)
  );
  const breach = buildPilotReceipt({
    corpus,
    config: cfgCost,
    thresholds: THRESHOLDS,
    metrics: summarizeOutcomes(corpus, missHigh, THRESHOLDS, cfgCost),
    baselineMetrics: baseline,
  });
  assert.equal(breach.disposition, 'blocked');
  assert.ok(breach.reasons.some(r => r.includes('highValueMissRate')));
});

test('corpus integrity failures block the disposition', () => {
  const tiny = {
    schema: 'inbox-triage-corpus/v1',
    version: 'test',
    examples: [
      {
        id: 'e1',
        subject: 'x',
        body: 'y',
        expectedCategory: 'booking',
        expectedPriority: 'high',
        split: 'tuning',
        tags: [],
      },
    ],
  };
  const report = corpusIntegrityReport(tiny, config);
  assert.equal(report.ok, false);
  const receipt = buildPilotReceipt({
    corpus: tiny,
    config,
    thresholds: THRESHOLDS,
    metrics: summarizeOutcomes(tiny, [], THRESHOLDS, config),
  });
  assert.equal(receipt.disposition, 'blocked');
});

test('runCorpusEvaluation makes no paid call without admission options', async () => {
  const sample = { ...corpus, examples: corpus.examples.slice(0, 3) };
  let calls = 0;
  const outcomes = await runCorpusEvaluation(sample, {
    classify: async () => {
      calls += 1;
      return {
        status: 'skipped',
        decision: {
          category: null,
          categoryLabel: UNCATEGORIZED_LABEL,
          priority: null,
          priorityLabel: UNCATEGORIZED_LABEL,
          abstained: true,
          categoryConcentration: null,
        },
      };
    },
  });
  assert.equal(outcomes.length, 3);
  assert.equal(calls, 3);
  for (const outcome of outcomes) {
    assert.equal(outcome.executed, false);
    assert.ok(Number.isFinite(outcome.latencyMs));
  }
  const real = await runCorpusEvaluation(sample, {
    optionsFor: () => ({}),
  });
  assert.equal(real.length, 3);
  for (const outcome of real) {
    assert.notEqual(outcome.receipt.status, 'evaluated');
  }
});

test('cli emits an inconclusive receipt for fixture-only decisions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jev-inbox-pilot-'));
  const decisionsPath = join(dir, 'decisions.jsonl');
  const outPath = join(dir, 'receipt.json');
  const lines = corpus.examples
    .map(example =>
      JSON.stringify({
        id: example.id,
        receipt: perfect(example),
        latencyMs: 800,
        executed: false,
      })
    )
    .join('\n');
  writeFileSync(decisionsPath, `${lines}\n`);
  const corpusPath = join(dir, 'corpus.json');
  writeFileSync(corpusPath, JSON.stringify(buildCorpus()));
  const configPath = new URL(
    './fixtures/inbox-triage-pilot-config.json',
    import.meta.url
  ).pathname;
  const receipt = await main([
    '--corpus',
    corpusPath,
    '--config',
    configPath,
    '--decisions',
    decisionsPath,
    '--baseline',
    join(dir, 'baseline.jsonl'),
    '--out',
    outPath,
  ]).catch(err => err);
  assert.ok(receipt instanceof Error); // baseline file missing
  await main([
    '--corpus',
    corpusPath,
    '--config',
    configPath,
    '--decisions',
    decisionsPath,
    '--out',
    outPath,
  ]);
  const written = JSON.parse(readFileSync(outPath, 'utf8'));
  assert.equal(written.schema, 'jev-inbox-pilot-disposition/v1');
  assert.equal(written.disposition, 'inconclusive');
  await assert.rejects(() => main(['--corpus', corpusPath]));

  // Executed comparisons with a recorded Haiku baseline stay inconclusive when
  // predictions are identical — delta is zero.
  const executedPath = join(dir, 'executed.jsonl');
  writeFileSync(
    executedPath,
    `${corpus.examples
      .map(example =>
        JSON.stringify({
          id: example.id,
          receipt: perfect(example),
          latencyMs: 800,
          executed: true,
        })
      )
      .join('\n')}\n`
  );
  const baselinePath = join(dir, 'baseline.jsonl');
  writeFileSync(
    baselinePath,
    `${corpus.examples
      .map(example =>
        JSON.stringify({
          id: example.id,
          category:
            example.expectedCategory === UNCATEGORIZED_LABEL
              ? null
              : example.expectedCategory,
          priority:
            example.expectedPriority === UNCATEGORIZED_LABEL
              ? null
              : example.expectedPriority,
          latencyMs: 900,
          executed: true,
        })
      )
      .join('\n')}\n`
  );
  const cfgPath2 = join(dir, 'config.json');
  writeFileSync(
    cfgPath2,
    JSON.stringify({
      ...config,
      pricingEstimate: {
        ...config.pricingEstimate,
        incumbentCostPerEmailUsd: 0.001,
      },
    })
  );
  const withBaseline = await main([
    '--corpus',
    corpusPath,
    '--config',
    cfgPath2,
    '--decisions',
    executedPath,
    '--baseline',
    baselinePath,
  ]);
  assert.equal(withBaseline.disposition, 'inconclusive');
  assert.ok(withBaseline.reasons.some(r => r.includes('delta vs baseline')));
  assert.equal(withBaseline.baselineMetrics.macroF1 > 0.5, true);
});
