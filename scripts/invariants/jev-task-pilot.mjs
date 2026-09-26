/**
 * Shadow pilot harness for Jev release-task cluster classification (JOV-6420).
 *
 * Loads the versioned corpus, applies calibrated concentration thresholds to
 * recorded decision receipts, and reports per-class precision/recall,
 * abstention, false auto-assignment, correction rate, latency and attributable
 * cost. It distinguishes executed Gateway comparisons from fixture/shadow
 * observations and emits an exact-version disposition receipt
 * (retain | promote-candidate | blocked | inconclusive). Nothing here changes
 * a production decision; promotion still requires the existing admission
 * controls, monitoring, rollback and authorized funding.
 *
 * CLI: node jev-task-pilot.mjs --corpus <corpus.json> --config <config.json>
 *        --decisions <receipts.jsonl> [--baseline <haiku.jsonl>] [--out file]
 * Decision rows: {"id","receipt"|"decision","latencyMs","executed":bool,
 *   "clusterSlug"?:string|null,"confidence"?:number,"threshold"?:number}
 * Baseline rows (Haiku path): {"id","clusterSlug","confidence","autoAssigned"?:bool}
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  classifyReleaseTaskCluster,
  decideTaskClusterAssignment,
  UNCLASSIFIED_LABEL,
  validateTaskClusterThresholds,
} from './jev-task-classification.mjs';

export const PILOT_RECEIPT_SCHEMA = 'jev-task-pilot-disposition/v1';
export const CORPUS_SCHEMA = 'release-task-corpus/v1';

const PILOT_IMPLEMENTATION_SHA256 = createHash('sha256')
  .update(readFileSync(new URL(import.meta.url)))
  .digest('hex');

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Load and freeze the versioned corpus. Throws on structural violations. */
export function loadTaskCorpus(raw) {
  const corpus = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isObject(corpus) || corpus.schema !== CORPUS_SCHEMA) {
    throw new Error('corpus schema mismatch');
  }
  if (typeof corpus.version !== 'string' || !corpus.version.trim()) {
    throw new Error('corpus version required');
  }
  if (!isObject(corpus.clusterSets) || !Array.isArray(corpus.examples)) {
    throw new Error('corpus needs clusterSets and examples');
  }
  const ids = new Set();
  const texts = new Set();
  for (const example of corpus.examples) {
    if (
      !isObject(example) ||
      typeof example.id !== 'string' ||
      ids.has(example.id) ||
      typeof example.text !== 'string' ||
      !example.text.trim() ||
      !Array.isArray(corpus.clusterSets[example.clusterSetId]) ||
      (example.split !== 'tuning' && example.split !== 'holdout')
    ) {
      throw new Error(`invalid corpus example: ${String(example?.id)}`);
    }
    ids.add(example.id);
    const known =
      example.expected === UNCLASSIFIED_LABEL ||
      corpus.clusterSets[example.clusterSetId].some(
        c => c.slug === example.expected
      );
    if (!known) {
      throw new Error(
        `expected label not in cluster set for ${example.id}: ${String(example.expected)}`
      );
    }
    const key = `${example.clusterSetId}::${example.text.trim().toLowerCase()}`;
    if (texts.has(key)) {
      throw new Error(`duplicate text within cluster set: ${example.id}`);
    }
    texts.add(key);
  }
  return corpus;
}

/** Corpus statistics and sufficiency check against the predeclared config. */
export function corpusIntegrityReport(corpus, config) {
  const stats = { total: 0, tuning: 0, holdout: 0, perExpected: {}, tags: {} };
  const splitText = { tuning: new Set(), holdout: new Set() };
  for (const example of corpus.examples) {
    stats.total += 1;
    stats[example.split] += 1;
    stats.perExpected[example.expected] =
      (stats.perExpected[example.expected] ?? 0) + 1;
    for (const tag of example.tags ?? []) {
      stats.tags[tag] = (stats.tags[tag] ?? 0) + 1;
    }
    splitText[example.split].add(
      `${example.clusterSetId}::${example.text.trim().toLowerCase()}`
    );
  }
  const s = config?.sufficiency ?? {};
  const issues = [];
  if (stats.total < (s.minCorpusSize ?? 0)) {
    issues.push(`corpus too small: ${stats.total}`);
  }
  if (stats.tuning < (s.minTuningExamples ?? 0)) {
    issues.push(`tuning split too small: ${stats.tuning}`);
  }
  if (stats.holdout < (s.minHoldoutExamples ?? 0)) {
    issues.push(`holdout split too small: ${stats.holdout}`);
  }
  for (const tag of s.requiredTags ?? []) {
    if (!stats.tags[tag]) issues.push(`missing required tag: ${tag}`);
  }
  for (const [expected, count] of Object.entries(stats.perExpected)) {
    if (count < (s.minExamplesPerExpectedClass ?? 0)) {
      issues.push(`class ${expected} has only ${count} examples`);
    }
  }
  // Tuning and holdout must never share an example text under the same set.
  const overlap = [...splitText.tuning].filter(k => splitText.holdout.has(k));
  if (overlap.length > 0) {
    issues.push(`tuning/holdout text overlap: ${overlap.length}`);
  }
  return Object.freeze({ ok: issues.length === 0, issues, stats });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[idx];
}

/**
 * Resolve one recorded outcome to a concrete action. `executed` marks a real
 * authorized Gateway comparison; fixture/shadow transports stay shadow-only.
 */
export function resolveOutcomeAction(outcome, thresholds) {
  if (isObject(outcome.receipt) && typeof outcome.receipt.status === 'string') {
    return decideTaskClusterAssignment(outcome.receipt, thresholds);
  }
  // Precomputed decision rows (e.g. recorded shadow output) pass through.
  if (
    isObject(outcome.decision) &&
    typeof outcome.decision.action === 'string'
  ) {
    return outcome.decision;
  }
  return Object.freeze({
    action: 'abstain',
    clusterSlug: null,
    reason: 'unresolvable-outcome',
  });
}

/**
 * Summarize a set of outcomes against corpus expectations.
 * @param {Array<{id: string, receipt?: object, decision?: object, latencyMs?: number, executed?: boolean}>} outcomes
 */
export function summarizeOutcomes(corpus, outcomes, thresholds, config) {
  const byId = new Map(corpus.examples.map(e => [e.id, e]));
  const perClass = {};
  let assigned = 0;
  let correctAssign = 0;
  let wrongAssign = 0;
  let abstained = 0;
  let review = 0;
  let unclassifiedSupport = 0;
  let unclassifiedCorrect = 0;
  let executed = 0;
  let shadow = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const latencies = [];
  const unmatched = [];

  for (const outcome of outcomes) {
    const example = byId.get(outcome.id);
    if (!example) {
      unmatched.push(outcome.id);
      continue;
    }
    const action = resolveOutcomeAction(outcome, thresholds);
    const expected = example.expected;
    const receipt = outcome.receipt;
    if (outcome.executed === true && receipt?.status === 'evaluated') {
      executed += 1;
    } else {
      shadow += 1;
    }
    if (Number.isFinite(receipt?.inputTokens))
      inputTokens += receipt.inputTokens;
    if (Number.isFinite(receipt?.outputTokens))
      outputTokens += receipt.outputTokens;
    if (Number.isFinite(outcome.latencyMs)) latencies.push(outcome.latencyMs);

    if (action.action === 'assign') {
      assigned += 1;
      if (action.clusterSlug === expected) correctAssign += 1;
      else wrongAssign += 1;
    } else if (action.action === 'review') {
      review += 1;
    } else {
      abstained += 1;
    }
    if (expected === UNCLASSIFIED_LABEL) {
      unclassifiedSupport += 1;
      if (action.action !== 'assign') unclassifiedCorrect += 1;
    }

    // Per-class bookkeeping on the concrete cluster axis. 'review:' predictions
    // count as a false negative for the class and as review workload.
    const predClass =
      action.action === 'assign' ? action.clusterSlug : UNCLASSIFIED_LABEL;
    const classes = new Set([expected, predClass]);
    for (const cls of classes) {
      perClass[cls] ??= { support: 0, tp: 0, fp: 0, fn: 0 };
    }
    perClass[expected].support += 1;
    if (predClass === expected) {
      perClass[expected].tp += 1;
    } else {
      perClass[expected].fn += 1;
      perClass[predClass].fp += 1;
    }
  }

  const latSorted = [...latencies].sort((a, b) => a - b);
  const perClassMetrics = {};
  let f1Sum = 0;
  let f1Classes = 0;
  for (const [cls, m] of Object.entries(perClass)) {
    const precision = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0;
    const recall = m.support > 0 ? m.tp / m.support : 0;
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;
    perClassMetrics[cls] = {
      support: m.support,
      precision,
      recall,
      f1,
    };
    if (m.support > 0) {
      f1Sum += f1;
      f1Classes += 1;
    }
  }
  const total = outcomes.length - unmatched.length;
  const pricing = config?.pricingEstimate ?? {};
  const estimatedCostUsd =
    (Number.isFinite(pricing.jevInputPerMillionUsd)
      ? (inputTokens / 1e6) * pricing.jevInputPerMillionUsd
      : 0) +
    (Number.isFinite(pricing.jevOutputPerMillionUsd)
      ? (outputTokens / 1e6) * pricing.jevOutputPerMillionUsd
      : 0);

  return Object.freeze({
    evaluated: total,
    unmatched,
    evidenceBasis: Object.freeze({ executed, shadow }),
    perClass: Object.freeze(perClassMetrics),
    macroF1: f1Classes > 0 ? f1Sum / f1Classes : 0,
    abstentionRate: total > 0 ? abstained / total : 0,
    reviewRate: total > 0 ? review / total : 0,
    autoAssignRate: total > 0 ? assigned / total : 0,
    falseAutoAssignmentRate: total > 0 ? wrongAssign / total : 0,
    correctionRate: assigned > 0 ? wrongAssign / assigned : 0,
    assignPrecision: assigned > 0 ? correctAssign / assigned : null,
    unclassifiedRecall:
      unclassifiedSupport > 0
        ? unclassifiedCorrect / unclassifiedSupport
        : null,
    latencyMs: Object.freeze({
      p50: percentile(latSorted, 50),
      p95: percentile(latSorted, 95),
      n: latSorted.length,
    }),
    usage: Object.freeze({ inputTokens, outputTokens }),
    billedCostUsd: null,
    estimatedCostUsd,
    estimatedCostPerDecisionUsd: total > 0 ? estimatedCostUsd / total : null,
  });
}

/**
 * Calibrate assign/review concentration thresholds on tuning outcomes only.
 * Chooses the smallest assign threshold that keeps the false-auto-assignment
 * rate under the materiality cap, maximizing correct assignments; review is
 * set to half of assign. Returns null when there is no usable concentration
 * data. Never returns the Haiku 0.6/0.7 confidence cutoffs.
 */
export function calibrateConcentrationThresholds(
  tuningOutcomes,
  corpus,
  config
) {
  const byId = new Map(corpus.examples.map(e => [e.id, e]));
  const rows = [];
  for (const outcome of tuningOutcomes) {
    const example = byId.get(outcome.id);
    const decision = outcome?.receipt?.decision;
    if (!example || example.split !== 'tuning') continue;
    if (!isObject(decision) || decision.concentration === null) continue;
    rows.push({
      expected: example.expected,
      clusterSlug: decision.clusterSlug,
      abstained: decision.abstained === true,
      concentration: decision.concentration,
    });
  }
  if (rows.length === 0) return null;
  const cap = config?.materiality?.maxFalseAutoAssignmentRate ?? 0.02;
  let best = null;
  for (let a = 0.3; a <= 0.95; a += 0.01) {
    const assign = Math.round(a * 100) / 100;
    let wrong = 0;
    let correct = 0;
    for (const row of rows) {
      if (row.abstained || row.clusterSlug === null) continue;
      if (row.concentration < assign) continue;
      if (row.clusterSlug === row.expected) correct += 1;
      else wrong += 1;
    }
    const falseRate = rows.length > 0 ? wrong / rows.length : 0;
    if (falseRate > cap) continue;
    if (!best || correct > best.correct) {
      best = { assign, correct, falseRate };
    }
  }
  if (!best) return null;
  const thresholds = validateTaskClusterThresholds({
    assign: best.assign,
    review: Math.round((best.assign / 2) * 100) / 100,
  });
  return Object.freeze({
    ...thresholds,
    calibratedFrom: 'tuning',
    sampleSize: rows.length,
    falseAutoAssignmentRateAtAssign: best.falseRate,
  });
}

function withinBand(value, [lo, hi]) {
  return Number.isFinite(value) && value >= lo && value <= hi;
}

/**
 * Exact-version pilot disposition receipt.
 * disposition: 'retain' | 'promote-candidate' | 'blocked' | 'inconclusive'
 */
export function buildPilotReceipt({
  corpus,
  config,
  thresholds,
  calibration,
  metrics,
  baselineMetrics = null,
}) {
  const integrity = corpusIntegrityReport(corpus, config);
  const reasons = [];
  const m = config?.materiality ?? {};
  const p = config?.protectedLimits ?? {};

  if (!integrity.ok) {
    for (const issue of integrity.issues) reasons.push(`corpus: ${issue}`);
  }
  if (!thresholds) {
    reasons.push('no calibrated thresholds');
  }
  if (metrics.unmatched.length > 0) {
    reasons.push(`${metrics.unmatched.length} outcomes matched no example`);
  }
  if (metrics.evaluated < (config?.sufficiency?.minCorpusSize ?? 0)) {
    reasons.push(`only ${metrics.evaluated} matched outcomes`);
  }
  if (
    metrics.evidenceBasis.executed <
    (config?.sufficiency?.minExecutedComparisons ?? 0)
  ) {
    reasons.push(
      `executed comparisons ${metrics.evidenceBasis.executed} < ${config?.sufficiency?.minExecutedComparisons}; shadow observations only`
    );
  }

  const protectedBreaches = [];
  if (metrics.falseAutoAssignmentRate > (m.maxFalseAutoAssignmentRate ?? 1)) {
    protectedBreaches.push(
      `falseAutoAssignmentRate ${metrics.falseAutoAssignmentRate} > ${m.maxFalseAutoAssignmentRate}`
    );
  }
  if (
    metrics.unclassifiedRecall !== null &&
    metrics.unclassifiedRecall < (p.unclassifiedRecallMin ?? 0)
  ) {
    protectedBreaches.push(
      `unclassifiedRecall ${metrics.unclassifiedRecall} < ${p.unclassifiedRecallMin}`
    );
  }

  const materialityMisses = [];
  if (metrics.macroF1 < (m.minMacroF1 ?? 0)) {
    materialityMisses.push(`macroF1 ${metrics.macroF1} < ${m.minMacroF1}`);
  }
  if (metrics.correctionRate > (m.maxCorrectionRate ?? 1)) {
    materialityMisses.push(
      `correctionRate ${metrics.correctionRate} > ${m.maxCorrectionRate}`
    );
  }
  if (!withinBand(metrics.abstentionRate, m.abstentionBand ?? [0, 1])) {
    materialityMisses.push(
      `abstentionRate outside ${JSON.stringify(m.abstentionBand)}`
    );
  }
  if (
    metrics.latencyMs.p95 !== null &&
    metrics.latencyMs.p95 > (m.maxP95LatencyMs ?? Infinity)
  ) {
    materialityMisses.push(
      `p95 ${metrics.latencyMs.p95} > ${m.maxP95LatencyMs}`
    );
  }
  if (
    metrics.estimatedCostPerDecisionUsd !== null &&
    metrics.estimatedCostPerDecisionUsd >
      (m.maxEstimatedCostPerDecisionUsd ?? Infinity)
  ) {
    materialityMisses.push(
      `estimatedCostPerDecisionUsd ${metrics.estimatedCostPerDecisionUsd} > ${m.maxEstimatedCostPerDecisionUsd}`
    );
  }

  const baselineDelta =
    baselineMetrics && Number.isFinite(baselineMetrics.macroF1)
      ? metrics.macroF1 - baselineMetrics.macroF1
      : null;
  if (baselineMetrics === null) {
    reasons.push('no executed baseline comparison supplied');
  } else if (
    baselineDelta !== null &&
    baselineDelta < (m.minMacroF1DeltaVsBaseline ?? 0)
  ) {
    reasons.push(
      `macroF1 delta vs baseline ${baselineDelta} < ${m.minMacroF1DeltaVsBaseline}`
    );
  }

  let disposition;
  if (!integrity.ok || protectedBreaches.length > 0) {
    disposition = 'blocked';
    reasons.push(...protectedBreaches);
  } else if (
    reasons.length > 0 ||
    materialityMisses.length > 0 ||
    baselineMetrics === null
  ) {
    disposition = 'inconclusive';
    reasons.push(...materialityMisses);
  } else if (
    baselineDelta !== null &&
    baselineDelta >= (m.minMacroF1DeltaVsBaseline ?? 0)
  ) {
    disposition = 'promote-candidate';
    reasons.push(
      'promotion still requires existing admission controls, monitoring, rollback and authorized funding; this receipt admits nothing'
    );
  } else {
    disposition = 'retain';
  }

  return Object.freeze({
    schema: PILOT_RECEIPT_SCHEMA,
    issue: 'JOV-6420',
    corpusVersion: corpus.version,
    corpusSha256: hashJson(corpus),
    configSha256: hashJson(config),
    implementationSha256: PILOT_IMPLEMENTATION_SHA256,
    thresholds: thresholds ?? null,
    calibration: calibration ?? null,
    disposition,
    reasons: Object.freeze(reasons),
    metrics,
    baselineMetrics: baselineMetrics ?? null,
    sufficiencyNote:
      config?.sufficiency?.rareEventNote ??
      'corpus size alone is not proof of rare-event safety',
  });
}

/**
 * Run the corpus through the classifier seam. The caller supplies per-example
 * admission options (approval, fingerprints, transport); without them every
 * example is a non-admitted shadow observation and no paid call is made.
 */
export async function runCorpusEvaluation(
  corpus,
  {
    optionsFor,
    classify = classifyReleaseTaskCluster,
    now = () => Date.now(),
  } = {}
) {
  const outcomes = [];
  for (const example of corpus.examples) {
    const clusters = corpus.clusterSets[example.clusterSetId];
    const started = now();
    const receipt = await classify(
      {
        sourceSha: example.sourceSha ?? '0'.repeat(40),
        artifactSha256: hashJson(example.text).padEnd(64, '0').slice(0, 64),
        scope: `release-task-corpus ${corpus.version} ${example.id}`,
        taskText: example.text,
        clusters,
      },
      optionsFor?.(example) ?? {}
    );
    outcomes.push({
      id: example.id,
      receipt,
      latencyMs: now() - started,
      executed:
        receipt?.status === 'evaluated' &&
        typeof receipt?.responseId === 'string',
    });
  }
  return Object.freeze(outcomes);
}

function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i === -1 ? null : argv[i + 1];
}

function readJsonl(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

export async function main(argv = process.argv.slice(2)) {
  const corpusPath = argValue(argv, '--corpus');
  const configPath = argValue(argv, '--config');
  const decisionsPath = argValue(argv, '--decisions');
  if (!corpusPath || !configPath || !decisionsPath) {
    throw new Error('--corpus, --config and --decisions are required');
  }
  const corpus = loadTaskCorpus(readFileSync(corpusPath, 'utf8'));
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const outcomes = readJsonl(decisionsPath);
  const baselinePath = argValue(argv, '--baseline');
  const baselineRows = baselinePath ? readJsonl(baselinePath) : null;

  const tuning = outcomes.filter(
    o => corpus.examples.find(e => e.id === o.id)?.split === 'tuning'
  );
  const calibration = calibrateConcentrationThresholds(tuning, corpus, config);
  const thresholds =
    calibration ??
    validateTaskClusterThresholds({
      assign: config.thresholdPriors.assign,
      review: config.thresholdPriors.review,
    });

  // Baseline rows reuse the existing Haiku semantics: auto-assigned only when
  // a slug was returned at/above the caller's auto-cluster threshold.
  let baselineMetrics = null;
  if (baselineRows) {
    baselineMetrics = summarizeOutcomes(
      corpus,
      baselineRows.map(row => ({
        id: row.id,
        decision: Object.freeze(
          row.autoAssigned === true && typeof row.clusterSlug === 'string'
            ? { action: 'assign', clusterSlug: row.clusterSlug }
            : { action: 'abstain', clusterSlug: null }
        ),
        latencyMs: row.latencyMs,
        executed: row.executed === true,
      })),
      thresholds,
      config
    );
  }

  const metrics = summarizeOutcomes(corpus, outcomes, thresholds, config);
  const receipt = buildPilotReceipt({
    corpus,
    config,
    thresholds,
    calibration,
    metrics,
    baselineMetrics,
  });
  const outPath = argValue(argv, '--out');
  const json = `${JSON.stringify(receipt, null, 2)}\n`;
  if (outPath) writeFileSync(outPath, json);
  else process.stdout.write(json);
  return receipt;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
