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
const PR_LIMIT = process.env.HERMES_PIPELINE_SCOREBOARD_PR_LIMIT ?? '100';
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

interface GhIssue {
  readonly number: number;
  readonly title: string;
  readonly body?: string | null;
  readonly url: string;
  readonly updatedAt?: string;
  readonly labels: ReadonlyArray<{ readonly name: string }>;
}

interface GhPr {
  readonly number: number;
  readonly title: string;
  readonly mergedAt: string;
  readonly labels?: ReadonlyArray<{ readonly name: string }>;
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

function fetchMergedPrsSince(since: string): GhPr[] {
  const prs = JSON.parse(
    gh([
      'pr',
      'list',
      '--repo',
      REPO,
      '--state',
      'merged',
      '--limit',
      PR_LIMIT,
      '--json',
      'number,title,mergedAt,labels',
    ])
  ) as GhPr[];
  return prs.filter(pr => pr.mergedAt >= since);
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
    const mergedDaily = fetchMergedPrsSince(daily.since);
    const mergedWeekly = fetchMergedPrsSince(
      new Date(Date.parse(daily.until) - 7 * 86_400_000).toISOString()
    );
    const previous = readLatestScoreboard(SCOREBOARD_LATEST);
    const ciMetrics = readLatestCiMetrics(CI_METRICS_LATEST);

    const scoreboard = buildPipelineScoreboard({
      ts: now.toISOString(),
      window: daily,
      issues,
      previous,
      jobLogEntries: dailyEntries,
      ciMetrics,
      mergedPrs: mergedDaily,
    });
    const alarmScoreboard = buildPipelineScoreboard({
      ts: now.toISOString(),
      window: alarmWindow,
      issues,
      previous,
      jobLogEntries: alarmEntries,
      ciMetrics,
      mergedPrs: mergedDaily,
    });
    // The daily scoreboard owns blocked-count deltas; the rolling 12h
    // scoreboard owns "claims but no ships" stall detection.
    const mergedAlarms = [
      ...scoreboard.alarms.filter(alarm => alarm.rule === 'blocked_delta'),
      ...alarmScoreboard.alarms.filter(
        alarm => alarm.rule === 'zero_ships_after_claims'
      ),
    ];
    const finalScoreboard = {
      ...scoreboard,
      alarms: mergedAlarms,
      gates: {
        ...scoreboard.gates,
        tasteLabeledPrsWeek: mergedWeekly.filter(pr =>
          (pr.labels ?? []).some(label => label.name.includes('taste'))
        ).length,
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
