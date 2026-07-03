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
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { summarizeCiMetrics } from '../../lib/ci-metrics-compute.mjs';
import { parseMergeQueueTimeline } from '../../lib/merge-queue-guard.mjs';
import { gbrainLearn } from '../lib/gbrain';
import { HERMES_PATHS } from '../lib/hermes-paths';
import { logJobEvent, withJobLogging } from '../lib/jobs-log';

const JOB = 'ci-metrics';
const RUN_SAMPLE = 100;
const PR_SAMPLE = 50;
const METRICS_JSONL = join(HERMES_PATHS.stateDir, 'ci-metrics.jsonl');
const METRICS_LATEST = join(HERMES_PATHS.stateDir, 'ci-metrics-latest.json');

interface WorkflowRun {
  readonly id: number;
  readonly created_at: string;
  readonly updated_at: string;
  readonly run_attempt: number;
  readonly status: string;
  readonly conclusion: string | null;
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

function fetchTimeline(repo: string, pr: MergedPr) {
  // ponytail: first 100 timeline events captures the merge-queue label,
  // ready_for_review, and merge events for nearly all PRs; skip --paginate to
  // bound per-tick API cost.
  try {
    const out = gh(
      ['api', `repos/${repo}/issues/${pr.number}/timeline?per_page=100`],
      20_000
    );
    return parseMergeQueueTimeline(JSON.parse(out), {
      prCreatedAt: pr.createdAt,
    });
  } catch {
    return null;
  }
}

function fmtMin(seconds: number): string {
  return `${Math.round(seconds / 60)}m`;
}

function renderBody(m: ReturnType<typeof summarizeCiMetrics>): string {
  const t = m.throughput;
  const l = m.latency;
  return [
    `Window: ${m.window.mergedPrs} merged PRs · ${m.window.ciRuns} CI runs · ${m.window.spanDays}d span`,
    `Throughput (primary): ${t.mergedPrsPerDay}/day · ${t.ciRunHoursPerMergedPr ?? '?'} runner-h/PR · flaky ${(t.flakyRerunRate * 100).toFixed(1)}% · queue-wait p50 ${fmtMin(t.queueWaitSeconds.p50)} / p95 ${fmtMin(t.queueWaitSeconds.p95)}`,
    `Latency (secondary): gate p50 ${fmtMin(l.gateWallclockSeconds.p50)} / p75 ${fmtMin(l.gateWallclockSeconds.p75)} / p95 ${fmtMin(l.gateWallclockSeconds.p95)} · full-merge p50 ${fmtMin(l.fullMergeTimeSeconds.p50)} / p95 ${fmtMin(l.fullMergeTimeSeconds.p95)}`,
    `Ready→merged (target p50<10m / p95<15m): p50 ${fmtMin(l.readyToMergeSeconds.p50)} / p75 ${fmtMin(l.readyToMergeSeconds.p75)} / p95 ${fmtMin(l.readyToMergeSeconds.p95)}`,
    `Samples: gate ${m.sampleSizes.gate} · full-merge ${m.sampleSizes.fullMerge} · queue-wait ${m.sampleSizes.queueWait} · ready-to-merge ${m.sampleSizes.readyToMerge}`,
  ].join('\n');
}

async function main(): Promise<void> {
  await withJobLogging(JOB, async () => {
    const repo = resolveRepo();
    const runs = fetchCiRuns(repo);
    const prs = fetchMergedPrs();
    const timelineResults = prs
      .map(pr => fetchTimeline(repo, pr))
      .filter((t): t is NonNullable<typeof t> => t !== null);

    const metrics = summarizeCiMetrics({
      ts: new Date().toISOString(),
      runs,
      prs,
      timelineResults,
    });

    mkdirSync(HERMES_PATHS.stateDir, { recursive: true });
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
      readyToMergeP50: metrics.latency.readyToMergeSeconds.p50,
      readyToMergeP95: metrics.latency.readyToMergeSeconds.p95,
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
