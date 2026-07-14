#!/usr/bin/env tsx
/**
 * CI Metrics — Hermes (read-only).
 *
 * Measures the merge pipeline so we can name the real ceiling before optimizing
 * anything. PRIMARY signal is throughput (merged-PRs/day, runner-hours per
 * merged PR, flaky-rerun rate, queue-wait); latency P50/P75/P95 (gate wall-clock
 * + full PR-open→merge) is a SECONDARY diagnostic. See docs/PR_FLOW.md:
 * "Throughput ceiling is CI cost and queue reliability, not merge wiring."
 *
 * This job ONLY reads (gh api) and writes local state + a gbrain snapshot. It
 * does NOT run experiments, edit CI, or auto-merge anything. The append-only
 * JSONL is the history a human (or a future, separately-reviewed experiment
 * loop) reads to decide what to optimize.
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

import {
  createApiRequestBudget,
  hasGreenRequiredChecks,
  shouldReuseJobCache,
  shouldReuseRequiredChecksCache,
  summarizeCiMetrics,
} from '../../lib/ci-metrics-compute.mjs';
import { parseMergeQueueTimeline } from '../../lib/merge-queue-guard.mjs';
import { gbrainLearn } from '../lib/gbrain';
import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';

const JOB = 'ci-metrics';
const RUN_SAMPLE = 100;
const PR_SAMPLE = 50;
const METRICS_JSONL = join(HERMES_PATHS.stateDir, 'ci-metrics.jsonl');
const METRICS_LATEST = join(HERMES_PATHS.stateDir, 'ci-metrics-latest.json');
const METRICS_API_CACHE = join(
  HERMES_PATHS.stateDir,
  'ci-metrics-api-cache.json'
);
const API_CACHE_SCHEMA_VERSION = 2;
const TIMELINE_REQUEST_RESERVE = 6;

interface WorkflowRun {
  readonly id: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly run_attempt: number;
  readonly status: string;
  readonly conclusion: string | null;
  readonly head_sha: string;
}

interface WorkflowJob {
  readonly id: number;
  readonly name: string;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly conclusion: string | null;
  readonly runner_name: string | null;
  readonly labels: readonly string[];
}

interface RequiredCheck {
  readonly id: number;
  readonly name: string;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly conclusion: string | null;
}

interface RunJobSample {
  readonly runId: number;
  readonly runCreatedAt: string;
  readonly runConclusion: string | null;
  readonly jobs: readonly WorkflowJob[];
}

interface JobCacheEntry {
  readonly updatedAt: string;
  readonly sample: RunJobSample;
}

interface CheckCacheEntry {
  readonly fetchedAt: string;
  readonly green: boolean;
  readonly checks: readonly RequiredCheck[];
}

type MergeQueueTimeline = ReturnType<typeof parseMergeQueueTimeline>;

interface TimelineCacheEntry {
  readonly mergedAt: string | null;
  readonly timeline: MergeQueueTimeline;
}

interface MetricsApiCache {
  readonly schemaVersion: number;
  readonly jobs: Record<string, JobCacheEntry>;
  readonly checks: Record<string, CheckCacheEntry>;
  readonly timelines: Record<string, TimelineCacheEntry>;
}

interface ApiRequestBudget {
  tryConsume(reservedRequests?: number): boolean;
  readonly used: number;
}

interface MergedPr {
  readonly number: number;
  readonly createdAt: string;
  readonly mergedAt: string | null;
}

function gh(args: readonly string[], timeoutMs = 30_000): string {
  return execFileSync('gh', [...args], {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function resolveRepo(): string {
  const out = gh(['repo', 'view', '--json', 'nameWithOwner']);
  return (JSON.parse(out) as { nameWithOwner: string }).nameWithOwner;
}

function fetchCiRuns(repo: string): WorkflowRun[] {
  const out = gh([
    'api',
    `repos/${repo}/actions/workflows/ci.yml/runs?event=pull_request&per_page=${RUN_SAMPLE}`,
  ]);
  return (
    (JSON.parse(out) as { workflow_runs?: WorkflowRun[] }).workflow_runs ?? []
  );
}

function emptyApiCache(): MetricsApiCache {
  return {
    schemaVersion: API_CACHE_SCHEMA_VERSION,
    jobs: {},
    checks: {},
    timelines: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJobCacheEntry(value: unknown): value is JobCacheEntry {
  if (!isRecord(value) || !isRecord(value.sample)) return false;
  return (
    typeof value.updatedAt === 'string' &&
    typeof value.sample.runId === 'number' &&
    typeof value.sample.runCreatedAt === 'string' &&
    Array.isArray(value.sample.jobs)
  );
}

function isCheckCacheEntry(value: unknown): value is CheckCacheEntry {
  return (
    isRecord(value) &&
    typeof value.fetchedAt === 'string' &&
    typeof value.green === 'boolean' &&
    Array.isArray(value.checks)
  );
}

function isTimelineCacheEntry(value: unknown): value is TimelineCacheEntry {
  return (
    isRecord(value) &&
    (value.mergedAt === null || typeof value.mergedAt === 'string') &&
    isRecord(value.timeline)
  );
}

function isCacheEntryRecord<T>(
  value: unknown,
  isEntry: (entry: unknown) => entry is T
): value is Record<string, T> {
  return isRecord(value) && Object.values(value).every(isEntry);
}

function readApiCache(): MetricsApiCache {
  if (!existsSync(METRICS_API_CACHE)) return emptyApiCache();
  try {
    const parsed = JSON.parse(
      readFileSync(METRICS_API_CACHE, 'utf8')
    ) as unknown;
    if (
      isRecord(parsed) &&
      parsed.schemaVersion === API_CACHE_SCHEMA_VERSION &&
      isCacheEntryRecord(parsed.jobs, isJobCacheEntry) &&
      isCacheEntryRecord(parsed.checks, isCheckCacheEntry) &&
      isCacheEntryRecord(parsed.timelines, isTimelineCacheEntry)
    ) {
      return parsed;
    }
  } catch {
    // A corrupt cache only costs one bounded refill; metric history is separate.
  }
  return emptyApiCache();
}

function fetchRunSamples(
  repo: string,
  runs: readonly WorkflowRun[],
  cache: MetricsApiCache,
  now: Date,
  budget: ApiRequestBudget
) {
  // Stable completed runs are reused by id/updated_at and SHA. On a cold cache,
  // job/check hydration stops before the global ceiling so timeline hydration
  // always retains a small slice of the same request budget.
  const next = emptyApiCache();
  const samples = runs.map(run => {
    const runKey = String(run.id);
    let jobEntry = cache.jobs[runKey];
    const reuseJobs = shouldReuseJobCache(run, jobEntry);
    let jobSample: RunJobSample =
      reuseJobs && jobEntry
        ? jobEntry.sample
        : {
            runId: run.id,
            runCreatedAt: run.created_at,
            runConclusion: run.conclusion,
            jobs: [],
          };
    let jobsHydrated = reuseJobs;

    if (!reuseJobs && budget.tryConsume(TIMELINE_REQUEST_RESERVE)) {
      try {
        const out = gh(
          ['api', `repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`],
          20_000
        );
        jobSample = {
          runId: run.id,
          runCreatedAt: run.created_at,
          runConclusion: run.conclusion,
          jobs: (JSON.parse(out) as { jobs?: WorkflowJob[] }).jobs ?? [],
        };
        jobEntry = { updatedAt: run.updated_at, sample: jobSample };
        jobsHydrated = true;
      } catch {
        // Keep the old entry only so the changed run is retried next tick. Do
        // not measure the changed run with stale job timestamps.
      }
    }
    if (jobEntry) next.jobs[runKey] = jobEntry;

    let checkEntry = next.checks[run.head_sha] ?? cache.checks[run.head_sha];
    const reuseChecks = shouldReuseRequiredChecksCache(run, checkEntry, now);
    let requiredChecks = reuseChecks ? (checkEntry?.checks ?? []) : [];
    let requiredChecksHydrated = reuseChecks;
    if (!reuseChecks && budget.tryConsume(TIMELINE_REQUEST_RESERVE)) {
      try {
        const out = gh(
          [
            'api',
            `repos/${repo}/commits/${run.head_sha}/check-runs?per_page=100`,
          ],
          20_000
        );
        const checks =
          (JSON.parse(out) as { check_runs?: RequiredCheck[] }).check_runs ??
          [];
        checkEntry = {
          fetchedAt: now.toISOString(),
          green: hasGreenRequiredChecks(checks),
          checks,
        };
        requiredChecks = checks;
        requiredChecksHydrated = true;
      } catch {
        // Keep the old entry only so the next tick retries. Do not measure a
        // changed run with stale required-check results.
      }
    }
    if (checkEntry) next.checks[run.head_sha] = checkEntry;

    return {
      ...jobSample,
      headSha: run.head_sha,
      jobsHydrated,
      requiredChecks,
      requiredChecksHydrated,
    };
  });

  return { samples, cache: next };
}

function fetchMergedPrs(): MergedPr[] {
  const out = gh([
    'pr',
    'list',
    '--state',
    'merged',
    '--limit',
    String(PR_SAMPLE),
    '--json',
    'number,createdAt,mergedAt',
  ]);
  return JSON.parse(out) as MergedPr[];
}

function fetchTimelineSamples(
  repo: string,
  prs: readonly MergedPr[],
  cache: MetricsApiCache,
  nextCache: MetricsApiCache,
  budget: ApiRequestBudget
): MergeQueueTimeline[] {
  const timelines: MergeQueueTimeline[] = [];
  for (const pr of prs) {
    const key = String(pr.number);
    let entry = cache.timelines[key];
    if (entry?.mergedAt !== pr.mergedAt) entry = undefined;

    if (!entry && budget.tryConsume()) {
      // ponytail: first 100 timeline events captures the merge-queue label,
      // ready_for_review, and merge events for nearly all PRs; skip --paginate
      // to keep each request bounded.
      try {
        const out = gh(
          ['api', `repos/${repo}/issues/${pr.number}/timeline?per_page=100`],
          20_000
        );
        entry = {
          mergedAt: pr.mergedAt,
          timeline: parseMergeQueueTimeline(JSON.parse(out), {
            prCreatedAt: pr.createdAt,
          }),
        };
      } catch {
        // Leave uncached so the next tick retries within its fresh budget.
      }
    }

    if (entry) {
      nextCache.timelines[key] = entry;
      timelines.push(entry.timeline);
    }
  }
  return timelines;
}

function fmtMin(seconds: number): string {
  return `${Math.round(seconds / 60)}m`;
}

function fmtSampledMin(seconds: number, samples: number): string {
  return samples > 0 ? fmtMin(seconds) : '?';
}

function renderBody(m: ReturnType<typeof summarizeCiMetrics>): string {
  const t = m.throughput;
  const l = m.latency;
  const v = m.throughputVerdict;
  const h = m.hydration;
  return [
    `Snapshot: ${h.complete ? 'COMPLETE' : 'PARTIAL (non-authoritative)'} · jobs ${h.runJobs.covered}/${h.runJobs.total} · required-check SHAs ${h.requiredChecks.covered}/${h.requiredChecks.total} · timelines ${h.timelines.covered}/${h.timelines.total}`,
    `Window: ${m.window.mergedPrs} merged PRs · ${m.window.ciRuns} CI runs · ${m.window.spanDays}d span`,
    `Throughput (primary): ${t.mergedPrsPerDay}/day · ${t.ciRunHoursPerMergedPr ?? '?'} legacy CI wall-clock h/PR · flaky ${(t.flakyRerunRate * 100).toFixed(1)}% · queue-wait p50 ${fmtSampledMin(t.queueWaitSeconds.p50, m.sampleSizes.queueWait)} / p95 ${fmtSampledMin(t.queueWaitSeconds.p95, m.sampleSizes.queueWait)}`,
    `Latency (secondary): gate p50 ${fmtSampledMin(l.gateWallclockSeconds.p50, m.sampleSizes.gate)} / p75 ${fmtSampledMin(l.gateWallclockSeconds.p75, m.sampleSizes.gate)} / p95 ${fmtSampledMin(l.gateWallclockSeconds.p95, m.sampleSizes.gate)} · full-merge p50 ${fmtSampledMin(l.fullMergeTimeSeconds.p50, m.sampleSizes.fullMerge)} / p95 ${fmtSampledMin(l.fullMergeTimeSeconds.p95, m.sampleSizes.fullMerge)}`,
    `Fleet lead time (target p50<10m / p95<15m): p50 ${fmtSampledMin(l.fleetLeadTimeSeconds.p50, m.sampleSizes.fleetLeadTime)} / p75 ${fmtSampledMin(l.fleetLeadTimeSeconds.p75, m.sampleSizes.fleetLeadTime)} / p95 ${fmtSampledMin(l.fleetLeadTimeSeconds.p95, m.sampleSizes.fleetLeadTime)}`,
    `Queue decomposition: first-enqueue lead p50 ${fmtSampledMin(l.firstEnqueueLeadSeconds.p50, m.sampleSizes.firstEnqueueLead)} / p95 ${fmtSampledMin(l.firstEnqueueLeadSeconds.p95, m.sampleSizes.firstEnqueueLead)} · last-enqueue→merge p50 ${fmtSampledMin(l.lastEnqueueToMergeSeconds.p50, m.sampleSizes.lastEnqueueToMerge)} / p95 ${fmtSampledMin(l.lastEnqueueToMergeSeconds.p95, m.sampleSizes.lastEnqueueToMerge)} · active queued p50 ${fmtSampledMin(l.activeQueuedSeconds.p50, m.sampleSizes.activeQueued)} / p95 ${fmtSampledMin(l.activeQueuedSeconds.p95, m.sampleSizes.activeQueued)}`,
    `Runner use: hosted ${fmtSampledMin(t.runnerJobSeconds.hosted, m.sampleSizes.jobs)} · self-hosted ${fmtSampledMin(t.runnerJobSeconds.selfHosted, m.sampleSizes.jobs)} · cancellation waste ${fmtSampledMin(t.cancellationWasteSeconds, m.sampleSizes.jobs)}`,
    `Gate diagnostics: job-start p50 ${fmtSampledMin(l.jobStartDelaySeconds.p50, m.sampleSizes.jobStartDelay)} / p95 ${fmtSampledMin(l.jobStartDelaySeconds.p95, m.sampleSizes.jobStartDelay)} · first terminal failure p50 ${fmtSampledMin(l.timeToFirstTerminalFailureSeconds.p50, m.sampleSizes.firstTerminalFailure)} / p95 ${fmtSampledMin(l.timeToFirstTerminalFailureSeconds.p95, m.sampleSizes.firstTerminalFailure)} · required green p50 ${fmtSampledMin(l.timeToRequiredGreenSeconds.p50, m.sampleSizes.requiredGreen)} / p95 ${fmtSampledMin(l.timeToRequiredGreenSeconds.p95, m.sampleSizes.requiredGreen)}`,
    `Samples: gate ${m.sampleSizes.gate} · full-merge ${m.sampleSizes.fullMerge} · fleet-lead ${m.sampleSizes.fleetLeadTime} · active-queued ${m.sampleSizes.activeQueued} · jobs ${m.sampleSizes.jobs}`,
    `Throughput verdict: ${v.status} — ${v.reason} (action: ${v.action})`,
  ].join('\n');
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const repo = resolveRepo();
    const runs = fetchCiRuns(repo);
    const apiCache = readApiCache();
    const apiBudget = createApiRequestBudget();
    const { samples: runJobs, cache: nextApiCache } = fetchRunSamples(
      repo,
      runs,
      apiCache,
      new Date(),
      apiBudget
    );
    const prs = fetchMergedPrs();
    const timelineResults = fetchTimelineSamples(
      repo,
      prs,
      apiCache,
      nextApiCache,
      apiBudget
    );
    const uniqueHeadShas = new Set(runs.map(run => run.head_sha));
    const hydratedCheckShas = new Set(
      runJobs
        .filter(sample => sample.requiredChecksHydrated)
        .map(sample => sample.headSha)
    );

    const metrics = summarizeCiMetrics({
      ts: new Date().toISOString(),
      runs,
      prs,
      timelineResults,
      runJobs,
      hydration: {
        runJobs: {
          covered: runJobs.filter(sample => sample.jobsHydrated).length,
          total: runs.length,
        },
        requiredChecks: {
          covered: hydratedCheckShas.size,
          total: uniqueHeadShas.size,
        },
        timelines: {
          covered: timelineResults.length,
          total: prs.length,
        },
      },
    });

    mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
    writeFileSync(
      METRICS_API_CACHE,
      `${JSON.stringify(nextApiCache, null, 2)}\n`
    );
    appendFileSync(METRICS_JSONL, `${JSON.stringify(metrics)}\n`);
    writeFileSync(METRICS_LATEST, `${JSON.stringify(metrics, null, 2)}\n`);

    // Idempotent snapshot page (history lives in the JSONL); makes "what's our
    // current CI throughput/latency" recallable across sessions.
    gbrainLearn({
      slug: 'ci-metrics/latest',
      title: 'CI metrics (latest snapshot)',
      body: renderBody(metrics),
      tags: ['type:ci-metrics'],
      type: 'ci-metrics',
    });

    logJobEvent({
      job: JOB,
      event: 'measured',
      mergedPrsPerDay: metrics.throughput.mergedPrsPerDay,
      runnerHoursPerPr: metrics.throughput.ciRunHoursPerMergedPr,
      flakyRerunRate: metrics.throughput.flakyRerunRate,
      queueWaitP95: metrics.throughput.queueWaitSeconds.p95,
      gateP95: metrics.latency.gateWallclockSeconds.p95,
      fullMergeP95: metrics.latency.fullMergeTimeSeconds.p95,
      fleetLeadTimeP50: metrics.latency.fleetLeadTimeSeconds.p50,
      fleetLeadTimeP95: metrics.latency.fleetLeadTimeSeconds.p95,
      // Schema-v1 log compatibility for one transition window.
      readyToMergeP50: metrics.latency.readyToMergeSeconds.p50,
      readyToMergeP95: metrics.latency.readyToMergeSeconds.p95,
      activeQueuedP95: metrics.latency.activeQueuedSeconds.p95,
      hostedRunnerSeconds: metrics.throughput.runnerJobSeconds.hosted,
      selfHostedRunnerSeconds: metrics.throughput.runnerJobSeconds.selfHosted,
      cancellationWasteSeconds: metrics.throughput.cancellationWasteSeconds,
      throughputVerdictStatus: metrics.throughputVerdict.status,
      throughputVerdictAction: metrics.throughputVerdict.action,
      samples: metrics.sampleSizes,
    });

    process.stdout.write(`${renderBody(metrics)}\n`);
  });
}

void main().catch(err => {
  console.error(`[${JOB}] fatal:`, err);
  // exit 0 so launchd does not thrash on a transient gh/network error.
  process.exit(0);
});
