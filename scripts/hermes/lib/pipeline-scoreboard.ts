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

export const PIPELINE_SCOREBOARD_SCHEMA_VERSION = 2;
export const BLOCKED_DELTA_CRITICAL_THRESHOLD = 15;

export interface PipelineScoreboardWindow {
  readonly since: string;
  readonly until: string;
}

export interface MergedPr {
  readonly number: number;
  readonly title: string;
  readonly mergedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly labels: ReadonlyArray<{ readonly name: string }>;
}

export interface MergedPrEvidenceStatus {
  readonly complete: boolean;
  readonly reason: string | null;
  readonly pages: number;
}

export interface MergedPrEvidence extends MergedPrEvidenceStatus {
  readonly window: PipelineScoreboardWindow;
  readonly prs: ReadonlyArray<MergedPr>;
}

export interface MergedPrFetchOptions {
  readonly pageSize?: number;
  readonly maxPages?: number;
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
    readonly merges: number | null;
    readonly mqAttemptsPerMerge: number | null;
    readonly evidence: MergedPrEvidenceStatus;
    readonly timeToMergeSeconds: {
      readonly p50: number;
      readonly p95: number;
    };
  };
  readonly gates: {
    readonly tasteLabeledPrsWeek: number | null;
    readonly tasteEvidence: MergedPrEvidenceStatus;
    readonly autofixInterventions: number;
  };
  readonly alarms: ReadonlyArray<PipelineScoreboardAlarm>;
}

export interface PipelineScoreboardAlarm {
  readonly rule:
    | 'blocked_delta'
    | 'zero_ships_after_claims'
    | 'merge_evidence_incomplete';
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
    readonly throughput?: {
      readonly queueWaitSeconds?: {
        readonly p50?: number;
        readonly p95?: number;
      };
    };
    readonly latency?: {
      readonly readyToMergeSeconds?: {
        readonly p50?: number;
        readonly p95?: number;
      };
    };
  } | null;
  readonly mergedPrs: ReadonlyArray<{
    readonly labels?: ReadonlyArray<{ readonly name?: string } | string>;
  }>;
  readonly mergeEvidence: MergedPrEvidenceStatus;
  readonly tasteEvidence?: MergedPrEvidenceStatus;
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

function incompleteMergedPrEvidence(
  window: PipelineScoreboardWindow,
  reason: string,
  pages: number,
  prs: ReadonlyArray<MergedPr>
): MergedPrEvidence {
  return { complete: false, reason, pages, window, prs };
}

function parseMergedPr(value: unknown): MergedPr | null {
  if (!isRecord(value)) return null;
  const labels = value.labels;
  if (
    !Number.isInteger(value.number) ||
    typeof value.title !== 'string' ||
    typeof value.mergedAt !== 'string' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !isRecord(labels) ||
    !Array.isArray(labels.nodes) ||
    !Number.isInteger(labels.totalCount) ||
    labels.totalCount !== labels.nodes.length ||
    !labels.nodes.every(
      label => isRecord(label) && typeof label.name === 'string'
    ) ||
    !Number.isFinite(Date.parse(value.mergedAt)) ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    return null;
  }
  return {
    number: value.number as number,
    title: value.title,
    mergedAt: new Date(value.mergedAt).toISOString(),
    createdAt: new Date(value.createdAt).toISOString(),
    updatedAt: new Date(value.updatedAt).toISOString(),
    labels: labels.nodes as ReadonlyArray<{ readonly name: string }>,
  };
}

/**
 * Fetches an exact half-open merge window from GitHub's authoritative merged-PR
 * repository connection. Results are cursor-paginated in updated-descending
 * order until the oldest row predates the merge window. Every PR merged inside
 * the window must have updatedAt >= mergedAt >= window.since. Ordering drift,
 * malformed cursors, or truncated labels becomes typed incomplete evidence.
 */
function fetchMergedPrEvidenceOnce(
  window: PipelineScoreboardWindow,
  fetchPage: (cursor: string | null, pageSize: number) => unknown,
  options: MergedPrFetchOptions = {}
): MergedPrEvidence {
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 100;
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100 ||
    !Number.isInteger(maxPages) ||
    maxPages < 1
  ) {
    return incompleteMergedPrEvidence(window, 'invalid_fetch_options', 0, []);
  }

  const prs: MergedPr[] = [];
  const seen = new Set<number>();
  let cursor: string | null = null;
  let expectedTotalCount: number | null = null;
  let previousUpdatedAt: string | null = null;

  for (let page = 1; page <= maxPages; page += 1) {
    let rawPage: unknown;
    try {
      rawPage = fetchPage(cursor, pageSize);
    } catch {
      return incompleteMergedPrEvidence(window, 'fetch_failed', page - 1, prs);
    }
    if (!isRecord(rawPage)) {
      return incompleteMergedPrEvidence(window, 'malformed_page', page, prs);
    }
    const nodes = rawPage.nodes;
    const pageInfo = rawPage.pageInfo;
    const totalCount = rawPage.totalCount;
    if (
      !Array.isArray(nodes) ||
      !isRecord(pageInfo) ||
      typeof pageInfo.hasNextPage !== 'boolean' ||
      (pageInfo.endCursor !== null && typeof pageInfo.endCursor !== 'string') ||
      !Number.isInteger(totalCount) ||
      (totalCount as number) < 0
    ) {
      return incompleteMergedPrEvidence(window, 'malformed_page', page, prs);
    }
    if (expectedTotalCount === null) expectedTotalCount = totalCount as number;
    if (totalCount !== expectedTotalCount) {
      return incompleteMergedPrEvidence(window, 'unstable_snapshot', page, prs);
    }
    for (const rawPr of nodes) {
      const parsed = parseMergedPr(rawPr);
      if (!parsed) {
        return incompleteMergedPrEvidence(window, 'malformed_pr', page, prs);
      }
      if (previousUpdatedAt !== null && parsed.updatedAt > previousUpdatedAt) {
        return incompleteMergedPrEvidence(
          window,
          'unstable_page_order',
          page,
          prs
        );
      }
      previousUpdatedAt = parsed.updatedAt;
      if (seen.has(parsed.number)) {
        return incompleteMergedPrEvidence(window, 'duplicate_pr', page, prs);
      }
      seen.add(parsed.number);
      if (isBetween(parsed.mergedAt, window)) prs.push(parsed);
    }

    if (previousUpdatedAt !== null && previousUpdatedAt < window.since) {
      return { complete: true, reason: null, pages: page, window, prs };
    }
    if (!pageInfo.hasNextPage) {
      if (seen.size !== expectedTotalCount) {
        return incompleteMergedPrEvidence(
          window,
          'result_count_mismatch',
          page,
          prs
        );
      }
      return { complete: true, reason: null, pages: page, window, prs };
    }
    if (
      typeof pageInfo.endCursor !== 'string' ||
      pageInfo.endCursor === cursor
    ) {
      return incompleteMergedPrEvidence(window, 'malformed_cursor', page, prs);
    }
    cursor = pageInfo.endCursor;
  }

  return incompleteMergedPrEvidence(window, 'max_pages_reached', maxPages, prs);
}

function mergedPrMetricFingerprint(prs: ReadonlyArray<MergedPr>): string {
  return JSON.stringify(
    [...prs]
      .sort((left, right) => left.number - right.number)
      .map(pr => ({
        number: pr.number,
        mergedAt: pr.mergedAt,
        labels: pr.labels.map(label => label.name).sort(),
      }))
  );
}

export function fetchMergedPrEvidence(
  window: PipelineScoreboardWindow,
  fetchPage: (cursor: string | null, pageSize: number) => unknown,
  options: MergedPrFetchOptions = {}
): MergedPrEvidence {
  const first = fetchMergedPrEvidenceOnce(window, fetchPage, options);
  if (!first.complete) return first;
  const second = fetchMergedPrEvidenceOnce(window, fetchPage, options);
  if (!second.complete) return second;
  if (
    mergedPrMetricFingerprint(first.prs) !==
    mergedPrMetricFingerprint(second.prs)
  ) {
    return incompleteMergedPrEvidence(
      window,
      'unstable_snapshot',
      Math.max(first.pages, second.pages),
      second.prs
    );
  }
  return second;
}

export function filterMergedPrEvidence(
  evidence: MergedPrEvidence,
  window: PipelineScoreboardWindow
): MergedPrEvidence {
  const prs = evidence.prs.filter(pr => isBetween(pr.mergedAt, window));
  if (
    window.since < evidence.window.since ||
    window.until > evidence.window.until
  ) {
    return incompleteMergedPrEvidence(window, 'window_not_covered', 0, prs);
  }
  return evidence.complete
    ? {
        complete: true,
        reason: null,
        pages: evidence.pages,
        window,
        prs,
      }
    : incompleteMergedPrEvidence(
        window,
        evidence.reason ?? 'unknown',
        evidence.pages,
        prs
      );
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

function isMergedPrEvidenceStatus(
  value: unknown
): value is MergedPrEvidenceStatus {
  return (
    isRecord(value) &&
    typeof value.complete === 'boolean' &&
    (value.reason === null || typeof value.reason === 'string') &&
    Number.isInteger(value.pages) &&
    (value.pages as number) >= 0
  );
}

function isPipelineScoreboard(value: unknown): value is PipelineScoreboard {
  if (!isRecord(value)) return false;
  const queue = value.queue;
  const gates = value.gates;
  return (
    value.schemaVersion === PIPELINE_SCOREBOARD_SCHEMA_VERSION &&
    isRecord(value.window) &&
    typeof value.window.since === 'string' &&
    typeof value.window.until === 'string' &&
    isRecord(value.funnel) &&
    isRecord(value.shipper) &&
    isRecord(queue) &&
    (queue.merges === null || typeof queue.merges === 'number') &&
    isMergedPrEvidenceStatus(queue.evidence) &&
    isRecord(gates) &&
    (gates.tasteLabeledPrsWeek === null ||
      typeof gates.tasteLabeledPrsWeek === 'number') &&
    isMergedPrEvidenceStatus(gates.tasteEvidence) &&
    Array.isArray(value.alarms)
  );
}

function isCiMetricsSnapshot(
  value: unknown
): value is NonNullable<PipelineScoreboardInput['ciMetrics']> {
  if (!isRecord(value)) return false;
  const throughput = value.throughput;
  const latency = value.latency;
  return (
    (throughput === undefined ||
      (isRecord(throughput) &&
        (throughput.queueWaitSeconds === undefined ||
          isPercentileRecord(throughput.queueWaitSeconds)))) &&
    (latency === undefined ||
      (isRecord(latency) &&
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
  return previous === undefined ? 0 : current - previous;
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
  const mergeEvidence = {
    complete: input.mergeEvidence.complete,
    reason: input.mergeEvidence.reason,
    pages: input.mergeEvidence.pages,
  };
  const tasteEvidence = input.tasteEvidence
    ? {
        complete: input.tasteEvidence.complete,
        reason: input.tasteEvidence.reason,
        pages: input.tasteEvidence.pages,
      }
    : mergeEvidence;
  const merges = mergeEvidence.complete ? (input.mergedPrs?.length ?? 0) : null;
  const mqAttempts = input.mergedPrs?.filter(pr =>
    labelList(pr.labels).includes('merge-queue')
  ).length;
  const readyToMerge = input.ciMetrics?.latency?.readyToMergeSeconds;
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
      evidence: mergeEvidence,
      mqAttemptsPerMerge:
        typeof merges === 'number' &&
        merges > 0 &&
        typeof mqAttempts === 'number'
          ? Number((mqAttempts / merges).toFixed(2))
          : null,
      timeToMergeSeconds: {
        p50: readyToMerge?.p50 ?? 0,
        p95: readyToMerge?.p95 ?? 0,
      },
    },
    gates: {
      tasteLabeledPrsWeek: tasteEvidence.complete
        ? (input.mergedPrs?.filter(pr =>
            labelList(pr.labels).some(label => label.includes('taste'))
          ).length ?? 0)
        : null,
      tasteEvidence,
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
  if (!scoreboard.queue.evidence.complete) {
    alarms.push({
      rule: 'merge_evidence_incomplete',
      severity: 'critical',
      message: `Merge evidence is incomplete (${scoreboard.queue.evidence.reason ?? 'unknown'}) after ${scoreboard.queue.evidence.pages} page(s) for ${windowLabel}; merge throughput conclusions are suppressed.`,
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
  const queueText = scoreboard.queue.evidence.complete
    ? `Queue: merges ${scoreboard.queue.merges} · MQ attempts/merge ${scoreboard.queue.mqAttemptsPerMerge ?? 'n/a'} · time-to-merge p50 ${fmtSeconds(scoreboard.queue.timeToMergeSeconds.p50)} / p95 ${fmtSeconds(scoreboard.queue.timeToMergeSeconds.p95)}`
    : `Queue: merge evidence incomplete (${scoreboard.queue.evidence.reason ?? 'unknown'}, ${scoreboard.queue.evidence.pages} page(s)); merge count and MQ attempts/merge suppressed · time-to-merge p50 ${fmtSeconds(scoreboard.queue.timeToMergeSeconds.p50)} / p95 ${fmtSeconds(scoreboard.queue.timeToMergeSeconds.p95)}`;
  const tasteText = scoreboard.gates.tasteEvidence.complete
    ? String(scoreboard.gates.tasteLabeledPrsWeek)
    : `suppressed (${scoreboard.gates.tasteEvidence.reason ?? 'unknown'}, ${scoreboard.gates.tasteEvidence.pages} page(s))`;
  return [
    `Pipeline scoreboard (${scoreboard.window.since.slice(0, 10)} UTC)`,
    `Funnel: ready ${scoreboard.funnel.ready} (${signed(scoreboard.funnel.deltas.ready)}) · claimed ${scoreboard.funnel.claimed} (${signed(scoreboard.funnel.deltas.claimed)}) · in-progress ${scoreboard.funnel.inProgress} (${signed(scoreboard.funnel.deltas.inProgress)}) · blocked ${scoreboard.funnel.blocked} (${signed(scoreboard.funnel.deltas.blocked)})`,
    `Shipper: claims ${scoreboard.shipper.claims} · ships ${scoreboard.shipper.ships} · retries ${scoreboard.shipper.retriesUsed} · cost/ship $${scoreboard.shipper.costPerShippedIssueUsd ?? 0}`,
    `Failures: ${failureText || 'none'}`,
    queueText,
    `Gates: taste-labeled PRs/week ${tasteText} · autofix interventions ${scoreboard.gates.autofixInterventions}`,
    scoreboard.alarms.length
      ? `Alarms: ${scoreboard.alarms.map(alarm => alarm.message).join(' ')}`
      : 'Alarms: none',
  ].join('\n');
}
