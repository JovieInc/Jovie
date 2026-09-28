/**
 * Shipping SLO ratchet — pure computation core (JOV-6783).
 *
 * All functions here are deterministic and I/O-free: callers fetch GitHub /
 * lanes data, pass it in, and get back metrics, verdicts, and an updated
 * baseline document. This keeps the whole ratchet unit-testable and lets the
 * CLI (scripts/shipping-slo-report.mjs), the scheduled workflow, and the
 * Symphony lanes status feed share one tested core.
 *
 * Metric directions:
 *   - "lower"  : latency / rate SLOs (CI wall time, queue wait, lead time,
 *                remediation, production lag, ejection rate)
 *   - "higher" : throughput SLOs (merges/day, verified output/day)
 *
 * Ratchet policy (founder ask 2026-09-26 + 2026-09-28 extension):
 *   - >10% improvement held for 3 consecutive daily snapshots → tighten baseline
 *   - >20% regression (or >20% throughput drop) → slo-regression investigation
 *   - throughput growth flat (< +8% WoW target) for a sustained window →
 *     bottleneck investigation even without an absolute regression
 */

import { computePercentile } from './ci-duration-ratchet.mjs';

export const SHIPPING_SLO_SCHEMA_VERSION = 1;
export const WINDOW_DAYS = 7;
export const HISTORY_DAYS = 42;

export const DEFAULT_THRESHOLDS = Object.freeze({
  improvementFraction: 0.1,
  improvementHoldDays: 3,
  regressionFraction: 0.2,
  throughputDropFraction: 0.2,
  wowGrowthTarget: 0.08,
  flatGrowthWeeks: 2,
});

/** Declared SLO metrics. direction: which way is "better". */
export const METRIC_DEFS = Object.freeze([
  { key: 'ci_walltime.pull_request.p95', unit: 'seconds', direction: 'lower' },
  { key: 'ci_walltime.merge_group.p95', unit: 'seconds', direction: 'lower' },
  { key: 'merge_queue.wait.p95', unit: 'seconds', direction: 'lower' },
  { key: 'merge_queue.ejection_rate', unit: 'ratio', direction: 'lower' },
  { key: 'lead_time.devin.p95', unit: 'seconds', direction: 'lower' },
  { key: 'lead_time.codex.p95', unit: 'seconds', direction: 'lower' },
  { key: 'lead_time.other.p95', unit: 'seconds', direction: 'lower' },
  {
    key: 'remediation.pr_red_to_green.p95',
    unit: 'seconds',
    direction: 'lower',
  },
  {
    key: 'remediation.main_red_to_green.p95',
    unit: 'seconds',
    direction: 'lower',
  },
  {
    key: 'remediation.production_promote_hold.p95',
    unit: 'seconds',
    direction: 'lower',
  },
  {
    key: 'production_lag.merged_to_verified.p95',
    unit: 'seconds',
    direction: 'lower',
  },
  { key: 'throughput.merges_per_day', unit: 'per_day', direction: 'higher' },
  { key: 'throughput.verified_per_day', unit: 'per_day', direction: 'higher' },
]);

const DAY_MS = 86_400_000;
const secondsBetween = (from, to) => {
  const s = (Date.parse(to) - Date.parse(from)) / 1000;
  return Number.isFinite(s) && s > 0 ? s : null;
};

const percentiles = values => ({
  n: values.length,
  p50: values.length ? computePercentile(values, 50) : null,
  p95: values.length ? computePercentile(values, 95) : null,
});

/** Branch-prefix lane classifier: feat/devin-x → devin, codex/* → codex, else other. */
export function prLane(pr) {
  const ref = String(pr?.headRefName ?? pr?.head_ref ?? '').toLowerCase();
  const first = ref.split('/')[0] || '';
  if (['devin', 'codex', 'claude', 'devin-ai-integration'].includes(first))
    return first === 'devin-ai-integration' ? 'devin' : first;
  if (/^devin\//.test(ref)) return 'devin';
  return 'other';
}

/**
 * Per-workflow/per-event CI wall-clock percentiles for runs created inside
 * [sinceMs, nowMs]. Returns { '<event>.p95': seconds|null, detail: {...} }.
 */
export function ciWalltimeByEvent(
  runs,
  sinceMs,
  nowMs,
  events = ['pull_request', 'merge_group']
) {
  const out = {};
  for (const event of events) {
    const durations = (runs ?? [])
      .filter(
        r =>
          r &&
          r.event === event &&
          r.status === 'completed' &&
          r.conclusion === 'success' &&
          Date.parse(r.created_at) >= sinceMs &&
          Date.parse(r.created_at) <= nowMs
      )
      .map(r => secondsBetween(r.created_at, r.updated_at))
      .filter(Number.isFinite);
    out[event] = percentiles(durations);
  }
  return out;
}

/**
 * Merge-queue wait + ejection. timelines: per-PR arrays of
 * { type: 'added_to_merge_queue'|'removed_from_merge_queue'|'merged', at: ISO }.
 * Wait = last added_to_merge_queue → merged. Ejection = removed without merge.
 */
export function mergeQueueStats(timelines, sinceMs, nowMs) {
  const waits = [];
  let enqueued = 0;
  let ejected = 0;
  for (const events of timelines ?? []) {
    const list = [...(events ?? [])].sort(
      (a, b) => Date.parse(a.at) - Date.parse(b.at)
    );
    let lastAdd = null;
    for (const event of list) {
      const at = Date.parse(event.at);
      if (!Number.isFinite(at) || at < sinceMs || at > nowMs) continue;
      if (event.type === 'added_to_merge_queue') {
        lastAdd = event.at;
        enqueued += 1;
      } else if (event.type === 'removed_from_merge_queue') {
        if (lastAdd) ejected += 1;
        lastAdd = null;
      } else if (event.type === 'merged' && lastAdd) {
        const wait = secondsBetween(lastAdd, event.at);
        if (wait) waits.push(wait);
        lastAdd = null;
      }
    }
  }
  return {
    wait: percentiles(waits),
    enqueued,
    ejected,
    ejectionRate: enqueued ? ejected / enqueued : null,
  };
}

/** PR lead time (createdAt → mergedAt) percentiles grouped by branch-prefix lane. */
export function leadTimeByLane(prs, sinceMs, nowMs) {
  const byLane = {};
  for (const pr of prs ?? []) {
    if (!pr?.mergedAt || !pr?.createdAt) continue;
    const mergedAt = Date.parse(pr.mergedAt);
    if (mergedAt < sinceMs || mergedAt > nowMs) continue;
    const seconds = secondsBetween(pr.createdAt, pr.mergedAt);
    if (!seconds) continue;
    const lane = prLane(pr);
    (byLane[lane] ||= []).push(seconds);
  }
  const out = {};
  for (const [lane, values] of Object.entries(byLane))
    out[lane] = percentiles(values);
  return out;
}

/**
 * Time to remediate.
 *  - pr_red_to_green: per head branch, earliest failure → next success (seconds).
 *  - main_red_to_green: on the default-branch run sequence, failure → next success.
 *  - production_promote_hold: caller-supplied [{startedAt, clearedAt}] records;
 *    null when no data source exists yet.
 */
export function remediationStats({
  prRuns,
  mainRuns,
  promoteHolds,
  sinceMs,
  nowMs,
}) {
  const inWindow = at => {
    const t = Date.parse(at);
    return Number.isFinite(t) && t >= sinceMs && t <= nowMs;
  };

  const prDeltas = [];
  const byBranch = {};
  for (const run of prRuns ?? []) {
    if (!run?.head_branch || !inWindow(run.created_at)) continue;
    (byBranch[run.head_branch] ||= []).push(run);
  }
  for (const runs of Object.values(byBranch)) {
    runs.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    let firstRed = null;
    for (const run of runs) {
      if (run.status !== 'completed') continue;
      if (!firstRed && run.conclusion === 'failure') firstRed = run;
      else if (firstRed && run.conclusion === 'success') {
        const delta = secondsBetween(firstRed.created_at, run.updated_at);
        if (delta) prDeltas.push(delta);
        firstRed = null;
      }
    }
  }

  const mainDeltas = [];
  const ordered = [...(mainRuns ?? [])]
    .filter(r => r && inWindow(r.created_at) && r.status === 'completed')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  let redAt = null;
  for (const run of ordered) {
    if (run.conclusion === 'failure' && redAt === null) redAt = run.created_at;
    else if (run.conclusion === 'success' && redAt !== null) {
      const delta = secondsBetween(redAt, run.updated_at);
      if (delta) mainDeltas.push(delta);
      redAt = null;
    }
  }

  const holdDeltas = (promoteHolds ?? [])
    .map(h => h && secondsBetween(h.startedAt, h.clearedAt))
    .filter(Number.isFinite);

  return {
    prRedToGreen: percentiles(prDeltas),
    mainRedToGreen: percentiles(mainDeltas),
    promoteHold: holdDeltas.length
      ? percentiles(holdDeltas)
      : { n: 0, p50: null, p95: null },
  };
}

/**
 * Production lag: mergedAt → first successful production deployment at/after
 * the merge. deployments: [{status:'success', createdAt, sha?}] — sha matching
 * used when available, otherwise first success after mergedAt wins.
 */
export function productionLag(prs, deployments, sinceMs, nowMs) {
  const successes = (deployments ?? [])
    .filter(d => d && d.status === 'success' && d.createdAt)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const lags = [];
  let verified = 0;
  let merged = 0;
  for (const pr of prs ?? []) {
    if (!pr?.mergedAt) continue;
    const mergedAt = Date.parse(pr.mergedAt);
    if (mergedAt < sinceMs || mergedAt > nowMs) continue;
    merged += 1;
    const sha = pr.mergeCommitSha ?? pr.merge_commit_sha;
    const match = sha
      ? successes.find(
          d => d.sha === sha && Date.parse(d.createdAt) >= mergedAt
        )
      : successes.find(d => Date.parse(d.createdAt) >= mergedAt);
    if (!match) continue;
    const lag = secondsBetween(pr.mergedAt, match.createdAt);
    if (lag) {
      lags.push(lag);
      verified += 1;
    }
  }
  return { lag: percentiles(lags), merged, verified };
}

/**
 * Throughput per 7-day week (w0 = latest) plus WoW growth and the second-order
 * trend: is growth itself accelerating, flat, or decelerating.
 */
export function throughputTrend(prs, nowMs, { verifiedPredicate = null } = {}) {
  const weekMs = 7 * DAY_MS;
  const count = (lo, hi, pred) =>
    (prs ?? []).filter(
      p =>
        p?.mergedAt &&
        Date.parse(p.mergedAt) >= lo &&
        Date.parse(p.mergedAt) < hi &&
        (!pred || pred(p))
    ).length;
  const w = i => ({
    merged: count(nowMs - (i + 1) * weekMs, nowMs - i * weekMs),
    verified: count(
      nowMs - (i + 1) * weekMs,
      nowMs - i * weekMs,
      verifiedPredicate
    ),
  });
  const [w0, w1, w2] = [w(0), w(1), w(2)];
  const growth = (a, b) => (b > 0 ? a / b - 1 : null);
  const g1 = growth(w0.merged, w1.merged);
  const g2 = growth(w1.merged, w2.merged);
  const EPS = 0.02;
  const trend =
    g1 === null || g2 === null
      ? 'unknown'
      : g1 - g2 > EPS
        ? 'accelerating'
        : g2 - g1 > EPS
          ? 'decelerating'
          : 'flat';
  return {
    mergesPerDay: w0.merged / 7,
    verifiedPerDay: w0.verified / 7,
    prevMergesPerDay: w1.merged / 7,
    prevPrevMergesPerDay: w2.merged / 7,
    wowGrowth: g1,
    prevWowGrowth: g2,
    growthTrend: trend,
    weeks: { w0, w1, w2 },
  };
}

/**
 * Capacity/utilization from lane/host samples.
 * samples: [{ ts, provider, running, slots, qualifiedWork }] — one sample per
 * observation interval; intervalMinutes describes the sampling period.
 * Returns per-provider utilization, idle minutes with qualified work pending,
 * and certified-output-per-runner-hour when `verifiedCount` is supplied.
 */
export function capacityUtilization(
  samples,
  { intervalMinutes = 1, verifiedCount = null } = {}
) {
  const byProvider = {};
  let idleMinutes = 0;
  let runnerMinutes = 0;
  for (const s of samples ?? []) {
    if (!s) continue;
    const provider = s.provider ?? s.runnerClass ?? 'unknown';
    const slots = Number(s.slots) || 0;
    const running = Math.min(Number(s.running) || 0, slots);
    const rec = (byProvider[provider] ||= { running: 0, slots: 0, samples: 0 });
    rec.running += running;
    rec.slots += slots;
    rec.samples += 1;
    runnerMinutes += running * intervalMinutes;
    if ((s.qualifiedWork ?? 0) > 0 && running < slots)
      idleMinutes += intervalMinutes;
  }
  const providers = {};
  for (const [name, rec] of Object.entries(byProvider))
    providers[name] = {
      utilization: rec.slots ? rec.running / rec.slots : null,
      samples: rec.samples,
    };
  return {
    providers,
    idleMinutesWithQualifiedWork: idleMinutes,
    runnerMinutes,
    verifiedPerRunnerHour:
      verifiedCount && runnerMinutes > 0
        ? verifiedCount / (runnerMinutes / 60)
        : null,
  };
}

/**
 * Flat map of metric key → observed value for ratchet evaluation. Nulls are
 * kept (evaluator skips them — no data is not a regression).
 */
export function flattenMetrics(metrics) {
  const flat = {};
  const put = (key, stat) => {
    flat[key] = stat && Number.isFinite(stat.p95) ? stat.p95 : null;
  };
  put('ci_walltime.pull_request.p95', metrics.ci?.pull_request);
  put('ci_walltime.merge_group.p95', metrics.ci?.merge_group);
  put('merge_queue.wait.p95', metrics.mergeQueue?.wait);
  flat['merge_queue.ejection_rate'] = metrics.mergeQueue?.ejectionRate ?? null;
  for (const lane of ['devin', 'codex', 'other'])
    put(`lead_time.${lane}.p95`, metrics.leadTime?.[lane]);
  put('remediation.pr_red_to_green.p95', metrics.remediation?.prRedToGreen);
  put('remediation.main_red_to_green.p95', metrics.remediation?.mainRedToGreen);
  put(
    'remediation.production_promote_hold.p95',
    metrics.remediation?.promoteHold
  );
  put('production_lag.merged_to_verified.p95', metrics.productionLag?.lag);
  flat['throughput.merges_per_day'] = Number.isFinite(
    metrics.throughput?.mergesPerDay
  )
    ? metrics.throughput.mergesPerDay
    : null;
  flat['throughput.verified_per_day'] = Number.isFinite(
    metrics.throughput?.verifiedPerDay
  )
    ? metrics.throughput.verifiedPerDay
    : null;
  return flat;
}

const defFor = key => METRIC_DEFS.find(d => d.key === key);

function isImproved(key, observed, base, fraction) {
  const def = defFor(key);
  if (!def || observed === null || !Number.isFinite(base)) return false;
  return def.direction === 'lower'
    ? observed <= base * (1 - fraction)
    : observed >= base * (1 + fraction);
}

function isRegressed(key, observed, base, fraction) {
  const def = defFor(key);
  if (!def || observed === null || !Number.isFinite(base) || base <= 0)
    return false;
  return def.direction === 'lower'
    ? observed > base * (1 + fraction)
    : observed < base * (1 - fraction);
}

/** Consecutive trailing history days (excluding today) where `key` held the improved level. */
function heldDays(history, key, base, fraction) {
  let days = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const value = history[i]?.values?.[key];
    if (!Number.isFinite(value)) break;
    if (isImproved(key, value, base, fraction)) days += 1;
    else break;
  }
  return days;
}

/**
 * Compare flattened observed metrics against the committed baseline.
 * Returns { regressions, tightenCandidates, throughput }.
 *   regressions[]     : { key, baseline, observed, changeFraction, kind }
 *   tightenCandidates[] : { key, baseline, observed } — eligible for ratchet PR
 *   throughput        : { wowGrowth, growthTrend, flatWeeks, flatStall }
 */
export function evaluateShippingSlo(flat, baseline, { today = null } = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(baseline?.thresholds ?? {}) };
  const base = baseline?.metrics ?? {};
  const history = baseline?.history ?? [];

  const regressions = [];
  const tightenCandidates = [];
  for (const def of METRIC_DEFS) {
    const observed = flat[def.key];
    const baseValue = Number(base[def.key]?.value ?? base[def.key]);
    if (observed === null || observed === undefined) continue;
    if (def.direction === 'lower') {
      if (
        isRegressed(def.key, observed, baseValue, thresholds.regressionFraction)
      )
        regressions.push({
          key: def.key,
          kind: 'latency_regression',
          baseline: baseValue,
          observed,
          changeFraction: baseValue > 0 ? observed / baseValue - 1 : null,
        });
    } else if (
      isRegressed(
        def.key,
        observed,
        baseValue,
        thresholds.throughputDropFraction
      )
    ) {
      regressions.push({
        key: def.key,
        kind: 'throughput_drop',
        baseline: baseValue,
        observed,
        changeFraction: baseValue > 0 ? observed / baseValue - 1 : null,
      });
    }
    if (
      isImproved(def.key, observed, baseValue, thresholds.improvementFraction)
    ) {
      // today counts as one held day; the rest must come from history.
      const held =
        1 +
        heldDays(history, def.key, baseValue, thresholds.improvementFraction);
      if (held >= thresholds.improvementHoldDays)
        tightenCandidates.push({
          key: def.key,
          baseline: baseValue,
          observed,
          heldDays: held,
        });
    }
  }

  // Throughput growth flattening: a stall even without an absolute regression.
  let flatStreak = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const g = history[i]?.throughput?.wowGrowth;
    if (!Number.isFinite(g)) break;
    if (g < thresholds.wowGrowthTarget) flatStreak += 1;
    else break;
  }
  const currentGrowth = flat.throughput_wow_growth;
  const flatStall =
    Number.isFinite(currentGrowth) &&
    currentGrowth < thresholds.wowGrowthTarget &&
    flatStreak + 1 >= thresholds.flatGrowthWeeks * 7;

  return { regressions, tightenCandidates, flatStall, thresholds };
}

/**
 * Produce the next baseline document: tightened values for held improvements,
 * today's snapshot appended to rolling history. Never worsens a baseline.
 */
export function ratchetBaseline(baseline, flat, evaluation, { now }) {
  const iso = new Date(now).toISOString();
  const date = iso.slice(0, 10);
  const next = JSON.parse(JSON.stringify(baseline));
  next.schemaVersion = SHIPPING_SLO_SCHEMA_VERSION;
  next.updatedAt = iso;
  next.metrics ||= {};
  const tightened = [];
  for (const cand of evaluation?.tightenCandidates ?? []) {
    const def = defFor(cand.key);
    const cur = Number(next.metrics[cand.key]?.value ?? next.metrics[cand.key]);
    if (!def || !Number.isFinite(cur)) continue;
    const better =
      def.direction === 'lower' ? cand.observed < cur : cand.observed > cur;
    if (!better) continue;
    next.metrics[cand.key] = {
      value: Math.round(cand.observed * 1000) / 1000,
      unit: def.unit,
      direction: def.direction,
      ratchetedAt: iso,
    };
    tightened.push(cand.key);
  }
  const values = {};
  for (const [key, value] of Object.entries(flat))
    if (Number.isFinite(value)) values[key] = value;
  next.history = [
    ...(next.history ?? []),
    {
      date,
      values,
      throughput: {
        wowGrowth: flat.throughput_wow_growth ?? null,
        growthTrend: flat.throughput_growth_trend ?? null,
      },
    },
  ].slice(-HISTORY_DAYS);
  return { next, tightened };
}

/** Compact `slo` block for the Symphony lanes status gist. */
export function buildGistSloBlock(flat, evaluation, { now }) {
  const pick = key => flat[key] ?? null;
  return {
    at: new Date(now).toISOString(),
    ciP95Seconds: {
      pull_request: pick('ci_walltime.pull_request.p95'),
      merge_group: pick('ci_walltime.merge_group.p95'),
    },
    queueWaitP95Seconds: pick('merge_queue.wait.p95'),
    queueEjectionRate: pick('merge_queue.ejection_rate'),
    leadTimeP95Seconds: {
      devin: pick('lead_time.devin.p95'),
      codex: pick('lead_time.codex.p95'),
      other: pick('lead_time.other.p95'),
    },
    remediationP95Seconds: {
      prRedToGreen: pick('remediation.pr_red_to_green.p95'),
      mainRedToGreen: pick('remediation.main_red_to_green.p95'),
      productionPromoteHold: pick('remediation.production_promote_hold.p95'),
    },
    productionLagP95Seconds: pick('production_lag.merged_to_verified.p95'),
    throughput: {
      mergesPerDay: pick('throughput.merges_per_day'),
      verifiedPerDay: pick('throughput.verified_per_day'),
      wowGrowth: flat.throughput_wow_growth ?? null,
      growthTrend: flat.throughput_growth_trend ?? null,
    },
    regressions: (evaluation?.regressions ?? []).map(r => r.key),
    flatStall: Boolean(evaluation?.flatStall),
  };
}

/** Structural validation of the committed baseline document. */
export function validateBaseline(baseline) {
  const errors = [];
  if (!baseline || typeof baseline !== 'object')
    return { ok: false, errors: ['baseline must be an object'] };
  if (baseline.schemaVersion !== SHIPPING_SLO_SCHEMA_VERSION)
    errors.push(`schemaVersion must be ${SHIPPING_SLO_SCHEMA_VERSION}`);
  if (!baseline.metrics || typeof baseline.metrics !== 'object')
    errors.push('metrics must be an object');
  else
    for (const [key, entry] of Object.entries(baseline.metrics)) {
      const def = defFor(key);
      if (!def) errors.push(`unknown metric key: ${key}`);
      const value = Number(entry?.value ?? entry);
      if (!Number.isFinite(value) || value < 0)
        errors.push(`${key}: value must be a non-negative number`);
    }
  if (baseline.history !== undefined && !Array.isArray(baseline.history))
    errors.push('history must be an array');
  return { ok: errors.length === 0, errors };
}
