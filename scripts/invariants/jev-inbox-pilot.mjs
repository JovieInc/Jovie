/**
 * Shadow evaluation harness for Jev artist-inbox triage (JOV-6421).
 *
 * Loads the versioned inbox corpus, applies calibrated concentration
 * thresholds to recorded decision receipts, and reports per-class
 * precision/recall on the category and priority axes, high-value-message
 * miss rate, correction rate, abstention, p50/p95 latency and attributable
 * cost. It distinguishes executed Gateway comparisons from fixture/shadow
 * observations and emits an exact-version disposition receipt
 * (retain | promote-candidate | blocked | inconclusive). Nothing here changes
 * a production decision; the artist confirmation gate is preserved and
 * promotion still requires the existing admission controls, monitoring,
 * rollback and authorized funding.
 *
 * Cost honesty: the incumbent Haiku call still runs for free-form summary,
 * territory, date, budget and organization extraction whenever Jev supplies
 * only the bounded category/priority labels. `estimatedWholeWorkflowCostUsd`
 * therefore counts BOTH calls once `incumbentCostPerEmailUsd` is filled from
 * recorded baseline usage; it stays null (not zero) until then.
 *
 * CLI: node jev-inbox-pilot.mjs --corpus <corpus.json> --config <config.json>
 *        --decisions <receipts.jsonl> [--baseline <haiku.jsonl>] [--out file]
 * Decision rows: {"id","receipt"|"decision","latencyMs","executed":bool}
 * Baseline rows (Haiku path): {"id","category","priority","confidence"?:number}
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  classifyInboxEmail,
  decideInboxTriage,
  INBOX_CATEGORIES,
  INBOX_PRIORITIES,
  UNCATEGORIZED_LABEL,
  validateInboxTriageThresholds,
} from './jev-inbox-triage.mjs';

export const PILOT_RECEIPT_SCHEMA = 'jev-inbox-pilot-disposition/v1';
export const CORPUS_SCHEMA = 'inbox-triage-corpus/v1';

const PILOT_IMPLEMENTATION_SHA256 = createHash('sha256')
  .update(readFileSync(new URL(import.meta.url)))
  .digest('hex');

const VALID_CATEGORIES = new Set([...INBOX_CATEGORIES, UNCATEGORIZED_LABEL]);
const VALID_PRIORITIES = new Set([...INBOX_PRIORITIES, UNCATEGORIZED_LABEL]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Load and freeze the versioned corpus. Throws on structural violations. */
export function loadInboxCorpus(raw) {
  const corpus = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isObject(corpus) || corpus.schema !== CORPUS_SCHEMA) {
    throw new Error('corpus schema mismatch');
  }
  if (typeof corpus.version !== 'string' || !corpus.version.trim()) {
    throw new Error('corpus version required');
  }
  if (!Array.isArray(corpus.examples)) {
    throw new Error('corpus needs examples');
  }
  const ids = new Set();
  const texts = new Set();
  for (const example of corpus.examples) {
    if (
      !isObject(example) ||
      typeof example.id !== 'string' ||
      ids.has(example.id) ||
      typeof example.subject !== 'string' ||
      typeof example.body !== 'string' ||
      (example.split !== 'tuning' && example.split !== 'holdout')
    ) {
      throw new Error(`invalid corpus example: ${String(example?.id)}`);
    }
    ids.add(example.id);
    if (!VALID_CATEGORIES.has(example.expectedCategory)) {
      throw new Error(
        `expected category not in enum for ${example.id}: ${String(example.expectedCategory)}`
      );
    }
    if (!VALID_PRIORITIES.has(example.expectedPriority)) {
      throw new Error(
        `expected priority not in enum for ${example.id}: ${String(example.expectedPriority)}`
      );
    }
    const key = `${example.subject.trim().toLowerCase()}::${example.body.trim().toLowerCase()}`;
    if (texts.has(key)) {
      throw new Error(`duplicate text: ${example.id}`);
    }
    texts.add(key);
  }
  return corpus;
}

/** Corpus statistics and sufficiency check against the predeclared config. */
export function corpusIntegrityReport(corpus, config) {
  const stats = {
    total: 0,
    tuning: 0,
    holdout: 0,
    perCategory: {},
    perPriority: {},
    tags: {},
  };
  const splitText = { tuning: new Set(), holdout: new Set() };
  for (const example of corpus.examples) {
    stats.total += 1;
    stats[example.split] += 1;
    stats.perCategory[example.expectedCategory] =
      (stats.perCategory[example.expectedCategory] ?? 0) + 1;
    stats.perPriority[example.expectedPriority] =
      (stats.perPriority[example.expectedPriority] ?? 0) + 1;
    for (const tag of example.tags ?? []) {
      stats.tags[tag] = (stats.tags[tag] ?? 0) + 1;
    }
    splitText[example.split].add(
      `${example.subject.trim().toLowerCase()}::${example.body.trim().toLowerCase()}`
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
  for (const [expected, count] of Object.entries(stats.perCategory)) {
    if (count < (s.minExamplesPerExpectedCategory ?? 0)) {
      issues.push(`category ${expected} has only ${count} examples`);
    }
  }
  for (const [expected, count] of Object.entries(stats.perPriority)) {
    if (count < (s.minExamplesPerExpectedPriority ?? 0)) {
      issues.push(`priority ${expected} has only ${count} examples`);
    }
  }
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
    return decideInboxTriage(outcome.receipt, thresholds);
  }
  if (
    isObject(outcome.decision) &&
    typeof outcome.decision.action === 'string'
  ) {
    return outcome.decision;
  }
  return Object.freeze({
    action: 'abstain',
    category: null,
    priority: null,
    reason: 'unresolvable-outcome',
  });
}

function bumpClass(perClass, cls) {
  perClass[cls] ??= { support: 0, tp: 0, fp: 0, fn: 0 };
  return perClass[cls];
}

function finalizeClassMetrics(perClass) {
  const metrics = {};
  let f1Sum = 0;
  let f1Classes = 0;
  for (const [cls, m] of Object.entries(perClass)) {
    const precision = m.tp + m.fp > 0 ? m.tp / (m.tp + m.fp) : 0;
    const recall = m.support > 0 ? m.tp / m.support : 0;
    const f1 =
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0;
    metrics[cls] = { support: m.support, precision, recall, f1 };
    if (m.support > 0) {
      f1Sum += f1;
      f1Classes += 1;
    }
  }
  return Object.freeze({
    perClass: Object.freeze(metrics),
    macroF1: f1Classes > 0 ? f1Sum / f1Classes : 0,
  });
}

/**
 * Summarize outcomes against corpus expectations on both bounded axes.
 * @param {Array<{id: string, receipt?: object, decision?: object, latencyMs?: number, executed?: boolean}>} outcomes
 */
export function summarizeOutcomes(corpus, outcomes, thresholds, config) {
  const byId = new Map(corpus.examples.map(e => [e.id, e]));
  const perCategory = {};
  const perPriority = {};
  let suggested = 0;
  let correctSuggest = 0;
  let wrongSuggest = 0;
  let abstained = 0;
  let review = 0;
  let uncategorizedSupport = 0;
  let uncategorizedCorrect = 0;
  let highValueSupport = 0;
  let highValueMissed = 0;
  let spamOvercapture = 0;
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
    const expectedCategory = example.expectedCategory;
    const expectedPriority = example.expectedPriority;
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

    if (action.action === 'suggest') {
      suggested += 1;
      if (action.category === expectedCategory) correctSuggest += 1;
      else wrongSuggest += 1;
    } else if (action.action === 'review') {
      review += 1;
    } else {
      abstained += 1;
    }

    // Category axis: a non-suggestion counts as predicting uncategorized.
    const predCategory =
      action.action === 'suggest' ? action.category : UNCATEGORIZED_LABEL;
    for (const cls of new Set([expectedCategory, predCategory])) {
      bumpClass(perCategory, cls);
    }
    perCategory[expectedCategory].support += 1;
    if (predCategory === expectedCategory) {
      perCategory[expectedCategory].tp += 1;
    } else {
      perCategory[expectedCategory].fn += 1;
      perCategory[predCategory].fp += 1;
    }
    if (expectedCategory === UNCATEGORIZED_LABEL) {
      uncategorizedSupport += 1;
      if (predCategory === UNCATEGORIZED_LABEL) uncategorizedCorrect += 1;
    }
    if (expectedCategory !== 'spam' && predCategory === 'spam') {
      spamOvercapture += 1;
    }

    // Priority axis: only a suggestion carries a predicted priority; review
    // and abstain resolve to uncategorized.
    const predPriority =
      action.action === 'suggest' && typeof action.priority === 'string'
        ? action.priority
        : UNCATEGORIZED_LABEL;
    for (const cls of new Set([expectedPriority, predPriority])) {
      bumpClass(perPriority, cls);
    }
    perPriority[expectedPriority].support += 1;
    if (predPriority === expectedPriority) {
      perPriority[expectedPriority].tp += 1;
    } else {
      perPriority[expectedPriority].fn += 1;
      perPriority[predPriority].fp += 1;
    }
    if (expectedPriority === 'high') {
      highValueSupport += 1;
      if (predPriority !== 'high') highValueMissed += 1;
    }
  }

  const latSorted = [...latencies].sort((a, b) => a - b);
  const total = outcomes.length - unmatched.length;
  const categoryMetrics = finalizeClassMetrics(perCategory);
  const priorityMetrics = finalizeClassMetrics(perPriority);
  const pricing = config?.pricingEstimate ?? {};
  const estimatedCostUsd =
    (Number.isFinite(pricing.jevInputPerMillionUsd)
      ? (inputTokens / 1e6) * pricing.jevInputPerMillionUsd
      : 0) +
    (Number.isFinite(pricing.jevOutputPerMillionUsd)
      ? (outputTokens / 1e6) * pricing.jevOutputPerMillionUsd
      : 0);
  // Whole-workflow honesty: the incumbent call still runs for extraction and
  // summary, so total workflow cost counts both calls once baseline pricing
  // is supplied. Null — never zero — while that input is unknown.
  const estimatedWholeWorkflowCostUsd = Number.isFinite(
    pricing.incumbentCostPerEmailUsd
  )
    ? estimatedCostUsd + pricing.incumbentCostPerEmailUsd * total
    : null;

  return Object.freeze({
    evaluated: total,
    unmatched,
    evidenceBasis: Object.freeze({ executed, shadow }),
    categoryAxis: categoryMetrics,
    priorityAxis: priorityMetrics,
    macroF1: categoryMetrics.macroF1,
    abstentionRate: total > 0 ? abstained / total : 0,
    reviewRate: total > 0 ? review / total : 0,
    suggestionRate: total > 0 ? suggested / total : 0,
    falseSuggestionRate: total > 0 ? wrongSuggest / total : 0,
    correctionRate: suggested > 0 ? wrongSuggest / suggested : 0,
    suggestPrecision: suggested > 0 ? correctSuggest / suggested : null,
    uncategorizedRecall:
      uncategorizedSupport > 0
        ? uncategorizedCorrect / uncategorizedSupport
        : null,
    highValueMissRate:
      highValueSupport > 0 ? highValueMissed / highValueSupport : null,
    spamOvercaptureRate: total > 0 ? spamOvercapture / total : 0,
    latencyMs: Object.freeze({
      p50: percentile(latSorted, 50),
      p95: percentile(latSorted, 95),
      n: latSorted.length,
    }),
    usage: Object.freeze({ inputTokens, outputTokens }),
    billedCostUsd: null,
    estimatedCostUsd,
    estimatedCostPerDecisionUsd: total > 0 ? estimatedCostUsd / total : null,
    incumbentCallRetained: true,
    estimatedWholeWorkflowCostUsd,
  });
}

/**
 * Calibrate suggest/review concentration thresholds on tuning outcomes only.
 * Chooses the smallest suggest threshold that keeps the false-suggestion rate
 * under the materiality cap, maximizing correct suggestions; review is set to
 * half of suggest. Returns null when there is no usable concentration data.
 * Never returns the Haiku 0.6/0.7 confidence cutoffs.
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
    if (!isObject(decision) || decision.categoryConcentration === null)
      continue;
    rows.push({
      expected: example.expectedCategory,
      category: decision.category,
      abstained: decision.abstained === true,
      concentration: decision.categoryConcentration,
    });
  }
  if (rows.length === 0) return null;
  const cap = config?.materiality?.maxFalseSuggestionRate ?? 0.03;
  let best = null;
  for (let a = 0.3; a <= 0.95; a += 0.01) {
    const suggest = Math.round(a * 100) / 100;
    let wrong = 0;
    let correct = 0;
    for (const row of rows) {
      if (row.abstained || row.category === null) continue;
      if (row.concentration < suggest) continue;
      if (row.category === row.expected) correct += 1;
      else wrong += 1;
    }
    const falseRate = rows.length > 0 ? wrong / rows.length : 0;
    if (falseRate > cap) continue;
    if (!best || correct > best.correct) {
      best = { suggest, correct, falseRate };
    }
  }
  if (!best) return null;
  const thresholds = validateInboxTriageThresholds({
    suggest: best.suggest,
    review: Math.round((best.suggest / 2) * 100) / 100,
  });
  return Object.freeze({
    ...thresholds,
    calibratedFrom: 'tuning',
    sampleSize: rows.length,
    falseSuggestionRateAtSuggest: best.falseRate,
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
  calibration = null,
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
  if (metrics.estimatedWholeWorkflowCostUsd === null) {
    reasons.push(
      'incumbent per-email cost unrecorded; whole-workflow cost is unknown, not zero'
    );
  }

  const protectedBreaches = [];
  if (metrics.falseSuggestionRate > (m.maxFalseSuggestionRate ?? 1)) {
    protectedBreaches.push(
      `falseSuggestionRate ${metrics.falseSuggestionRate} > ${m.maxFalseSuggestionRate}`
    );
  }
  if (
    metrics.uncategorizedRecall !== null &&
    metrics.uncategorizedRecall < (p.uncategorizedRecallMin ?? 0)
  ) {
    protectedBreaches.push(
      `uncategorizedRecall ${metrics.uncategorizedRecall} < ${p.uncategorizedRecallMin}`
    );
  }
  if (
    metrics.highValueMissRate !== null &&
    metrics.highValueMissRate > (p.highValueMissRateMax ?? 1)
  ) {
    protectedBreaches.push(
      `highValueMissRate ${metrics.highValueMissRate} > ${p.highValueMissRateMax}`
    );
  }
  if (metrics.spamOvercaptureRate > (p.spamOvercaptureRateMax ?? 1)) {
    protectedBreaches.push(
      `spamOvercaptureRate ${metrics.spamOvercaptureRate} > ${p.spamOvercaptureRateMax}`
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
    issue: 'JOV-6421',
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
 * Run the corpus through the triage seam. The caller supplies per-example
 * admission options (approval, fingerprints, transport); without them every
 * example is a non-admitted shadow observation and no paid call is made.
 * @param {ReturnType<typeof loadInboxCorpus>} corpus
 * @param {{optionsFor?: (example: {id: string}) => Parameters<typeof classifyInboxEmail>[1], classify?: typeof classifyInboxEmail, now?: () => number}} [options]
 */
export async function runCorpusEvaluation(
  corpus,
  { optionsFor, classify = classifyInboxEmail, now = () => Date.now() } = {}
) {
  const outcomes = [];
  for (const example of corpus.examples) {
    const started = now();
    const receipt = await classify(
      {
        sourceSha: example.sourceSha ?? '0'.repeat(40),
        artifactSha256: hashJson(example.subject + example.body)
          .padEnd(64, '0')
          .slice(0, 64),
        scope: `inbox-triage-corpus ${corpus.version} ${example.id}`,
        fromName: example.fromName ?? null,
        fromDomain: example.fromDomain ?? null,
        subject: example.subject,
        bodyText: example.body,
        artistName: 'Eval Artist',
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
  const corpus = loadInboxCorpus(readFileSync(corpusPath, 'utf8'));
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
    validateInboxTriageThresholds({
      suggest: config.thresholdPriors.suggest,
      review: config.thresholdPriors.review,
    });

  // Baseline rows reuse the existing Haiku semantics: it always returns a
  // suggestion when it returns at all — the artist confirmation gate is the
  // same on both paths, so every category it emits is a suggestion.
  let baselineMetrics = null;
  if (baselineRows) {
    baselineMetrics = summarizeOutcomes(
      corpus,
      baselineRows.map(row => ({
        id: row.id,
        decision: Object.freeze(
          typeof row.category === 'string' && row.category !== null
            ? {
                action: 'suggest',
                category: row.category,
                priority:
                  typeof row.priority === 'string' ? row.priority : null,
              }
            : { action: 'abstain', category: null, priority: null }
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
