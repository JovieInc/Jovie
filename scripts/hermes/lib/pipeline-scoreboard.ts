import { existsSync, readFileSync } from 'node:fs';

import {
  CODEX_BLOCKED_LABEL,
  CODEX_CLAIM_LABEL,
  CODEX_SOURCE_LABEL,
  EPIC_LABEL,
  type GithubIssue,
  HUMAN_REVIEW_LABEL,
  labelNames,
  NO_AUTO_LABEL,
} from './codex-issue-shipper';

export const PIPELINE_SCOREBOARD_SCHEMA_VERSION = 1;
export const BLOCKED_DELTA_CRITICAL_THRESHOLD = 15;

export interface PipelineScoreboardWindow {
  readonly since: string;
  readonly until: string;
}

export interface PipelineScoreboard {
  readonly schemaVersion: number;
  readonly ts: string;
  readonly window: PipelineScoreboardWindow;
  readonly funnel: {
    readonly ready: number;
    readonly claimed: number;
    readonly inProgress: number;
    readonly blocked: number;
    readonly deltas: {
      readonly ready: number;
      readonly claimed: number;
      readonly inProgress: number;
      readonly blocked: number;
    };
  };
  readonly shipper: {
    readonly claims: number;
    readonly ships: number;
    readonly failuresByCategory: Record<string, number>;
    readonly retriesUsed: number;
    readonly costPerShippedIssueUsd: number | null;
  };
  readonly queue: {
    readonly merges: number;
    readonly mqAttemptsPerMerge: number | null;
    readonly timeToMergeSeconds: {
      readonly p50: number;
      readonly p95: number;
    };
    readonly timeToMergeAvailable?: boolean;
    readonly timeToMergeUnavailableReason?:
      | 'partial_hydration'
      | 'no_samples'
      | 'unavailable';
  };
  readonly gates: {
    readonly tasteLabeledPrsWeek: number;
    readonly autofixInterventions: number;
  };
  readonly alarms: ReadonlyArray<PipelineScoreboardAlarm>;
}

export interface PipelineScoreboardAlarm {
  readonly rule: 'blocked_delta' | 'zero_ships_after_claims';
  readonly severity: 'warning' | 'critical';
  readonly message: string;
}

export interface JobLogEntry {
  readonly job?: string;
  readonly event?: string;
  readonly ts?: string;
  readonly issue?: number;
  readonly cost?: number;
  readonly [key: string]: unknown;
}

export interface PipelineScoreboardInput {
  readonly ts: string;
  readonly window: PipelineScoreboardWindow;
  readonly issues: ReadonlyArray<GithubIssue>;
  readonly previous?: PipelineScoreboard | null;
  readonly jobLogEntries?: ReadonlyArray<JobLogEntry>;
  readonly ciMetrics?: {
    readonly hydration?: {
      readonly complete?: boolean;
    };
    readonly sampleSizes?: {
      readonly fleetLeadTime?: number;
    };
    readonly throughput?: {
      readonly queueWaitSeconds?: {
        readonly p50?: number;
        readonly p95?: number;
      };
    };
    readonly latency?: {
      readonly fleetLeadTimeSeconds?: {
        readonly p50?: number;
        readonly p95?: number;
      };
      readonly readyToMergeSeconds?: {
        readonly p50?: number;
        readonly p95?: number;
      };
    };
  } | null;
  readonly mergedPrs?: ReadonlyArray<{
    readonly labels?: ReadonlyArray<{ readonly name?: string } | string>;
  }>;
}

const FAILURE_EVENTS = new Set([
  'agent_failed',
  'deterministic_finish_failed',
  'dispatch_failed',
  'gbrain_failed',
  'missing_pr_release_claim',
]);

const RETRY_EVENTS = new Set([
  'agent_interrupted_release_claim',
  'missing_pr_release_claim',
  'restart_recovered_claim',
]);

const AUTOFIX_EVENTS = new Set([
  'deterministic_finish_shipped',
  'agent_no_work_fallback',
]);

const CLAIM_EVENTS = new Set([
  'agent_succeeded',
  'agent_failed',
  'gbrain_failed',
  'agent_interrupted_release_claim',
  'missing_pr_release_claim',
]);

const SHIP_EVENTS = new Set([
  'pr_found_after_success',
  'deterministic_finish_shipped',
]);

export function dailyWindow(now = new Date()): PipelineScoreboardWindow {
  const until = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const since = new Date(until.getTime() - 86_400_000);
  return { since: since.toISOString(), until: until.toISOString() };
}

export function last12HoursWindow(now = new Date()): PipelineScoreboardWindow {
  return {
    since: new Date(now.getTime() - 12 * 3_600_000).toISOString(),
    until: now.toISOString(),
  };
}

function isBetween(
  ts: string | undefined,
  window: PipelineScoreboardWindow
): boolean {
  return typeof ts === 'string' && ts >= window.since && ts < window.until;
}

export function readJsonlEntries(path: string): JobLogEntry[] {
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .flatMap(line => {
        try {
          return [JSON.parse(line) as JobLogEntry];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPercentileRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['p50', 'p95'].every(
    key => value[key] === undefined || typeof value[key] === 'number'
  );
}

function isPipelineScoreboard(value: unknown): value is PipelineScoreboard {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === PIPELINE_SCOREBOARD_SCHEMA_VERSION &&
    isRecord(value.window) &&
    typeof value.window.since === 'string' &&
    typeof value.window.until === 'string' &&
    isRecord(value.funnel) &&
    isRecord(value.shipper) &&
    isRecord(value.queue) &&
    isRecord(value.gates) &&
    Array.isArray(value.alarms)
  );
}

function isCiMetricsSnapshot(
  value: unknown
): value is NonNullable<PipelineScoreboardInput['ciMetrics']> {
  if (!isRecord(value)) return false;
  const throughput = value.throughput;
  const latency = value.latency;
  const hydration = value.hydration;
  const sampleSizes = value.sampleSizes;
  return (
    (hydration === undefined ||
      (isRecord(hydration) &&
        (hydration.complete === undefined ||
          typeof hydration.complete === 'boolean'))) &&
    (sampleSizes === undefined ||
      (isRecord(sampleSizes) &&
        (sampleSizes.fleetLeadTime === undefined ||
          typeof sampleSizes.fleetLeadTime === 'number'))) &&
    (throughput === undefined ||
      (isRecord(throughput) &&
        (throughput.queueWaitSeconds === undefined ||
          isPercentileRecord(throughput.queueWaitSeconds)))) &&
    (latency === undefined ||
      (isRecord(latency) &&
        (latency.fleetLeadTimeSeconds === undefined ||
          isPercentileRecord(latency.fleetLeadTimeSeconds)) &&
        (latency.readyToMergeSeconds === undefined ||
          isPercentileRecord(latency.readyToMergeSeconds))))
  );
}

export function readLatestScoreboard(path: string): PipelineScoreboard | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return isPipelineScoreboard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readLatestCiMetrics(
  path: string
): PipelineScoreboardInput['ciMetrics'] {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return isCiMetricsSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function issueHas(issue: GithubIssue, label: string): boolean {
  return labelNames(issue).includes(label);
}

function funnelCounts(issues: ReadonlyArray<GithubIssue>) {
  const codexIssues = issues.filter(issue =>
    issueHas(issue, CODEX_SOURCE_LABEL)
  );
  const claimed = codexIssues.filter(issue =>
    issueHas(issue, CODEX_CLAIM_LABEL)
  ).length;
  const blocked = codexIssues.filter(issue =>
    issueHas(issue, CODEX_BLOCKED_LABEL)
  ).length;
  const ready = codexIssues.filter(issue => {
    const labels = new Set(labelNames(issue));
    return (
      !labels.has(CODEX_CLAIM_LABEL) &&
      !labels.has(CODEX_BLOCKED_LABEL) &&
      !labels.has(HUMAN_REVIEW_LABEL) &&
      !labels.has(NO_AUTO_LABEL) &&
      !labels.has(EPIC_LABEL)
    );
  }).length;
  return {
    ready,
    claimed,
    inProgress: claimed,
    blocked,
  };
}

function delta(current: number, previous: number | undefined): number {
  return current - (previous ?? 0);
}

function failureCategory(entry: JobLogEntry): string {
  if (typeof entry.error === 'string' && entry.error.trim()) {
    const compact = entry.error
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
    return compact || String(entry.event ?? 'unknown');
  }
  return String(entry.event ?? 'unknown');
}

function countBy<T>(
  items: ReadonlyArray<T>,
  key: (item: T) => string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

function labelList(
  labels: ReadonlyArray<{ readonly name?: string } | string> | undefined
): ReadonlyArray<string> {
  return (labels ?? [])
    .map(label => (typeof label === 'string' ? label : label.name))
    .filter((label): label is string => Boolean(label));
}

function countUniqueIssues(
  entries: ReadonlyArray<JobLogEntry>,
  eventNames: ReadonlySet<string>
): number {
  let withoutIssue = 0;
  const issues = new Set<number>();
  for (const entry of entries) {
    if (!eventNames.has(String(entry.event))) continue;
    if (typeof entry.issue === 'number') {
      issues.add(entry.issue);
    } else {
      withoutIssue += 1;
    }
  }
  return issues.size + withoutIssue;
}

export function buildPipelineScoreboard(
  input: PipelineScoreboardInput
): PipelineScoreboard {
  const counts = funnelCounts(input.issues);
  const previousFunnel = input.previous?.funnel;
  const entries = (input.jobLogEntries ?? []).filter(entry =>
    isBetween(entry.ts, input.window)
  );
  const shipperEntries = entries.filter(
    entry => entry.job === 'codex-issue-shipper'
  );
  const claims = countUniqueIssues(shipperEntries, CLAIM_EVENTS);
  const ships = countUniqueIssues(shipperEntries, SHIP_EVENTS);
  const failures = shipperEntries.filter(entry =>
    FAILURE_EVENTS.has(String(entry.event))
  );
  const retriesUsed = shipperEntries.filter(entry =>
    RETRY_EVENTS.has(String(entry.event))
  ).length;
  const totalCost = shipperEntries
    .map(entry => (typeof entry.cost === 'number' ? entry.cost : 0))
    .reduce((sum, value) => sum + value, 0);
  const merges = input.mergedPrs?.length ?? 0;
  const mqAttempts = input.mergedPrs?.filter(pr =>
    labelList(pr.labels).includes('merge-queue')
  ).length;
  const schemaV2FleetLeadTime = input.ciMetrics?.latency?.fleetLeadTimeSeconds;
  const fleetLeadTime =
    schemaV2FleetLeadTime ?? input.ciMetrics?.latency?.readyToMergeSeconds;
  const timeToMergeAvailable =
    input.ciMetrics?.hydration?.complete !== false &&
    fleetLeadTime !== undefined &&
    (schemaV2FleetLeadTime === undefined ||
      (input.ciMetrics?.sampleSizes?.fleetLeadTime ?? 0) > 0);
  const timeToMergeUnavailableReason = timeToMergeAvailable
    ? undefined
    : input.ciMetrics?.hydration?.complete === false
      ? 'partial_hydration'
      : schemaV2FleetLeadTime !== undefined &&
          (input.ciMetrics?.sampleSizes?.fleetLeadTime ?? 0) <= 0
        ? 'no_samples'
        : 'unavailable';
  const gateEntries = shipperEntries;

  const scoreboard: PipelineScoreboard = {
    schemaVersion: PIPELINE_SCOREBOARD_SCHEMA_VERSION,
    ts: input.ts,
    window: input.window,
    funnel: {
      ...counts,
      deltas: {
        ready: delta(counts.ready, previousFunnel?.ready),
        claimed: delta(counts.claimed, previousFunnel?.claimed),
        inProgress: delta(counts.inProgress, previousFunnel?.inProgress),
        blocked: delta(counts.blocked, previousFunnel?.blocked),
      },
    },
    shipper: {
      claims,
      ships,
      failuresByCategory: countBy(failures, failureCategory),
      retriesUsed,
      costPerShippedIssueUsd:
        ships > 0 ? Number((totalCost / ships).toFixed(4)) : null,
    },
    queue: {
      merges,
      mqAttemptsPerMerge:
        merges > 0 && typeof mqAttempts === 'number'
          ? Number((mqAttempts / merges).toFixed(2))
          : null,
      timeToMergeSeconds: {
        p50: timeToMergeAvailable ? (fleetLeadTime.p50 ?? 0) : 0,
        p95: timeToMergeAvailable ? (fleetLeadTime.p95 ?? 0) : 0,
      },
      timeToMergeAvailable,
      timeToMergeUnavailableReason,
    },
    gates: {
      tasteLabeledPrsWeek:
        input.mergedPrs?.filter(pr =>
          labelList(pr.labels).some(label => label.includes('taste'))
        ).length ?? 0,
      autofixInterventions: gateEntries.filter(entry =>
        AUTOFIX_EVENTS.has(String(entry.event))
      ).length,
    },
    alarms: [],
  };

  return { ...scoreboard, alarms: evaluatePipelineAlarms(scoreboard) };
}

export function evaluatePipelineAlarms(
  scoreboard: PipelineScoreboard
): ReadonlyArray<PipelineScoreboardAlarm> {
  const alarms: PipelineScoreboardAlarm[] = [];
  const windowLabel = `${scoreboard.window.since} to ${scoreboard.window.until}`;
  if (scoreboard.funnel.deltas.blocked > BLOCKED_DELTA_CRITICAL_THRESHOLD) {
    alarms.push({
      rule: 'blocked_delta',
      severity: 'critical',
      message: `Blocked issue count increased by ${scoreboard.funnel.deltas.blocked} from ${windowLabel}.`,
    });
  }
  if (scoreboard.shipper.claims > 0 && scoreboard.shipper.ships === 0) {
    alarms.push({
      rule: 'zero_ships_after_claims',
      severity: 'critical',
      message: `Shipper recorded ${scoreboard.shipper.claims} claim attempt(s) and 0 shipped PRs from ${windowLabel}.`,
    });
  }
  return alarms;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function fmtSeconds(seconds: number): string {
  if (!seconds) return '0m';
  return `${Math.round(seconds / 60)}m`;
}

export function renderPipelineScoreboard(
  scoreboard: PipelineScoreboard
): string {
  const failureText = Object.entries(scoreboard.shipper.failuresByCategory)
    .map(([key, value]) => `${key}:${value}`)
    .join(', ');
  const timeToMergeText =
    scoreboard.queue.timeToMergeAvailable !== false
      ? `p50 ${fmtSeconds(scoreboard.queue.timeToMergeSeconds.p50)} / p95 ${fmtSeconds(scoreboard.queue.timeToMergeSeconds.p95)}`
      : scoreboard.queue.timeToMergeUnavailableReason === 'partial_hydration'
        ? 'n/a (partial hydration)'
        : scoreboard.queue.timeToMergeUnavailableReason === 'no_samples'
          ? 'n/a (no samples)'
          : 'n/a';
  return [
    `Pipeline scoreboard (${scoreboard.window.since.slice(0, 10)} UTC)`,
    `Funnel: ready ${scoreboard.funnel.ready} (${signed(scoreboard.funnel.deltas.ready)}) · claimed ${scoreboard.funnel.claimed} (${signed(scoreboard.funnel.deltas.claimed)}) · in-progress ${scoreboard.funnel.inProgress} (${signed(scoreboard.funnel.deltas.inProgress)}) · blocked ${scoreboard.funnel.blocked} (${signed(scoreboard.funnel.deltas.blocked)})`,
    `Shipper: claims ${scoreboard.shipper.claims} · ships ${scoreboard.shipper.ships} · retries ${scoreboard.shipper.retriesUsed} · cost/ship $${scoreboard.shipper.costPerShippedIssueUsd ?? 0}`,
    `Failures: ${failureText || 'none'}`,
    `Queue: merges ${scoreboard.queue.merges} · MQ attempts/merge ${scoreboard.queue.mqAttemptsPerMerge ?? 'n/a'} · time-to-merge ${timeToMergeText}`,
    `Gates: taste-labeled PRs/week ${scoreboard.gates.tasteLabeledPrsWeek} · autofix interventions ${scoreboard.gates.autofixInterventions}`,
    scoreboard.alarms.length
      ? `Alarms: ${scoreboard.alarms.map(alarm => alarm.message).join(' ')}`
      : 'Alarms: none',
  ].join('\n');
}
