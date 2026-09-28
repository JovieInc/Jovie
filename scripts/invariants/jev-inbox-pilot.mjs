/**
 * Shadow evaluation harness for Jev artist-inbox triage (JOV-6421).
 *
 * Loads the versioned inbox corpus, applies the predeclared concentration
 * threshold priors to recorded decision receipts, and reports per-class
 * precision/recall on both axes, high-value miss rate, correction rate,
 * abstention, p50/p95 latency and attributable cost. Executed Gateway
 * comparisons are distinguished from fixture/shadow observations; the
 * disposition receipt is retain | promote-candidate | blocked | inconclusive.
 * Nothing here changes a production decision.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  decideInboxTriage,
  INBOX_CATEGORIES,
  INBOX_PRIORITIES,
  UNCATEGORIZED_LABEL,
} from './jev-inbox-triage.mjs';

export const PILOT_RECEIPT_SCHEMA = 'jev-inbox-pilot-disposition/v1';
export const CORPUS_SCHEMA = 'inbox-triage-corpus/v1';

const PILOT_IMPLEMENTATION_SHA256 = createHash('sha256')
  .update(readFileSync(new URL(import.meta.url)))
  .digest('hex');

const VALID_CATEGORIES = new Set([...INBOX_CATEGORIES, UNCATEGORIZED_LABEL]);
const VALID_PRIORITIES = new Set([...INBOX_PRIORITIES, UNCATEGORIZED_LABEL]);

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const hashJson = v =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const textKey = e =>
  `${e.subject.trim().toLowerCase()}::${e.body.trim().toLowerCase()}`;

/** Load the versioned corpus. Throws on structural violations. */
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
    for (const [axis, valid, value] of [
      ['category', VALID_CATEGORIES, example.expectedCategory],
      ['priority', VALID_PRIORITIES, example.expectedPriority],
    ]) {
      if (!valid.has(value)) {
        throw new Error(
          `expected ${axis} not in enum for ${example.id}: ${String(value)}`
        );
      }
    }
    const key = textKey(example);
    if (texts.has(key)) throw new Error(`duplicate text: ${example.id}`);
    texts.add(key);
  }
  return corpus;
}

export function corpusIntegrityReport(corpus, config) {
  const stats = {
    total: 0,
    tuning: 0,
    holdout: 0,
    tags: {},
    perCategory: {},
    perPriority: {},
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
    splitText[example.split].add(textKey(example));
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
  for (const [axis, counts, min] of [
    ['category', stats.perCategory, s.minExamplesPerExpectedCategory ?? 0],
    ['priority', stats.perPriority, s.minExamplesPerExpectedPriority ?? 0],
  ]) {
    for (const [expected, count] of Object.entries(counts)) {
      if (count < min)
        issues.push(`${axis} ${expected} has only ${count} examples`);
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
  return sorted[
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  ];
}

/** @param {Record<string, {support:number,tp:number,fp:number,fn:number}>} perClass */
function finalizeClassMetrics(perClass) {
  /** @type {Record<string, {support:number,precision:number,recall:number,f1:number}>} */
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

/** @param {Record<string, {support:number,tp:number,fp:number,fn:number}>} perClass */
function bumpAxis(perClass, expected, pred) {
  for (const cls of new Set([expected, pred])) {
    perClass[cls] ??= { support: 0, tp: 0, fp: 0, fn: 0 };
  }
  perClass[expected].support += 1;
  if (pred === expected) perClass[expected].tp += 1;
  else {
    perClass[expected].fn += 1;
    perClass[pred].fp += 1;
  }
}

export function summarizeOutcomes(corpus, outcomes, thresholds, config) {
  const byId = new Map(corpus.examples.map(e => [e.id, e]));
  /** @type {Record<string, {support:number,tp:number,fp:number,fn:number}>} */
  const perCategory = {};
  /** @type {Record<string, {support:number,tp:number,fp:number,fn:number}>} */
  const perPriority = {};
  const c = Object.fromEntries(
    'suggested wrongSuggest abstained review uncategorizedSupport uncategorizedCorrect highValueSupport highValueMissed spamOvercapture executed shadow inputTokens outputTokens'
      .split(' ')
      .map(k => [k, 0])
  );
  const latencies = [];
  const unmatched = [];

  for (const outcome of outcomes) {
    const example = byId.get(outcome.id);
    if (!example) {
      unmatched.push(outcome.id);
      continue;
    }
    // `executed` marks a real authorized Gateway comparison; fixture/shadow
    // transports stay shadow-only. Recorded decision rows pass through.
    const action =
      isObject(outcome.receipt) && typeof outcome.receipt.status === 'string'
        ? decideInboxTriage(outcome.receipt, thresholds)
        : isObject(outcome.decision) &&
            typeof outcome.decision.action === 'string'
          ? outcome.decision
          : Object.freeze({
              action: 'abstain',
              category: null,
              priority: null,
              reason: 'unresolvable-outcome',
            });
    const { expectedCategory, expectedPriority } = example;
    const receipt = outcome.receipt;
    c[
      outcome.executed === true && receipt?.status === 'evaluated'
        ? 'executed'
        : 'shadow'
    ] += 1;
    for (const key of ['inputTokens', 'outputTokens']) {
      if (Number.isFinite(receipt?.[key])) c[key] += receipt[key];
    }
    if (Number.isFinite(outcome.latencyMs)) latencies.push(outcome.latencyMs);

    if (action.action === 'suggest') {
      c.suggested += 1;
      if (action.category !== expectedCategory) c.wrongSuggest += 1;
    } else if (action.action === 'review') c.review += 1;
    else c.abstained += 1;

    // Category axis: a non-suggestion counts as predicting uncategorized.
    const predCategory =
      action.action === 'suggest' ? action.category : UNCATEGORIZED_LABEL;
    bumpAxis(perCategory, expectedCategory, predCategory);
    if (expectedCategory === UNCATEGORIZED_LABEL) {
      c.uncategorizedSupport += 1;
      if (predCategory === UNCATEGORIZED_LABEL) c.uncategorizedCorrect += 1;
    }
    if (expectedCategory !== 'spam' && predCategory === 'spam')
      c.spamOvercapture += 1;

    // Priority axis: only a suggestion carries a predicted priority; review
    // and abstain resolve to uncategorized.
    const predPriority =
      action.action === 'suggest' && typeof action.priority === 'string'
        ? action.priority
        : UNCATEGORIZED_LABEL;
    bumpAxis(perPriority, expectedPriority, predPriority);
    if (expectedPriority === 'high') {
      c.highValueSupport += 1;
      if (predPriority !== 'high') c.highValueMissed += 1;
    }
  }

  const latSorted = [...latencies].sort((a, b) => a - b);
  const total = outcomes.length - unmatched.length;
  const categoryMetrics = finalizeClassMetrics(perCategory);
  const pricing = config?.pricingEstimate ?? {};
  const cost = (tokens, perMillion) =>
    Number.isFinite(perMillion) ? (tokens / 1e6) * perMillion : 0;
  const estimatedCostUsd =
    cost(c.inputTokens, pricing.jevInputPerMillionUsd) +
    cost(c.outputTokens, pricing.jevOutputPerMillionUsd);
  // Whole-workflow honesty: the incumbent call still runs for extraction and
  // summary — null, never zero, while incumbent pricing is unrecorded.
  const estimatedWholeWorkflowCostUsd = Number.isFinite(
    pricing.incumbentCostPerEmailUsd
  )
    ? estimatedCostUsd + pricing.incumbentCostPerEmailUsd * total
    : null;

  return Object.freeze({
    evaluated: total,
    unmatched,
    evidenceBasis: Object.freeze({ executed: c.executed, shadow: c.shadow }),
    categoryAxis: categoryMetrics,
    priorityAxis: finalizeClassMetrics(perPriority),
    macroF1: categoryMetrics.macroF1,
    abstentionRate: total > 0 ? c.abstained / total : 0,
    reviewRate: total > 0 ? c.review / total : 0,
    falseSuggestionRate: total > 0 ? c.wrongSuggest / total : 0,
    correctionRate: c.suggested > 0 ? c.wrongSuggest / c.suggested : 0,
    uncategorizedRecall:
      c.uncategorizedSupport > 0
        ? c.uncategorizedCorrect / c.uncategorizedSupport
        : null,
    highValueMissRate:
      c.highValueSupport > 0 ? c.highValueMissed / c.highValueSupport : null,
    spamOvercaptureRate: total > 0 ? c.spamOvercapture / total : 0,
    latencyMs: Object.freeze({
      p50: percentile(latSorted, 50),
      p95: percentile(latSorted, 95),
      n: latSorted.length,
    }),
    usage: Object.freeze({
      inputTokens: c.inputTokens,
      outputTokens: c.outputTokens,
    }),
    estimatedCostUsd,
    estimatedCostPerDecisionUsd: total > 0 ? estimatedCostUsd / total : null,
    incumbentCallRetained: true,
    estimatedWholeWorkflowCostUsd,
  });
}

function breaches(rows) {
  const out = [];
  for (const [name, value, limit, cmp = '>'] of rows) {
    const bad =
      Number.isFinite(value) && (cmp === '>' ? value > limit : value < limit);
    if (bad) out.push(`${name} ${value} ${cmp} ${limit}`);
  }
  return out;
}

/**
 * Exact-version pilot disposition receipt.
 * disposition: 'retain' | 'promote-candidate' | 'blocked' | 'inconclusive'
 */
export function buildPilotReceipt({
  corpus,
  config,
  thresholds,
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
  if (!thresholds) reasons.push('no calibrated thresholds');
  if (metrics.unmatched.length > 0) {
    reasons.push(`${metrics.unmatched.length} outcomes matched no example`);
  }
  if (metrics.evaluated < (config?.sufficiency?.minCorpusSize ?? 0)) {
    reasons.push(`only ${metrics.evaluated} matched outcomes`);
  }
  const minExecuted = config?.sufficiency?.minExecutedComparisons ?? 0;
  if (metrics.evidenceBasis.executed < minExecuted) {
    reasons.push(
      `executed comparisons ${metrics.evidenceBasis.executed} < ${minExecuted}; shadow observations only`
    );
  }
  if (metrics.estimatedWholeWorkflowCostUsd === null) {
    reasons.push(
      'incumbent per-email cost unrecorded; whole-workflow cost is unknown, not zero'
    );
  }

  const protectedBreaches = breaches([
    [
      'falseSuggestionRate',
      metrics.falseSuggestionRate,
      m.maxFalseSuggestionRate ?? 1,
    ],
    [
      'uncategorizedRecall',
      metrics.uncategorizedRecall,
      p.uncategorizedRecallMin ?? 0,
      '<',
    ],
    [
      'highValueMissRate',
      metrics.highValueMissRate,
      p.highValueMissRateMax ?? 1,
    ],
    [
      'spamOvercaptureRate',
      metrics.spamOvercaptureRate,
      p.spamOvercaptureRateMax ?? 1,
    ],
  ]);

  const materialityMisses = breaches([
    ['macroF1', metrics.macroF1, m.minMacroF1 ?? 0, '<'],
    ['correctionRate', metrics.correctionRate, m.maxCorrectionRate ?? 1],
    ['p95', metrics.latencyMs.p95, m.maxP95LatencyMs ?? Infinity],
    [
      'estimatedCostPerDecisionUsd',
      metrics.estimatedCostPerDecisionUsd,
      m.maxEstimatedCostPerDecisionUsd ?? Infinity,
    ],
  ]);
  const [lo, hi] = m.abstentionBand ?? [0, 1];
  if (
    !Number.isFinite(metrics.abstentionRate) ||
    metrics.abstentionRate < lo ||
    metrics.abstentionRate > hi
  ) {
    materialityMisses.push(
      `abstentionRate outside ${JSON.stringify(m.abstentionBand)}`
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
    disposition,
    reasons: Object.freeze(reasons),
    metrics,
    baselineMetrics: baselineMetrics ?? null,
    sufficiencyNote:
      config?.sufficiency?.rareEventNote ??
      'corpus size alone is not proof of rare-event safety',
  });
}
