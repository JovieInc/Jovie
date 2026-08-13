#!/usr/bin/env tsx
/**
 * Pipeline Scoreboard — Hermes (read-only).
 *
 * Computes the daily codex issue shipper funnel and writes it to local state,
 * gbrain, and ops notifications. This is local control-plane telemetry, not a
 * production app cron.
 */

import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { gbrainLearn } from '../lib/gbrain';
import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';
import { sendOpsAlert } from '../lib/ops-notify';
import {
  buildPipelineScoreboard,
  dailyWindow,
  fetchMergedPrEvidence,
  fetchMergeGroupRunEvidence,
  filterMergedPrEvidence,
  filterMergeGroupRunEvidence,
  type JobLogEntry,
  last12HoursWindow,
  readJsonlEntries,
  readLatestCiMetrics,
  readLatestScoreboard,
  renderPipelineScoreboard,
} from '../lib/pipeline-scoreboard';

const JOB = 'pipeline-scoreboard';
const REPO = process.env.HERMES_GITHUB_REPO ?? 'JovieInc/Jovie';
const ISSUE_LIMIT = process.env.HERMES_PIPELINE_SCOREBOARD_ISSUE_LIMIT ?? '500';
const PR_MAX_PAGES = Number.parseInt(
  process.env.HERMES_PIPELINE_SCOREBOARD_PR_MAX_PAGES ?? '100',
  10
);
const SCOREBOARD_JSONL = join(
  HERMES_PATHS.stateDir,
  'pipeline-scoreboard.jsonl'
);
const SCOREBOARD_LATEST = join(
  HERMES_PATHS.stateDir,
  'pipeline-scoreboard-latest.json'
);
const ALERT_STATE = join(
  HERMES_PATHS.stateDir,
  'pipeline-scoreboard-alerts.json'
);
const CI_METRICS_LATEST = join(HERMES_PATHS.stateDir, 'ci-metrics-latest.json');
const MQ_RUNS_WORKFLOW =
  process.env.HERMES_PIPELINE_SCOREBOARD_MQ_WORKFLOW ?? 'ci.yml';
const MQ_RUNS_MAX_PAGES = Number.parseInt(
  process.env.HERMES_PIPELINE_SCOREBOARD_MQ_RUNS_MAX_PAGES ?? '10',
  10
);

interface GhIssue {
  readonly number: number;
  readonly title: string;
  readonly body?: string | null;
  readonly url: string;
  readonly updatedAt?: string;
  readonly labels: ReadonlyArray<{ readonly name: string }>;
}

function gh(args: readonly string[], timeoutMs = 30_000): string {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function fetchCodexIssues(): GhIssue[] {
  return JSON.parse(
    gh([
      'issue',
      'list',
      '--repo',
      REPO,
      '--state',
      'open',
      '--label',
      'codex',
      '--limit',
      ISSUE_LIMIT,
      '--json',
      'number,title,body,url,updatedAt,labels',
    ])
  ) as GhIssue[];
}

function fetchMergedPrs(window: {
  readonly since: string;
  readonly until: string;
}) {
  const [owner, name] = REPO.split('/', 2);
  if (!owner || !name) {
    return fetchMergedPrEvidence(window, () => undefined, { maxPages: 0 });
  }
  const graphQuery = `query($owner:String!,$name:String!,$cursor:String,$pageSize:Int!){repository(owner:$owner,name:$name){pullRequests(states:MERGED,orderBy:{field:UPDATED_AT,direction:DESC},first:$pageSize,after:$cursor){totalCount pageInfo{hasNextPage endCursor} nodes{number title headRefName baseRefName createdAt updatedAt mergedAt labels(first:100){totalCount nodes{name}}}}}}`;
  return fetchMergedPrEvidence(
    window,
    (cursor, pageSize) => {
      const args = [
        'api',
        'graphql',
        '-f',
        `query=${graphQuery}`,
        '-F',
        `owner=${owner}`,
        '-F',
        `name=${name}`,
        '-F',
        `pageSize=${pageSize}`,
      ];
      if (cursor !== null) args.push('-F', `cursor=${cursor}`);
      const response = JSON.parse(gh(args)) as {
        readonly data?: {
          readonly repository?: { readonly pullRequests?: unknown };
        };
      };
      return response.data?.repository?.pullRequests;
    },
    { maxPages: PR_MAX_PAGES }
  );
}

function filterEntries(
  entries: ReadonlyArray<JobLogEntry>,
  since: string,
  until: string
): JobLogEntry[] {
  return entries.filter(
    entry =>
      typeof entry.ts === 'string' && entry.ts >= since && entry.ts < until
  );
}

/**
 * Authoritative native merge-group CI attempts (JOV-5030). Reads the Actions
 * workflow-runs API with event=merge_group so attempts-per-merge and queue
 * churn reflect real GitHub group builds rather than local labels/logs.
 */
function fetchMergeGroupRuns(window: { since: string; until: string }) {
  return fetchMergeGroupRunEvidence(
    window,
    (page, pageSize) =>
      JSON.parse(
        gh([
          'api',
          `repos/${REPO}/actions/workflows/${MQ_RUNS_WORKFLOW}/runs`,
          '-f',
          'event=merge_group',
          '-F',
          `per_page=${pageSize}`,
          '-F',
          `page=${page}`,
        ])
      ) as unknown,
    { maxPages: MQ_RUNS_MAX_PAGES }
  );
}

function alertKey(rule: string, windowSince: string): string {
  return `${rule}:${windowSince.slice(0, 10)}`;
}

export function readAlertState(path = ALERT_STATE): Record<string, string> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      string
    >;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeAlertState(
  state: Record<string, string>,
  path = ALERT_STATE
): void {
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

export async function notifyNewAlarms(
  body: string,
  alarms: ReadonlyArray<{ readonly rule: string }>,
  windowSince: string
): Promise<ReadonlyArray<string>> {
  if (alarms.length === 0) return [];
  const state = readAlertState();
  const keys = alarms.map(alarm => alertKey(alarm.rule, windowSince));
  const fresh = keys.filter(key => !state[key]);
  if (fresh.length === 0) return [];
  await sendOpsAlert(`Pipeline scoreboard alert\n\n${body}`);
  const now = new Date().toISOString();
  for (const key of fresh) state[key] = now;
  writeAlertState(state);
  return fresh;
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const now = new Date();
    const daily = dailyWindow(now);
    const alarmWindow = last12HoursWindow(now);
    const allEntries = readJsonlEntries(HERMES_PATHS.jobsLog);
    const dailyEntries = filterEntries(allEntries, daily.since, daily.until);
    const alarmEntries = filterEntries(
      allEntries,
      alarmWindow.since,
      alarmWindow.until
    );
    const issues = fetchCodexIssues();
    const weeklyWindow = {
      since: new Date(Date.parse(daily.until) - 7 * 86_400_000).toISOString(),
      until: daily.until,
    };
    const mergedAll = fetchMergedPrs({
      since: weeklyWindow.since,
      until: alarmWindow.until,
    });
    const mergedDaily = filterMergedPrEvidence(mergedAll, daily);
    const mergedAlarm = filterMergedPrEvidence(mergedAll, alarmWindow);
    const mergedWeekly = filterMergedPrEvidence(mergedAll, weeklyWindow);
    const mqRunsDaily = fetchMergeGroupRuns(daily);
    const mqRunsAlarm = filterMergeGroupRunEvidence(mqRunsDaily, alarmWindow);
    const previous = readLatestScoreboard(SCOREBOARD_LATEST);
    const ciMetrics = readLatestCiMetrics(CI_METRICS_LATEST);

    const scoreboard = buildPipelineScoreboard({
      ts: now.toISOString(),
      window: daily,
      issues,
      previous,
      jobLogEntries: dailyEntries,
      ciMetrics,
      mergedPrs: mergedDaily.prs,
      mergeEvidence: mergedDaily,
      mergeGroupRunEvidence: mqRunsDaily,
      symphonyMergeEvidence: mergedWeekly,
    });
    const alarmScoreboard = buildPipelineScoreboard({
      ts: now.toISOString(),
      window: alarmWindow,
      issues,
      previous,
      jobLogEntries: alarmEntries,
      ciMetrics,
      mergedPrs: mergedAlarm.prs,
      mergeEvidence: mergedAlarm,
      mergeGroupRunEvidence: mqRunsAlarm,
      symphonyMergeEvidence: mergedWeekly,
    });
    // The daily scoreboard owns blocked-count deltas; the rolling 12h
    // scoreboard owns "claims but no ships" stall detection and merge-queue
    // churn (churn compounds within hours, long before a daily window trips).
    const mergedAlarms = [
      ...scoreboard.alarms.filter(
        alarm =>
          alarm.rule === 'blocked_delta' ||
          alarm.rule === 'merge_evidence_incomplete' ||
          alarm.rule === 'symphony_throughput_below_target'
      ),
      ...alarmScoreboard.alarms.filter(
        alarm =>
          alarm.rule === 'zero_ships_after_claims' ||
          alarm.rule === 'merge_queue_churn'
      ),
    ];
    const finalScoreboard = {
      ...scoreboard,
      alarms: mergedAlarms,
      gates: {
        ...scoreboard.gates,
        tasteLabeledPrsWeek: mergedWeekly.complete
          ? mergedWeekly.prs.filter(pr =>
              pr.labels.some(label => label.name.includes('taste'))
            ).length
          : null,
        tasteEvidence: {
          complete: mergedWeekly.complete,
          reason: mergedWeekly.reason,
          pages: mergedWeekly.pages,
        },
      },
    };
    const body = renderPipelineScoreboard(finalScoreboard);

    mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
    appendFileSync(SCOREBOARD_JSONL, `${JSON.stringify(finalScoreboard)}\n`);
    writeFileSync(
      SCOREBOARD_LATEST,
      `${JSON.stringify(finalScoreboard, null, 2)}\n`
    );

    const gbrainOk = gbrainLearn({
      slug: 'ops/pipeline-scoreboard/latest',
      title: 'Pipeline scoreboard (latest)',
      body,
      tags: ['type:pipeline-scoreboard', 'area:codex-issue-shipper'],
      type: 'pipeline-scoreboard',
    });

    const sentAlertKeys = await notifyNewAlarms(
      body,
      finalScoreboard.alarms,
      now.toISOString()
    );

    logJobEvent({
      job: JOB,
      event: 'scored',
      ready: finalScoreboard.funnel.ready,
      claimed: finalScoreboard.funnel.claimed,
      blocked: finalScoreboard.funnel.blocked,
      claims: finalScoreboard.shipper.claims,
      ships: finalScoreboard.shipper.ships,
      merges: finalScoreboard.queue.merges,
      mergeGroupAttempts: finalScoreboard.queue.mergeGroupAttempts,
      mergeGroupFailedAttempts: finalScoreboard.queue.mergeGroupFailedAttempts,
      queueChurn: finalScoreboard.queue.queueChurn,
      mergeGroupEvidenceComplete:
        finalScoreboard.queue.mergeGroupEvidence.complete,
      mergeEvidenceComplete: finalScoreboard.queue.evidence.complete,
      mergeEvidenceReason: finalScoreboard.queue.evidence.reason,
      symphonyLandedPrs: finalScoreboard.symphony.landedPrs,
      symphonyHourlyP05: finalScoreboard.symphony.hourlyLandedPrs.p05,
      symphonyHourlyP95: finalScoreboard.symphony.hourlyLandedPrs.p95,
      symphonyLandingGapP95Seconds:
        finalScoreboard.symphony.landingGapSeconds.p95,
      symphonyThroughputVerdict: finalScoreboard.symphony.verdict,
      alarms: finalScoreboard.alarms.map(alarm => alarm.rule),
      sentAlertKeys,
      gbrainOk,
    });

    process.stdout.write(`${body}\n`);
  });
}

void main().catch(async err => {
  const error = err instanceof Error ? err.message : String(err);
  logJobEvent({
    job: JOB,
    event: 'fatal',
    error,
  });
  console.error(`[${JOB}] fatal:`, err);
  await sendOpsAlert(`Pipeline scoreboard job failed: ${error}`);
  process.exit(0);
});
