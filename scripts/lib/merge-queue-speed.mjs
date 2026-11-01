// Merge-queue speed baseline: the few numbers that decide merge throughput.
// Pure functions; collection lives in scripts/merge-queue-speed.mjs.
//
// Why these numbers (decisions/engineering/compute-autoscaling-strategy-2026-10-31):
// runner capacity is not binding; merge-group failure and cancellation
// rework is. So the feed leads with group success, merges/hour and
// merge-group wall p50, and names the jobs that set the critical path.

import { percentile } from './ci-capacity.mjs';

export const SCHEMA = 'jovie-merge-queue-speed/v1';
// Batch-size increases are gated on this (MERGE_QUEUE_STEWARD.md).
export const GROUP_SUCCESS_TARGET = 0.85;

const sec = (a, b) => (Date.parse(a) - Date.parse(b)) / 1000;
const round = (n, d = 1) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? null
    : Math.round(n * 10 ** d) / 10 ** d;

export function stat(values) {
  const s = values.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    n: s.length,
    p50: round(percentile(s, 0.5)),
    p95: round(percentile(s, 0.95)),
  };
}

/** Wall seconds of a completed workflow run (start of first attempt to end). */
export function runWallSeconds(run) {
  if (run.status !== 'completed') return null;
  const start = run.run_started_at ?? run.created_at;
  const s = sec(run.updated_at, start);
  return Number.isFinite(s) && s >= 0 ? s : null;
}

export function outcomeCounts(runs) {
  const counts = { success: 0, failure: 0, cancelled: 0, other: 0 };
  for (const run of runs) {
    if (run.status !== 'completed') continue;
    const key = run.conclusion in counts ? run.conclusion : 'other';
    counts[key] += 1;
  }
  return counts;
}

/**
 * Per-job duration plus how often each job finished last among a successful
 * run's jobs (the job that set the run's wall time).
 * @param {Array<{run: object, jobs: object[]}>} sampled
 */
export function criticalPath(sampled, { top = 6 } = {}) {
  const durations = {};
  const lastCount = {};
  let runs = 0;
  for (const { run, jobs } of sampled) {
    if (run.conclusion !== 'success') continue;
    let last = null;
    for (const job of jobs) {
      if (!job.started_at || !job.completed_at) continue;
      if (job.conclusion === 'skipped') continue;
      const d = sec(job.completed_at, job.started_at);
      if (!Number.isFinite(d) || d < 0) continue;
      (durations[job.name] ??= []).push(d);
      // Summary/ready jobs wait on every lane; skip them when naming the path.
      if (/summary|ready|receipt/i.test(job.name)) continue;
      if (!last || Date.parse(job.completed_at) > Date.parse(last.completed_at))
        last = job;
    }
    if (last) {
      lastCount[last.name] = (lastCount[last.name] ?? 0) + 1;
      runs += 1;
    }
  }
  const rows = Object.entries(durations).map(([name, list]) => ({
    name,
    ...stat(list),
    lastShare: runs ? round((lastCount[name] ?? 0) / runs, 2) : null,
  }));
  // Longest jobs first, then any job that often sets the wall time, so the
  // jobs that end a run are never cut by the top-N of long ones.
  const longest = [...rows]
    .sort((a, b) => (b.p50 ?? 0) - (a.p50 ?? 0))
    .slice(0, top);
  const setters = rows
    .filter(r => (r.lastShare ?? 0) >= 0.1 && !longest.includes(r))
    .sort((a, b) => (b.lastShare ?? 0) - (a.lastShare ?? 0));
  return [...longest, ...setters];
}

/** Runner minutes across sampled runs (all conclusions; rework counts). */
export function runnerMinutes(sampled) {
  let minutes = 0;
  for (const { jobs } of sampled) {
    for (const job of jobs) {
      if (!job.started_at || !job.completed_at) continue;
      const d = sec(job.completed_at, job.started_at) / 60;
      if (Number.isFinite(d) && d > 0) minutes += d;
    }
  }
  return minutes;
}

/** Enqueue-to-merge seconds per PR: last add-to-queue before the merge. */
export function queueWaits(mergedPrs) {
  const waits = [];
  for (const pr of mergedPrs) {
    if (!pr.mergedAt) continue;
    const adds = (pr.enqueuedAt ?? [])
      .filter(t => Date.parse(t) <= Date.parse(pr.mergedAt))
      .sort();
    if (!adds.length) continue;
    waits.push(sec(pr.mergedAt, adds[adds.length - 1]));
  }
  return waits;
}

/** Group success over trailing windows, so the 85%-for-2h gate is checkable. */
export function successByWindow(runs, nowMs, hoursList = [2, 6, 24]) {
  const out = {};
  for (const h of hoursList) {
    const since = nowMs - h * 3_600_000;
    const c = outcomeCounts(
      runs.filter(r => Date.parse(r.created_at) >= since)
    );
    const decided = c.success + c.failure;
    out[`${h}h`] = {
      ...c,
      successRate: decided ? round(c.success / decided, 3) : null,
      successRateInclCancelled:
        decided + c.cancelled
          ? round(c.success / (decided + c.cancelled), 3)
          : null,
    };
  }
  return out;
}

export function summarize({
  prRuns = [],
  groupRuns = [],
  sampledGroupJobs = [],
  mergedPrs = [],
  now = Date.now(),
  windowHours = 24,
}) {
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  const okWall = runs =>
    stat(
      runs
        .filter(r => r.conclusion === 'success')
        .map(runWallSeconds)
        .filter(v => v !== null)
    );
  const windows = successByWindow(groupRuns, nowMs);
  const merges = mergedPrs.filter(
    p => p.mergedAt && Date.parse(p.mergedAt) >= nowMs - windowHours * 3.6e6
  ).length;
  const completedGroups = groupRuns.filter(r => r.status === 'completed');
  const sampledCompleted = sampledGroupJobs.filter(
    s => s.run.status === 'completed'
  );
  const sampleRatio = completedGroups.length
    ? sampledCompleted.length / completedGroups.length
    : 0;
  const groupMinutes = sampleRatio
    ? runnerMinutes(sampledCompleted) / sampleRatio
    : null;
  const success2h = windows['2h'].successRate;
  return {
    schema: SCHEMA,
    generatedAt: new Date(nowMs).toISOString(),
    windowHours,
    prCiSeconds: okWall(prRuns),
    mergeGroupCiSeconds: okWall(groupRuns),
    groupOutcomes: windows,
    groupSuccessRate: windows[`${windowHours}h`]?.successRate ?? null,
    mergesPerHour: round(merges / windowHours, 2),
    merges,
    queueWaitSeconds: stat(queueWaits(mergedPrs)),
    criticalPath: criticalPath(sampledGroupJobs),
    mergeGroupRunnerMinutesPerMerge:
      groupMinutes !== null && merges ? round(groupMinutes / merges) : null,
    sampled: {
      prRuns: prRuns.length,
      groupRuns: groupRuns.length,
      groupRunsWithJobs: sampledGroupJobs.length,
      mergedPrs: mergedPrs.length,
    },
    batchSizeGate: {
      target: GROUP_SUCCESS_TARGET,
      success2h,
      eligible: success2h !== null && success2h >= GROUP_SUCCESS_TARGET,
    },
  };
}

/** Digest line for Summer (lanes status gist embeds the slo block). */
export function digestBlock(summary) {
  if (!summary) return null;
  return {
    mergesPerHour: summary.mergesPerHour,
    groupSuccessRate: summary.groupSuccessRate,
    groupSuccessRate2h: summary.batchSizeGate?.success2h ?? null,
    mergeGroupP50Seconds: summary.mergeGroupCiSeconds?.p50 ?? null,
    queueWaitP50Seconds: summary.queueWaitSeconds?.p50 ?? null,
    generatedAt: summary.generatedAt,
  };
}
