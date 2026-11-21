/**
 * Ranked SLO intake — pick exactly one shipping-SLO regression for Linear.
 *
 * Ranking: largest |changeFraction| first; stable tie-break by METRIC_DEFS
 * order then key. Flat growth is a candidate only when no absolute
 * regressions remain (severity 0).
 *
 * Re-rank: once the owned issue is completed/canceled (after a verified or
 * not-reproduced win), the next shipping-slo run picks the new top among
 * remaining regressions. While an open child still matches a live
 * regression, intake sticks to that metric so ranking flips do not spam.
 */

import { METRIC_DEFS } from './shipping-slo-baseline.mjs';
import { WIN_TEMPLATE } from './wins-ledger.mjs';

/** Map ratchet metric keys → `docs/metrics/shipping-slo-latest.json` paths. */
export const SLO_LATEST_PATHS = Object.freeze({
  'ci_walltime.pull_request.p95': 'ciP95Seconds.pull_request',
  'ci_walltime.merge_group.p95': 'ciP95Seconds.merge_group',
  'merge_queue.wait.p95': 'queueWaitP95Seconds',
  'merge_queue.ejection_rate': 'queueEjectionRate',
  'lead_time.devin.p95': 'leadTimeP95Seconds.devin',
  'lead_time.codex.p95': 'leadTimeP95Seconds.codex',
  'lead_time.other.p95': 'leadTimeP95Seconds.other',
  'remediation.pr_red_to_green.p95': 'remediationP95Seconds.prRedToGreen',
  'remediation.main_red_to_green.p95': 'remediationP95Seconds.mainRedToGreen',
  'remediation.production_promote_hold.p95':
    'remediationP95Seconds.productionPromoteHold',
  'production_lag.merged_to_verified.p95': 'productionLagP95Seconds',
  'throughput.merges_per_day': 'throughput.mergesPerDay',
  'throughput.verified_per_day': 'throughput.verifiedPerDay',
  'throughput.growth_flat': 'throughput.wowGrowth',
});

const metricOrder = key => {
  const i = METRIC_DEFS.findIndex(d => d.key === key);
  return i < 0 ? METRIC_DEFS.length + 1 : i;
};

/**
 * @param {{ evaluation?: { regressions?: Array<{ key: string, baseline?: number, observed?: number, changeFraction?: number|null, kind?: string }>, flatStall?: boolean }, flat?: Record<string, unknown> }} report
 * @returns {Array<{ key: string, metric: string, kind: string, baseline: number|null, observed: number|null, changeFraction: number|null, severity: number }>}
 */
export function rankSloIntakeCandidates(report) {
  const regressions = report?.evaluation?.regressions ?? [];
  const ranked = regressions.map(row => {
    const change = Number(row.changeFraction);
    return {
      key: row.key,
      metric: row.key,
      kind: row.kind ?? 'latency_regression',
      baseline: Number.isFinite(row.baseline) ? row.baseline : null,
      observed: Number.isFinite(row.observed) ? row.observed : null,
      changeFraction: Number.isFinite(change) ? change : null,
      severity: Number.isFinite(change) ? Math.abs(change) : 0,
    };
  });

  if (report?.evaluation?.flatStall) {
    const wow = Number(
      report?.flat?.wowGrowth ?? report?.flat?.throughput_wow_growth
    );
    ranked.push({
      key: 'throughput.growth_flat',
      metric: 'throughput.growth_flat',
      kind: 'flat_growth',
      baseline: null,
      observed: Number.isFinite(wow) ? wow : null,
      changeFraction: null,
      // Absolute regressions always outrank flat growth.
      severity: 0,
    });
  }

  return ranked.sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    const order = metricOrder(a.key) - metricOrder(b.key);
    if (order !== 0) return order;
    return a.key.localeCompare(b.key);
  });
}

/**
 * Pick the single intake target.
 * @param {ReturnType<typeof rankSloIntakeCandidates>} ranked
 * @param {{ openMetrics?: string[] }} [opts]
 */
export function pickRankedSloIntake(ranked, { openMetrics = [] } = {}) {
  if (!ranked.length) return null;
  const open = new Set(openMetrics.filter(Boolean));
  if (open.size) {
    const sticky = ranked.find(row => open.has(row.metric));
    if (sticky) return { target: sticky, mode: 'sticky', ranked };
  }
  return { target: ranked[0], mode: 'top', ranked };
}

/**
 * Suggested measure-due source line for a ranked metric.
 * @param {string} metric
 * @param {{ baseline?: number|null, observed?: number|null }} [opts]
 */
export function suggestedWinMetricLine(metric, opts = {}) {
  const baseline = opts.baseline;
  const observed = opts.observed;
  const path = SLO_LATEST_PATHS[metric];
  const unit =
    metric.includes('ejection') || metric.includes('growth')
      ? 'ratio'
      : metric.includes('per_day')
        ? 'per_day'
        : 's';
  const better =
    metric.startsWith('throughput.') && metric !== 'throughput.growth_flat'
      ? 'higher'
      : 'lower';
  const before = Number.isFinite(baseline) ? baseline : observed;
  const source = path
    ? `docs/metrics/shipping-slo-latest.json#${path}`
    : 'docs/metrics/shipping-slo-latest.json';
  const query = path ?? metric;
  return `- Metric: ${metric} | ${unit} | ${better} | ${before ?? '?'} | ? | ${source} | ${query}`;
}

/**
 * Build Linear title + body for the ranked finding (requires ## Win on the fix).
 */
export function buildRankedFindingBody(row, { runUrl, ranked, mode }) {
  const changePct =
    row.changeFraction == null
      ? 'n/a'
      : `${Math.floor(row.changeFraction * 100)}%`;
  const others = ranked
    .filter(r => r.metric !== row.metric)
    .slice(0, 8)
    .map(r => {
      const pct =
        r.changeFraction == null
          ? 'flat'
          : `${Math.floor(r.changeFraction * 100)}%`;
      return `- \`${r.metric}\` (${pct})`;
    });

  const winLine = suggestedWinMetricLine(row.metric, row);
  const title =
    row.metric === 'throughput.growth_flat'
      ? 'slo-regression: throughput growth flat below +8% WoW target (ranked)'
      : `slo-regression: ${row.metric} >20% over baseline (ranked)`;

  const body = [
    '## Ranked shipping-SLO intake',
    '',
    'Exactly **one** owned regression from the shipping-SLO ratchet (JOV-6783).',
    `Selection: \`${mode}\` — top by |changeFraction|, sticky while an open child still matches a live regression.`,
    '',
    '| Metric | Baseline | Observed | Change |',
    '| --- | --- | --- | --- |',
    `| \`${row.metric}\` | ${row.baseline ?? '—'} | ${row.observed ?? '—'} | ${changePct} |`,
    '',
    '### Also regressing (not filed — re-rank after this win verifies)',
    ...(others.length ? others : ['- _(none)_']),
    '',
    '## Required `## Win`',
    '',
    'The fixing PR **must** include a `## Win` section so `measure-due` can verify after merge.',
    'See `docs/operations/WINS_LEDGER.md`. Suggested metric line (fill after once live):',
    '',
    '```',
    '## Win',
    '',
    `- Claim: Restore ${row.metric} to within baseline`,
    '- Area: ci',
    '- Theme: shipping-slo-regression',
    winLine,
    `- Verify: ${runUrl}`,
    '- Pending: yes',
    '```',
    '',
    'Paste-ready Fleet Rules template:',
    '',
    '```',
    WIN_TEMPLATE.trimEnd(),
    '```',
    '',
    `Measurement run: ${runUrl}`,
    'Baseline: `docs/metrics/shipping-slo-baseline.json`',
    'Snapshot: `docs/metrics/shipping-slo-latest.json`',
    '',
    '### Re-rank rule',
    '',
    'When this issue is completed or canceled (win verified or not-reproduced),',
    'the next shipping-slo run selects the new top remaining regression.',
    'While this issue stays open and its metric is still regressing, intake',
    'keeps updating this issue instead of filing a second one.',
  ].join('\n');

  return { metric: row.metric, title, body };
}
