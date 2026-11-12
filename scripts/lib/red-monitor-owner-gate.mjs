/**
 * Red-monitor owner gate (jovie-red-monitor-gate/v1).
 *
 * A monitor that stays red is an incident or it is deleted
 * (docs/ON_CALL_PROCESS.md, "Red monitors need an owner"). For every
 * scheduled or post-deploy workflow in canon/automation-registry.jsonl, a red
 * streak of more than MAX_CONSECUTIVE_FAILURES conclusive failures, or a red
 * streak whose first failure is more than MAX_RED_HOURS old, needs an open
 * incident with a live owner lease in canon/monitor-incidents.jsonl. The age
 * counts from the first failure, not the last green: a weekly or daily
 * monitor's last green is a cadence ago, so its first failure is not yet a
 * day of red.
 *
 * A lease has the jovie-hold/v1 shape: an owner, an expiry (`until`) and a
 * reason, and lasts no longer than MAX_HOLD_MS (7 days) from `openedAt`, so an
 * owner who walks away stops covering the monitor within a week.
 *
 * Report-only until ENFORCE_FROM, then the check fails. Pure: the caller
 * passes `nowMs` and the run lists; nothing here reads a clock or the network.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_HOLD_MS } from '../hold-contract.mjs';

export const RED_MONITOR_GATE_SCHEMA = 'jovie-red-monitor-gate/v1';
export const MONITOR_INCIDENT_SCHEMA = 'jovie-monitor-incident/v1';
export const MONITOR_INCIDENTS_PATH = 'canon/monitor-incidents.jsonl';
export const MAX_CONSECUTIVE_FAILURES = 3;
export const MAX_RED_HOURS = 24;
export const LEASE_MAX_MS = MAX_HOLD_MS;
// Report-only for two weeks from landing (2026-11-11) so today's offenders
// can open incidents, fix, or retire their monitors first.
export const ENFORCE_FROM = '2026-11-25T00:00:00Z';
/** Registry trigger kinds that make a workflow scheduled or post-deploy. */
export const GATED_TRIGGER_KINDS = new Set([
  'github-cron',
  'lanes-clock',
  'github-event',
]);

const HOUR_MS = 3600 * 1000;
const ms = value => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Scheduled or post-deploy GitHub workflow with a run receipt. */
export function isGatedMonitor(entry) {
  return (
    entry?.status === 'live' &&
    entry?.receipt?.kind === 'github-workflow' &&
    GATED_TRIGGER_KINDS.has(entry?.trigger?.kind)
  );
}

/**
 * Red streak from a list of GitHub workflow runs (any order, duplicates
 * allowed). Only success and failure carry a verdict. When no green run is in
 * the list, `lastGreenAt` is null and `greenBefore` is the oldest verdict seen:
 * the last green is no later than that. `redSince` is the first failure of
 * the streak in view (a lower bound on how long it has been red).
 */
export function summarizeRunStreak(runs = []) {
  const seen = new Set();
  const conclusive = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    if (run?.conclusion !== 'success' && run?.conclusion !== 'failure')
      continue;
    const key = run.id ?? `${run.created_at}:${run.conclusion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    conclusive.push(run);
  }
  conclusive.sort((a, b) => (ms(b.created_at) ?? 0) - (ms(a.created_at) ?? 0));
  const greenIndex = conclusive.findIndex(run => run.conclusion === 'success');
  const failures =
    greenIndex === -1 ? conclusive : conclusive.slice(0, greenIndex);
  const green = greenIndex === -1 ? null : conclusive[greenIndex];
  return {
    conclusiveRuns: conclusive.length,
    consecutiveFailures: failures.length,
    countIsLowerBound: greenIndex === -1 && conclusive.length > 0,
    lastGreenAt: green ? (green.updated_at ?? green.created_at) : null,
    greenBefore:
      green || !conclusive.length ? null : conclusive.at(-1).created_at,
    redSince: failures.length ? failures.at(-1).created_at : null,
    failingRunIds: failures.slice(0, 5).map(run => run.id),
  };
}

/** Parse canon/monitor-incidents.jsonl text (line 1 is the schema header). */
export function parseMonitorIncidents(text = '') {
  const leases = [];
  const errors = [];
  String(text)
    .split('\n')
    .forEach((line, index) => {
      if (!line.trim()) return;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        errors.push(`line ${index + 1}: not JSON`);
        return;
      }
      if (row?.schema === MONITOR_INCIDENT_SCHEMA) return;
      const missing = ['workflow', 'incident', 'owner', 'openedAt', 'until']
        .filter(key => typeof row?.[key] !== 'string' || !row[key].trim())
        .concat(
          ['openedAt', 'until'].filter(
            key => typeof row?.[key] === 'string' && ms(row[key]) === null
          )
        );
      if (missing.length) {
        errors.push(
          `line ${index + 1}: missing or invalid ${missing.join(', ')}`
        );
        return;
      }
      leases.push({
        repo: typeof row.repo === 'string' ? row.repo : null,
        workflow: row.workflow,
        incident: row.incident,
        owner: row.owner,
        openedAt: row.openedAt,
        until: row.until,
        reason: typeof row.reason === 'string' ? row.reason.slice(0, 200) : '',
      });
    });
  return { leases, errors };
}

export function loadMonitorIncidents(repoRoot) {
  try {
    return parseMonitorIncidents(
      readFileSync(resolve(repoRoot, MONITOR_INCIDENTS_PATH), 'utf8')
    );
  } catch {
    return { leases: [], errors: [`${MONITOR_INCIDENTS_PATH}: unreadable`] };
  }
}

/** Live: not expired, and no older than LEASE_MAX_MS from its opening. */
export function leaseIsLive(lease, nowMs) {
  const opened = ms(lease?.openedAt);
  const until = ms(lease?.until);
  if (opened === null || until === null || !lease?.owner) return false;
  return nowMs < Math.min(until, opened + LEASE_MAX_MS);
}

/** Does this streak need an owner? Green-now is never red, however old. */
export function needsOwner(streak, nowMs) {
  if (!streak || streak.consecutiveFailures === 0) return false;
  if (streak.consecutiveFailures > MAX_CONSECUTIVE_FAILURES) return true;
  const bound = redBoundMs(streak);
  return bound === null || nowMs - bound > MAX_RED_HOURS * HOUR_MS;
}

/**
 * When the streak went red: its first failure; an older observation without
 * redSince falls back to the last green (or the oldest verdict in view).
 */
function redBoundMs(streak) {
  return (
    ms(streak.redSince) ?? ms(streak.lastGreenAt) ?? ms(streak.greenBefore)
  );
}

/**
 * @param {{ registry: any, observations: Map<string, any>, incidents?: { leases: any[], errors: string[] }, nowMs: number, enforceFrom?: string }} input
 * `observations` maps registry entry id to its liveness observation; the
 * github-workflow observer puts summarizeRunStreak output on `.streak`.
 */
export function evaluateRedMonitors({
  registry,
  observations,
  incidents = { leases: [], errors: [] },
  nowMs,
  enforceFrom = ENFORCE_FROM,
}) {
  const enforcing = nowMs >= (ms(enforceFrom) ?? Number.POSITIVE_INFINITY);
  const byWorkflow = new Map();
  for (const entry of registry?.entries ?? []) {
    if (!isGatedMonitor(entry)) continue;
    const streak = observations?.get(entry.id)?.streak;
    if (!streak) continue;
    const key = `${entry.receipt.repo}/${entry.receipt.workflow}`;
    const row = byWorkflow.get(key) ?? {
      repo: entry.receipt.repo,
      workflow: entry.receipt.workflow,
      ids: [],
      streak,
    };
    row.ids.push(entry.id);
    byWorkflow.set(key, row);
  }
  const offenders = [];
  const owned = [];
  const leaseFor = row =>
    (incidents.leases ?? []).filter(
      lease =>
        lease.workflow === row.workflow &&
        (!lease.repo || lease.repo === row.repo)
    );
  for (const row of byWorkflow.values()) {
    if (!needsOwner(row.streak, nowMs)) continue;
    const redFrom = redBoundMs(row.streak);
    const detail = {
      workflow: row.workflow,
      repo: row.repo,
      automationIds: row.ids,
      consecutiveFailures: row.streak.consecutiveFailures,
      countIsLowerBound: row.streak.countIsLowerBound,
      lastGreenAt: row.streak.lastGreenAt,
      redHours:
        redFrom === null ? null : Math.floor((nowMs - redFrom) / HOUR_MS),
      failingRunIds: row.streak.failingRunIds,
    };
    const leases = leaseFor(row);
    const live = leases.find(lease => leaseIsLive(lease, nowMs));
    if (live)
      owned.push({
        ...detail,
        incident: live.incident,
        owner: live.owner,
        until: live.until,
      });
    else
      offenders.push({
        ...detail,
        reason: leases.length ? 'lease-expired' : 'no-incident',
      });
  }
  const status =
    offenders.length || incidents.errors?.length
      ? enforcing
        ? 'fail'
        : 'warn'
      : 'pass';
  return {
    schema: RED_MONITOR_GATE_SCHEMA,
    mode: enforcing ? 'enforcing' : 'report-only',
    enforceFrom,
    status,
    offenders,
    owned,
    incidentErrors: incidents.errors ?? [],
  };
}

export function redMonitorSummary(result) {
  const rows = result.offenders.map(
    row =>
      `| ${row.workflow} | ${row.consecutiveFailures}${row.countIsLowerBound ? '+' : ''} | ${row.lastGreenAt ?? 'not in view'} | ${row.reason} |`
  );
  return [
    `### Red monitors without an owner: ${result.status} (${result.mode}, enforcing from ${result.enforceFrom})`,
    '',
    rows.length
      ? [
          '| workflow | consecutive failures | last green | reason |',
          '|---|---|---|---|',
          ...rows,
        ].join('\n')
      : 'Every red scheduled or post-deploy monitor has an open incident with a live owner lease.',
    '',
    `Owned: ${result.owned.map(row => `${row.workflow} (${row.incident}, ${row.owner})`).join(', ') || 'none'}.`,
    ...result.incidentErrors.map(
      error => `- ${MONITOR_INCIDENTS_PATH}: ${error}`
    ),
    '',
  ].join('\n');
}

/** One GitHub annotation per offender: error once enforcing, warning before. */
export function redMonitorAnnotations(result) {
  const level = result.status === 'fail' ? 'error' : 'warning';
  return result.offenders
    .map(
      row =>
        `::${level}::red monitor without an owner: ${row.workflow} (${row.consecutiveFailures}${row.countIsLowerBound ? '+' : ''} consecutive failures, ${row.reason})\n`
    )
    .join('');
}

/** @param {any} report a liveness report; true once enforcing with offenders. */
export function enforcedRed(report) {
  return report?.redMonitors?.status === 'fail';
}
