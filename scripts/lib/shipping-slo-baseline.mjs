/** Baseline policy, ratcheting and daily history for shipping SLO metrics. */

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
    // No collector feeds promote-hold intervals yet (JOV-8082); the evaluator
    // skips unsupported metrics and validateBaseline rejects baselining them.
    unsupported: true,
  },
  {
    key: 'production_lag.merged_to_verified.p95',
    unit: 'seconds',
    direction: 'lower',
  },
  { key: 'throughput.merges_per_day', unit: 'per_day', direction: 'higher' },
  { key: 'throughput.verified_per_day', unit: 'per_day', direction: 'higher' },
]);

export const defFor = key => METRIC_DEFS.find(d => d.key === key);

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

/**
 * One daily history row (no ratchet): 7d stage/e2e dwell per declared stage.
 */
export function stageHistorySummary(timings) {
  const out = {};
  for (const [type, entity] of Object.entries(timings?.entities ?? {})) {
    for (const [id, row] of [
      ...Object.entries(entity?.stages ?? {}),
      ...Object.entries(entity?.endToEnd ?? {}),
    ]) {
      const w = row?.['7d'] ?? {};
      out[`${type}:${id}`] = {
        n: w.n ?? 0,
        p50: w.p50 ?? null,
        p95: w.p95 ?? null,
      };
    }
  }
  return out;
}

/**
 * Append (or replace) today's daily history row on the baseline document.
 *
 * Called from the `--write-latest` report path so the scheduled collector
 * accumulates day-over-day context even when nothing ratchets — `history`
 * was previously only written on the tighten path. Deliberately does NOT
 * touch `metrics`, `updatedAt`, or any ratchet state: the ratchet command
 * owns those. A history-only write is marked with `historyUpdatedAt`.
 *
 * `report` is the document buildReport returns: flat numeric values
 * (report.flat), PRs/hour (report.prsPerHour), stage timings
 * (report.stageTimings), provider lead-time percentiles
 * (report.metrics.leadTimeByProvider) and throughput
 * (report.metrics.throughput).
 */
export function appendDailyHistory(
  baseline,
  report,
  { now = Date.now() } = {}
) {
  const at = typeof now === 'number' ? now : Date.parse(now);
  const iso = new Date(Number.isFinite(at) ? at : Date.now()).toISOString();
  const date = iso.slice(0, 10);
  const values = {};
  for (const [key, value] of Object.entries(report?.flat ?? {}))
    if (Number.isFinite(value)) values[key] = value;
  const row = {
    date,
    values,
    prsPerHour: {
      last24h: report?.prsPerHour?.last24h ?? null,
      from7d: report?.prsPerHour?.from7d ?? null,
    },
    stages: stageHistorySummary(report?.stageTimings),
    leadTimeByProvider: Object.fromEntries(
      Object.entries(report?.metrics?.leadTimeByProvider ?? {}).map(
        ([provider, stat]) => [
          provider,
          {
            n: stat?.n ?? 0,
            p50: stat?.p50 ?? null,
            p95: stat?.p95 ?? null,
          },
        ]
      )
    ),
    throughput: {
      wowGrowth: report?.metrics?.throughput?.wowGrowth ?? null,
      growthTrend: report?.metrics?.throughput?.growthTrend ?? null,
      mergesPerDay: report?.metrics?.throughput?.mergesPerDay ?? null,
      verifiedPerDay: report?.metrics?.throughput?.verifiedPerDay ?? null,
    },
  };
  const next = { ...(baseline ?? {}) };
  next.history = [
    ...(next.history ?? []).filter(row => row?.date !== date),
    row,
  ].slice(-HISTORY_DAYS);
  next.historyUpdatedAt = iso;
  return next;
}

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
      else if (def.unsupported)
        errors.push(`${key}: metric is unsupported and must not be baselined`);
      const value = Number(entry?.value ?? entry);
      if (!Number.isFinite(value) || value < 0)
        errors.push(`${key}: value must be a non-negative number`);
    }
  if (baseline.history !== undefined && !Array.isArray(baseline.history))
    errors.push('history must be an array');
  return { ok: errors.length === 0, errors };
}
