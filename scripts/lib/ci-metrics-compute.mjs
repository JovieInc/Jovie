/**
 * CI metrics — pure aggregation helpers.
 *
 * Read-only measurement of the merge pipeline. PRIMARY signal is throughput
 * (the real ceiling per docs/PR_FLOW.md: "Throughput ceiling is CI cost and
 * queue reliability, not merge wiring"); latency percentiles are SECONDARY
 * diagnostics. No experiment loop, no auto keep/rollback lives here — this
 * module only computes numbers from already-fetched GitHub data so the I/O job
 * (scripts/hermes/jobs/ci-metrics.ts) and unit tests share one tested core.
 *
 * Percentiles use the same nearest-rank method as the duration ratchet, so the
 * gate p95 we report agrees with .github/workflows/ci-duration-ratchet.yml.
 */

import {
  computeElapsedSeconds,
  computePercentile,
} from './ci-duration-ratchet.mjs';

export const CI_METRICS_SCHEMA_VERSION = 1;

/** Ready→merged merge-time targets (docs/PR_FLOW.md, gbrain ci-metrics/latest). */
export const READY_TO_MERGE_P50_TARGET_SECONDS = 600; // 10m
export const READY_TO_MERGE_P95_TARGET_SECONDS = 900; // 15m
/** Minimum ready→merged samples before a throughput verdict is actionable. */
export const MIN_READY_TO_MERGE_SAMPLES = 10;

/** {p50,p75,p95} of an array (0s when empty). */
export function percentilesOf(values) {
  return {
    p50: computePercentile(values, 50),
    p75: computePercentile(values, 75),
    p95: computePercentile(values, 95),
  };
}

/**
 * Wall-clock seconds for every completed run (any conclusion). This is the
 * slot-hours basis: failed/cancelled runs still burn runner slots.
 */
export function completedDurationsSeconds(runs) {
  return (runs ?? [])
    .filter(r => r && r.status === 'completed' && r.created_at && r.updated_at)
    .map(r => computeElapsedSeconds(r.created_at, r.updated_at))
    .filter(s => Number.isFinite(s) && s > 0);
}

/**
 * Gate wall-clock seconds for SUCCESSFUL PR runs only (conclusion === 'success'),
 * matching .github/workflows/ci-duration-ratchet.yml (which queries
 * status=success) so our gate p95 is comparable to the nightly ratchet.
 * Failed/cancelled runs are captured by flakyRerunRate + ciRunHours, not here —
 * a run that failed and got re-run shouldn't inflate "how long a passing gate takes".
 */
export function gateDurationsSeconds(runs) {
  return completedDurationsSeconds(
    (runs ?? []).filter(r => r && r.conclusion === 'success')
  );
}

/** Full PR lifetime seconds (createdAt → mergedAt) for merged PRs. */
export function fullMergeTimesSeconds(prs) {
  return (prs ?? [])
    .filter(p => p && p.createdAt && p.mergedAt)
    .map(p => computeElapsedSeconds(p.createdAt, p.mergedAt))
    .filter(s => Number.isFinite(s) && s > 0);
}

/**
 * Fraction of CI runs that needed a re-run (run_attempt > 1) — a flaky-rerun
 * proxy. Reruns burn the runner slots that are the throughput ceiling, so this
 * is a primary, not cosmetic, signal. Returns 0 when there are no runs.
 */
export function flakyRerunRate(runs) {
  const list = (runs ?? []).filter(r => r && Number.isFinite(r.run_attempt));
  if (list.length === 0) return 0;
  const reran = list.filter(r => r.run_attempt > 1).length;
  return reran / list.length;
}

/** Total CI runner wall-clock hours across all completed runs (a slot-hours proxy). */
export function ciRunHours(runs) {
  const totalSeconds = completedDurationsSeconds(runs).reduce(
    (a, b) => a + b,
    0
  );
  return totalSeconds / 3600;
}

/**
 * Average merged-PRs/day across the sampled window. spanDays is the spread
 * between the earliest and latest mergedAt; clamped to >= 1 so a burst of PRs
 * merged within one day can't report an absurd rate.
 * Returns { mergedPrsPerDay, spanDays, mergedCount }.
 */
export function mergedThroughput(prs) {
  const merged = (prs ?? []).filter(p => p && p.mergedAt);
  const mergedCount = merged.length;
  if (mergedCount === 0)
    return { mergedPrsPerDay: 0, spanDays: 0, mergedCount: 0 };
  const times = merged
    .map(p => new Date(p.mergedAt).getTime())
    .filter(Number.isFinite);
  const spanMs = Math.max(...times) - Math.min(...times);
  const spanDays = spanMs / 86_400_000;
  const effectiveDays = Math.max(spanDays, 1);
  return {
    mergedPrsPerDay: mergedCount / effectiveDays,
    spanDays: Number(spanDays.toFixed(3)),
    mergedCount,
  };
}

/** Queue-wait seconds from parseMergeQueueTimeline results (queuedToMergedSeconds). */
export function queueWaitSeconds(timelineResults) {
  return (timelineResults ?? [])
    .map(t => t && t.queuedToMergedSeconds)
    .filter(s => Number.isFinite(s) && s > 0);
}

/**
 * Ready→merged seconds from parseMergeQueueTimeline results
 * (readyToMergedSeconds). Tracks the ready→merged p50<10m / p95<15m target —
 * separate from queueWaitSeconds (merge-queue-label→merged), since a PR can
 * sit ready-for-review for a while before ever being queued.
 */
export function readyToMergeSeconds(timelineResults) {
  return (timelineResults ?? [])
    .map(t => t && t.readyToMergedSeconds)
    .filter(s => Number.isFinite(s) && s > 0);
}

/**
 * Assemble the one-line metrics record. Pure: callers pass `ts` so tests stay
 * deterministic (Date.now lives in the I/O job, not here).
 */
/**
 * Verdict for merge-queue throughput re-evaluation (GH #12771).
 * Returns a machine-readable action without mutating CI config.
 */
export function evaluateMergeQueueThroughput(metrics, options = {}) {
  const now = options.now ?? new Date();
  const eligibleAfter =
    options.eligibleAfter ?? new Date('2026-07-09T00:00:00Z');
  const sampleCount = metrics?.sampleSizes?.readyToMerge ?? 0;
  const p50 = metrics?.latency?.readyToMergeSeconds?.p50 ?? 0;
  const p95 = metrics?.latency?.readyToMergeSeconds?.p95 ?? 0;

  if (now < eligibleAfter) {
    return {
      status: 'defer',
      reason: `Re-evaluation eligible after ${eligibleAfter.toISOString().slice(0, 10)}`,
      sampleCount,
      p50Seconds: p50,
      p95Seconds: p95,
      targets: {
        p50Seconds: READY_TO_MERGE_P50_TARGET_SECONDS,
        p95Seconds: READY_TO_MERGE_P95_TARGET_SECONDS,
      },
      action: 'wait_for_evaluation_window',
    };
  }

  if (sampleCount < MIN_READY_TO_MERGE_SAMPLES) {
    return {
      status: 'insufficient_data',
      reason: `Need >=${MIN_READY_TO_MERGE_SAMPLES} ready→merged samples (have ${sampleCount})`,
      sampleCount,
      p50Seconds: p50,
      p95Seconds: p95,
      targets: {
        p50Seconds: READY_TO_MERGE_P50_TARGET_SECONDS,
        p95Seconds: READY_TO_MERGE_P95_TARGET_SECONDS,
      },
      action: 'collect_more_samples',
    };
  }

  const p50OnTarget = p50 > 0 && p50 < READY_TO_MERGE_P50_TARGET_SECONDS;
  const p95OnTarget = p95 > 0 && p95 < READY_TO_MERGE_P95_TARGET_SECONDS;

  if (p50OnTarget && p95OnTarget) {
    return {
      status: 'on_target',
      reason: 'Ready→merged p50 and p95 are within targets',
      sampleCount,
      p50Seconds: p50,
      p95Seconds: p95,
      targets: {
        p50Seconds: READY_TO_MERGE_P50_TARGET_SECONDS,
        p95Seconds: READY_TO_MERGE_P95_TARGET_SECONDS,
      },
      action: 'close_follow_up',
    };
  }

  const actions = [];
  if (!p95OnTarget) {
    actions.push('raise_max_queue_depth_12_to_16');
  }
  if (!p50OnTarget) {
    actions.push('tune_unit_test_shards');
  }

  return {
    status: 'off_target',
    reason:
      p95 > READY_TO_MERGE_P95_TARGET_SECONDS
        ? `Ready→merged p95 ${Math.round(p95 / 60)}m exceeds ${READY_TO_MERGE_P95_TARGET_SECONDS / 60}m target`
        : `Ready→merged p50 ${Math.round(p50 / 60)}m exceeds ${READY_TO_MERGE_P50_TARGET_SECONDS / 60}m target`,
    sampleCount,
    p50Seconds: p50,
    p95Seconds: p95,
    targets: {
      p50Seconds: READY_TO_MERGE_P50_TARGET_SECONDS,
      p95Seconds: READY_TO_MERGE_P95_TARGET_SECONDS,
    },
    action: actions.join(';'),
  };
}

export function summarizeCiMetrics({ ts, runs, prs, timelineResults }) {
  const gate = gateDurationsSeconds(runs);
  const fullMerge = fullMergeTimesSeconds(prs);
  const queueWaits = queueWaitSeconds(timelineResults);
  const readyToMerge = readyToMergeSeconds(timelineResults);
  const { mergedPrsPerDay, spanDays, mergedCount } = mergedThroughput(prs);

  return {
    schemaVersion: CI_METRICS_SCHEMA_VERSION,
    ts,
    window: {
      mergedPrs: (prs ?? []).length,
      ciRuns: (runs ?? []).length,
      spanDays,
    },
    // PRIMARY: throughput is the real ceiling.
    throughput: {
      mergedPrsPerDay: Number(mergedPrsPerDay.toFixed(2)),
      ciRunHoursPerMergedPr:
        mergedCount > 0
          ? Number((ciRunHours(runs) / mergedCount).toFixed(3))
          : null,
      flakyRerunRate: Number(flakyRerunRate(runs).toFixed(4)),
      queueWaitSeconds: percentilesOf(queueWaits),
    },
    // SECONDARY: latency diagnostics.
    latency: {
      gateWallclockSeconds: percentilesOf(gate),
      fullMergeTimeSeconds: percentilesOf(fullMerge),
      // Tracks the ready→merged p50<10m / p95<15m target.
      readyToMergeSeconds: percentilesOf(readyToMerge),
    },
    sampleSizes: {
      gate: gate.length,
      fullMerge: fullMerge.length,
      queueWait: queueWaits.length,
      readyToMerge: readyToMerge.length,
    },
    throughputVerdict: evaluateMergeQueueThroughput(
      {
        latency: {
          readyToMergeSeconds: percentilesOf(readyToMerge),
        },
        sampleSizes: { readyToMerge: readyToMerge.length },
      },
      // Keep verdict deterministic: callers pass `ts` so wall-clock Date.now
      // cannot flip evaluation-window status between test and job runs.
      { now: ts ? new Date(ts) : new Date() }
    ),
  };
}
