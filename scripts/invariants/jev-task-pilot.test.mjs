import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildCorpus } from './fixtures/release-task-corpus.gen.mjs';
import { UNCLASSIFIED_LABEL } from './jev-task-classification.mjs';
import {
  buildPilotReceipt,
  calibrateConcentrationThresholds,
  corpusIntegrityReport,
  loadTaskCorpus,
  main,
  resolveOutcomeAction,
  runCorpusEvaluation,
  summarizeOutcomes,
} from './jev-task-pilot.mjs';

const corpus = loadTaskCorpus(buildCorpus());
const config = JSON.parse(
  readFileSync(
    new URL('./fixtures/release-task-pilot-config.json', import.meta.url),
    'utf8'
  )
);

const THRESHOLDS = Object.freeze({ assign: 0.55, review: 0.35 });

function receiptFor(clusterSlug, concentration, extra = {}) {
  const abstained = clusterSlug === null;
  return {
    status: 'evaluated',
    responseId: 'fx-test',
    inputTokens: 50,
    outputTokens: 8,
    decision: {
      clusterSlug,
      label: clusterSlug ?? UNCLASSIFIED_LABEL,
      abstained,
      concentration,
      probabilities: null,
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
    example.expected === UNCLASSIFIED_LABEL ? null : example.expected,
    0.9
  );

test('summarizeOutcomes reports per-class metrics, abstention, latency and cost', () => {
  const outcomes = outcomesFor(corpus, perfect);
  const metrics = summarizeOutcomes(corpus, outcomes, THRESHOLDS, config);
  assert.equal(metrics.evaluated, corpus.examples.length);
  assert.equal(metrics.unmatched.length, 0);
  assert.equal(metrics.evidenceBasis.executed, corpus.examples.length);
  assert.equal(metrics.evidenceBasis.shadow, 0);
  assert.equal(metrics.macroF1, 1);
  assert.equal(metrics.falseAutoAssignmentRate, 0);
  assert.equal(metrics.correctionRate, 0);
  assert.equal(metrics.unclassifiedRecall, 1);
  assert.equal(metrics.latencyMs.p50, 800);
  assert.equal(metrics.latencyMs.p95, 800);
  assert.equal(metrics.billedCostUsd, null);
  assert.ok(metrics.estimatedCostUsd > 0);
  assert.ok(
    Math.abs(
      metrics.estimatedCostUsd - (corpus.examples.length * 50 * 0.04) / 1e6
    ) < 1e-9
  );

  // Every off-topic example wrongly auto-assigned: protected metric reflects it.
  const bad = outcomesFor(corpus, example =>
    example.expected === UNCLASSIFIED_LABEL
      ? receiptFor('dj-promotion', 0.9)
      : perfect(example)
  );
  const badMetrics = summarizeOutcomes(corpus, bad, THRESHOLDS, config);
  assert.ok(badMetrics.falseAutoAssignmentRate > 0);
  assert.ok(badMetrics.correctionRate > 0);
  assert.ok(badMetrics.unclassifiedRecall < 1);
  assert.ok(badMetrics.perClass['dj-promotion'].precision < 1);
  assert.ok(badMetrics.perClass['unclassified'].recall < 1);

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
      { receipt: receiptFor('dj-promotion', 0.9) },
      THRESHOLDS
    ).action,
    'assign'
  );
  assert.equal(
    resolveOutcomeAction(
      { decision: { action: 'review', clusterSlug: 'lyrics' } },
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
    receipt: receiptFor(
      example.expected === UNCLASSIFIED_LABEL ? null : example.expected,
      example.expected === UNCLASSIFIED_LABEL ? 0.9 : 0.9
    ),
  }));
  const calibrated = calibrateConcentrationThresholds(outcomes, corpus, config);
  assert.ok(calibrated);
  assert.equal(calibrated.calibratedFrom, 'tuning');
  assert.ok(calibrated.assign > calibrated.review);
  assert.notEqual(calibrated.assign, 0.6);
  assert.notEqual(calibrated.assign, 0.7);
  assert.notEqual(calibrated.review, 0.6);
  assert.notEqual(calibrated.review, 0.7);
  // Holdout rows are ignored for calibration.
  const holdoutOnly = corpus.examples
    .filter(e => e.split === 'holdout')
    .map(example => ({ id: example.id, receipt: perfect(example) }));
  assert.equal(
    calibrateConcentrationThresholds(holdoutOnly, corpus, config),
    null
  );
  assert.equal(calibrateConcentrationThresholds([], corpus, config), null);
  // When every concentration is below any workable cap, no calibration.
  const flat = tuning.map(example => ({
    id: example.id,
    receipt: {
      status: 'evaluated',
      decision: {
        clusterSlug:
          example.expected === UNCLASSIFIED_LABEL ? 'dj-promotion' : 'wrong',
        abstained: false,
        concentration: 0.99,
      },
    },
  }));
  const capped = calibrateConcentrationThresholds(flat, corpus, {
    ...config,
    materiality: { maxFalseAutoAssignmentRate: 0 },
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
      receipt.reasons.some(r => r.includes('no executed baseline'))
  );
  assert.equal(receipt.schema, 'jev-task-pilot-disposition/v1');
  assert.equal(receipt.corpusVersion, corpus.version);

  const executedMetrics = summarizeOutcomes(
    corpus,
    outcomesFor(corpus, perfect),
    THRESHOLDS,
    config
  );
  const baseline = Object.freeze({ macroF1: 0.7 });
  const promoted = buildPilotReceipt({
    corpus,
    config,
    thresholds: THRESHOLDS,
    calibration: { assign: 0.55, review: 0.35, calibratedFrom: 'tuning' },
    metrics: executedMetrics,
    baselineMetrics: baseline,
  });
  assert.equal(promoted.disposition, 'promote-candidate');
  assert.ok(promoted.reasons.some(r => r.includes('admits nothing')));

  const retained = buildPilotReceipt({
    corpus,
    config,
    thresholds: THRESHOLDS,
    metrics: executedMetrics,
    baselineMetrics: Object.freeze({ macroF1: 0.999 }),
  });
  assert.equal(retained.disposition, 'inconclusive');
  assert.ok(retained.reasons.some(r => r.includes('delta vs baseline')));

  const breachOutcomes = outcomesFor(corpus, example =>
    example.expected === UNCLASSIFIED_LABEL
      ? receiptFor('dj-promotion', 0.9)
      : perfect(example)
  );
  const breach = buildPilotReceipt({
    corpus,
    config,
    thresholds: THRESHOLDS,
    metrics: summarizeOutcomes(corpus, breachOutcomes, THRESHOLDS, config),
    baselineMetrics: baseline,
  });
  assert.equal(breach.disposition, 'blocked');
  assert.ok(breach.reasons.some(r => r.includes('falseAutoAssignmentRate')));
  assert.ok(breach.reasons.some(r => r.includes('unclassifiedRecall')));
});

test('corpus integrity failures block the disposition', () => {
  const tiny = {
    schema: 'release-task-corpus/v1',
    version: 'test',
    clusterSets: { s: [{ slug: 'a-b', displayName: 'A' }] },
    examples: [
      {
        id: 'e1',
        text: 'x',
        clusterSetId: 's',
        expected: 'a-b',
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
  const sample = {
    ...corpus,
    examples: corpus.examples.slice(0, 3),
  };
  let calls = 0;
  const outcomes = await runCorpusEvaluation(sample, {
    classify: async () => {
      calls += 1;
      return {
        status: 'skipped',
        decision: {
          clusterSlug: null,
          label: UNCLASSIFIED_LABEL,
          abstained: true,
          concentration: null,
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
  // Without approval the real classifier is not-admitted but still safe.
  const real = await runCorpusEvaluation(sample, {
    classify: undefined,
    optionsFor: () => ({}),
  });
  assert.equal(real.length, 3);
  for (const outcome of real) {
    assert.notEqual(outcome.receipt.status, 'evaluated');
  }
});

test('cli emits an inconclusive receipt for fixture-only decisions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jev-pilot-'));
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
    './fixtures/release-task-pilot-config.json',
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
  assert.equal(written.schema, 'jev-task-pilot-disposition/v1');
  assert.equal(written.disposition, 'inconclusive');
  await assert.rejects(() => main(['--corpus', corpusPath]));

  // Executed comparisons with a recorded Haiku baseline can promote.
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
          clusterSlug:
            example.expected === UNCLASSIFIED_LABEL ? null : example.expected,
          autoAssigned: example.expected !== UNCLASSIFIED_LABEL,
          latencyMs: 900,
          executed: true,
        })
      )
      .join('\n')}\n`
  );
  // Baseline macroF1 is computed the same way; identical predictions mean the
  // delta is zero, so this stays inconclusive rather than promoting.
  const withBaseline = await main([
    '--corpus',
    corpusPath,
    '--config',
    configPath,
    '--decisions',
    executedPath,
    '--baseline',
    baselinePath,
  ]);
  assert.equal(withBaseline.disposition, 'inconclusive');
  assert.ok(withBaseline.reasons.some(r => r.includes('delta vs baseline')));
  assert.equal(withBaseline.baselineMetrics.macroF1 > 0.5, true);
});
