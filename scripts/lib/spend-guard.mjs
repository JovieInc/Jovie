/**
 * Spend guard policy (pure functions). Vercel's team budget pauses every project's production
 * deployments at 100 percent (2026-10-29: jov.ie returned 503 DEPLOYMENT_PAUSED for ~1h, unwarned).
 * This module turns `vercel usage` readings into: threshold alerts (50/75/90), a month-end and
 * pause-date projection, 3x spike detection per project/resource, and a plan of SAFE, REVERSIBLE
 * remediations. It never raises a budget; that is Tim's spend decision.
 */
export const SPEND_GUARD_SCHEMA = 'jovie.spend-guard/v1';
export const ALERT_PERCENTS = [50, 75, 90];
export const PAUSE_WARNING_DAYS = 7;
export const SPIKE_FACTOR = 3;
/** Ignore spikes below this daily dollar amount; a tripled $0.02 is noise. */
export const SPIKE_MIN_USD = 0.5;

const DAY_MS = 86_400_000;
const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Cost of a usage service row across CLI versions; the Pro seat is a fixed charge, not usage. */
export function serviceCost(service) {
  if (service?.category === 'subscription' || service?.name === 'Pro') return 0;
  return num(service?.cost ?? service?.effectiveCost);
}
export const totalCost = services =>
  (services ?? []).reduce((sum, s) => sum + serviceCost(s), 0);

/** `vercel usage --breakdown daily --json` -> [{ day, usd, services }] oldest first. */
export function dailySeries(usage) {
  return (usage?.breakdown?.data ?? [])
    .map(row => ({
      day: row.periodKey,
      usd: totalCost(row.services),
      services: row.services ?? [],
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
/** `vercel usage --group-by project --json` -> { project: usd }. */
export function projectTotals(usage) {
  const out = {};
  for (const p of usage?.groupBy?.data ?? [])
    out[p.name] = totalCost(p.services);
  return out;
}

export function thresholdsCrossed(
  spentUsd,
  budgetUsd,
  percents = ALERT_PERCENTS
) {
  if (!(budgetUsd > 0)) return [];
  const pct = (spentUsd / budgetUsd) * 100;
  return percents.filter(p => pct >= p);
}

/**
 * Projection from the trailing-rate (mean of the last `window` complete days) to the period end,
 * and the date the budget is hit. The current day is excluded as partial.
 */
export function project({
  series,
  spentUsd,
  budgetUsd,
  periodEnd,
  now,
  window = 7,
}) {
  const today = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  });
  const complete = series.filter(d => d.day < today).slice(-window);
  const rate = complete.length
    ? complete.reduce((s, d) => s + d.usd, 0) / complete.length
    : 0;
  const daysLeft = Math.max(
    0,
    (new Date(`${periodEnd}T23:59:59Z`).getTime() - now.getTime()) / DAY_MS
  );
  const projected = spentUsd + rate * daysLeft;
  const remaining = budgetUsd - spentUsd;
  const daysToPause =
    remaining <= 0 ? 0 : rate > 0 ? remaining / rate : Infinity;
  const hitDate = Number.isFinite(daysToPause)
    ? new Date(now.getTime() + daysToPause * DAY_MS).toISOString().slice(0, 10)
    : null;
  return {
    ratePerDayUsd: rate,
    projectedUsd: projected,
    daysLeft,
    daysToPause,
    projectedPauseDate: daysToPause <= daysLeft ? hitDate : null,
  };
}

/** Spike: current rate more than `factor` times its baseline, above an absolute floor. */
export function isSpike({
  current,
  baseline,
  factor = SPIKE_FACTOR,
  floor = SPIKE_MIN_USD,
}) {
  return current >= floor && current > factor * Math.max(baseline, 0.0001);
}
/**
 * Compare today's per-project cost (prorated to a full day) with the trailing daily mean.
 * `baselineTotals` covers `baselineDays` complete days; `todayTotals` covers `hoursElapsed` hours.
 */
export function projectAnomalies({
  todayTotals,
  baselineTotals,
  baselineDays = 7,
  hoursElapsed,
}) {
  const scale = 24 / Math.max(hoursElapsed, 1);
  const out = [];
  for (const [name, usd] of Object.entries(todayTotals)) {
    const current = usd * scale,
      baseline = (baselineTotals[name] ?? 0) / baselineDays;
    if (isSpike({ current, baseline }))
      out.push({
        kind: 'project-cost',
        project: name,
        currentUsdPerDay: current,
        baselineUsdPerDay: baseline,
      });
  }
  return out.sort((a, b) => b.currentUsdPerDay - a.currentUsdPerDay);
}
/** Top driver: the resource (service) with the largest cost in one reading. */
export function topDriver(services) {
  const top = [...(services ?? [])].sort(
    (a, b) => serviceCost(b) - serviceCost(a)
  )[0];
  return top && serviceCost(top) > 0
    ? { resource: top.name, usd: serviceCost(top) }
    : null;
}
/** Builds per hour per project vs the project's earlier hourly mean. `counts` = { project: [hourly counts, oldest first] }. */
export function buildAnomalies(
  counts,
  { factor = SPIKE_FACTOR, floor = 6 } = {}
) {
  const out = [];
  for (const [project, hours] of Object.entries(counts)) {
    if (hours.length < 3) continue;
    const current = hours[hours.length - 1];
    const base =
      hours.slice(0, -1).reduce((s, n) => s + n, 0) / (hours.length - 1);
    if (isSpike({ current, baseline: base, factor, floor }))
      out.push({ kind: 'builds-per-hour', project, current, baseline: base });
  }
  return out;
}

/**
 * Decide what the guard may do. Every action is reversible and logged.
 * `policy` maps project name -> { ignoreCommand } (ops/registry/vercel-projects.json).
 */
export function planRemediations({
  projects,
  policy,
  watch = Object.keys(policy),
  anomalies = [],
  level = 0,
}) {
  const actions = [];
  for (const p of projects) {
    const want = policy[p.name]?.ignoreCommand;
    if (want && p.ignoreCommand !== want)
      actions.push({
        action: 'set-ignored-build',
        project: p.name,
        projectId: p.id,
        from: p.ignoreCommand ?? null,
        to: want,
        reversible: true,
        autoApply: true,
      });
    else if (!p.ignoreCommand && watch.includes(p.name) && !want)
      actions.push({
        action: 'report-missing-ignored-build',
        project: p.name,
        reversible: true,
        autoApply: false,
        reason:
          'watched project has no ignored-build command and no safe policy command yet',
      });
  }
  for (const a of anomalies.filter(x => x.kind === 'builds-per-hour'))
    actions.push({
      action: 'throttle-branch-automation',
      project: a.project,
      reversible: true,
      autoApply: false,
      detail:
        'pause update-branch/rerun automation (label hold) and cap controller retry builds',
    });
  if (level >= 75)
    actions.push({
      action: 'pause-noncritical-crons',
      reversible: true,
      autoApply: false,
      detail: 'registry crons marked noncritical',
    });
  return actions;
}

export const BANNED_ACTIONS = new Set([
  'raise-budget',
  'remove-budget',
  'disable-pause',
]);
export function assertSafeActions(actions) {
  for (const a of actions)
    if (BANNED_ACTIONS.has(a.action) || a.reversible !== true)
      throw new Error(`unsafe spend action refused: ${a.action}`);
  return actions;
}

/** One line for Summer/iMessage: provider, %, projected date, driver, what was auto-fixed, decision needed. */
export function oneLiner({
  provider = 'Vercel',
  percent,
  spentUsd,
  budgetUsd,
  projectedPauseDate,
  driver,
  autoFixed = [],
  decision,
}) {
  const parts = [
    `${provider} ${Math.round(percent)}% ($${spentUsd.toFixed(0)}/$${budgetUsd.toFixed(0)})`,
  ];
  parts.push(
    projectedPauseDate ? `pause ~${projectedPauseDate}` : 'no pause projected'
  );
  if (driver) parts.push(`driver: ${driver}`);
  parts.push(
    autoFixed.length
      ? `fixed: ${autoFixed.join(', ')}`
      : 'fixed: nothing needed'
  );
  parts.push(decision ? `needs you: ${decision}` : 'needs you: nothing');
  return parts.join(' | ');
}

export function evaluate({
  budgetUsd,
  spentUsd,
  series,
  periodEnd,
  now,
  anomalies = [],
  projects = [],
  policy = {},
  watch = undefined,
}) {
  const crossed = thresholdsCrossed(spentUsd, budgetUsd);
  const projection = project({ series, spentUsd, budgetUsd, periodEnd, now });
  const level = crossed.length ? crossed[crossed.length - 1] : 0;
  const nearPause =
    projection.projectedPauseDate !== null &&
    projection.daysToPause < PAUSE_WARNING_DAYS;
  const actions = assertSafeActions(
    planRemediations({ projects, policy, watch, anomalies, level })
  );
  const alert = level > 0 || nearPause || anomalies.length > 0;
  return {
    schema: SPEND_GUARD_SCHEMA,
    at: now.toISOString(),
    budgetUsd,
    spentUsd,
    level,
    crossed,
    nearPause,
    projection,
    anomalies,
    actions,
    alert,
  };
}
