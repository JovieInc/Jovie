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
import {
  GRAPHITE_QUEUE_POLICY,
  REQUIRED_MERGE_STATUSES,
} from './merge-queue-guard.mjs';

// The merge-queue hot path intentionally tracks only the statuses Graphite
// waits on directly. CI metrics must mirror the complete active main ruleset,
// which also requires the independent PR Size Guard workflow.
export const CI_METRICS_REQUIRED_STATUSES = Object.freeze([
  ...REQUIRED_MERGE_STATUSES,
  'PR Size Guard',
]);

export const CI_METRICS_SCHEMA_VERSION = 2;

/** Fleet lead-time targets (ready-for-review/open → merged). */
export const FLEET_LEAD_TIME_P50_TARGET_SECONDS = 600; // 10m
export const FLEET_LEAD_TIME_P95_TARGET_SECONDS = 900; // 15m
export const MIN_FLEET_LEAD_TIME_SAMPLES = 10;
// Schema-v1 compatibility aliases. Keep for one metrics transition window.
export const READY_TO_MERGE_P50_TARGET_SECONDS =
  FLEET_LEAD_TIME_P50_TARGET_SECONDS;
export const READY_TO_MERGE_P95_TARGET_SECONDS =
  FLEET_LEAD_TIME_P95_TARGET_SECONDS;
export const MIN_READY_TO_MERGE_SAMPLES = MIN_FLEET_LEAD_TIME_SAMPLES;

/** {p50,p75,p95} of an array (0s when empty). */
export function percentilesOf(values) {
  return {
    p50: computePercentile(values, 50),
    p75: computePercentile(values, 75),
    p95: computePercentile(values, 95),
  };
}

/**
 * Legacy workflow wall-clock seconds for every completed run (any conclusion).
 * This is retained for schema-v1 compatibility; runner job time is authoritative.
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

/** Legacy workflow wall-clock hours; retained for schema-v1 compatibility. */
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
    .map(t => t && (t.firstEnqueueToMergedSeconds ?? t.queuedToMergedSeconds))
    .filter(s => Number.isFinite(s) && s > 0);
}

export function lastEnqueueToMergeSeconds(timelineResults) {
  return (timelineResults ?? [])
    .map(
      t => t && (t.lastEnqueueToMergedSeconds ?? t.lastQueuedToMergedSeconds)
    )
    .filter(s => Number.isFinite(s) && s > 0);
}

export function activeQueuedSeconds(timelineResults) {
  return (timelineResults ?? [])
    .map(t => t && t.activeQueuedSeconds)
    .filter(s => Number.isFinite(s) && s > 0);
}

/**
 * Fleet lead-time seconds from parseMergeQueueTimeline results, preferring the
 * schema-v2 field with the schema-v1 readyToMergedSeconds fallback. Tracks the
 * ready→merged p50<10m / p95<15m target —
 * separate from queueWaitSeconds (merge-queue-label→merged), since a PR can
 * sit ready-for-review for a while before ever being queued.
 */
export function fleetLeadTimeSeconds(timelineResults) {
  return (timelineResults ?? [])
    .map(t => t && (t.fleetLeadTimeSeconds ?? t.readyToMergedSeconds))
    .filter(s => Number.isFinite(s) && s > 0);
}

/** Schema-v1 compatibility alias for fleetLeadTimeSeconds. */
export function readyToMergeSeconds(timelineResults) {
  return fleetLeadTimeSeconds(timelineResults);
}

const TERMINAL_FAILURE_CONCLUSIONS = new Set([
  'failure',
  'error',
  'timed_out',
  'action_required',
  'startup_failure',
]);
const REQUIRED_CHECK_TERMINAL_CONCLUSIONS = new Set([
  'success',
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'startup_failure',
  'neutral',
]);
const INCOMPLETE_CHECK_CACHE_HOURS = 24;
const NON_GREEN_CHECK_RETRY_HOURS = 6;
const GREEN_CHECK_REFRESH_HOURS = 24;

function positiveElapsedSeconds(start, end) {
  if (!start || !end) return null;
  const seconds = computeElapsedSeconds(start, end);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function nonNegativeElapsedSeconds(start, end) {
  if (!start || !end) return null;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return (endMs - startMs) / 1000;
}

function isSelfHostedJob(job) {
  const labels = (job?.labels ?? []).map(label => String(label).toLowerCase());
  return labels.includes('self-hosted') || labels.includes('jovie-runner');
}

export function latestRequiredChecks(checks) {
  const latest = new Map();
  for (const check of checks ?? []) {
    if (!CI_METRICS_REQUIRED_STATUSES.includes(check?.name)) continue;
    const previous = latest.get(check.name);
    // GitHub's monotonic check-run id is authoritative when both executions
    // expose one. Timestamps are only a fallback for missing/equal ids; an
    // older execution may start or finish after a newer pending check exists.
    const id = typeof check?.id === 'number' ? check.id : null;
    const previousId = typeof previous?.id === 'number' ? previous.id : null;
    const idsDecide =
      Number.isFinite(id) && Number.isFinite(previousId) && id !== previousId;
    const timestamp = Date.parse(
      check?.started_at ?? check?.completed_at ?? ''
    );
    const previousTimestamp = Date.parse(
      previous?.started_at ?? previous?.completed_at ?? ''
    );
    const timestampDecides =
      !Number.isFinite(previousTimestamp) || timestamp >= previousTimestamp;
    if (!previous || (idsDecide ? id > previousId : timestampDecides)) {
      latest.set(check.name, check);
    }
  }
  return CI_METRICS_REQUIRED_STATUSES.map(name => latest.get(name)).filter(
    Boolean
  );
}

export function hasCompleteRequiredChecks(checks) {
  const latest = latestRequiredChecks(checks);
  return (
    latest.length === CI_METRICS_REQUIRED_STATUSES.length &&
    latest.every(check =>
      REQUIRED_CHECK_TERMINAL_CONCLUSIONS.has(check?.conclusion)
    )
  );
}

export function hasGreenRequiredChecks(checks) {
  const latest = latestRequiredChecks(checks);
  return (
    latest.length === CI_METRICS_REQUIRED_STATUSES.length &&
    latest.every(check => check?.conclusion === 'success')
  );
}

export function shouldReuseJobCache(run, cached) {
  return Boolean(cached && cached.updatedAt === run?.updated_at);
}

export function shouldReuseRequiredChecksCache(run, cached, now = new Date()) {
  if (!cached) return false;
  // Check runs are scoped to the commit SHA, not to one ci.yml workflow run.
  // Several PR events can produce runs for the same SHA with different
  // updated_at values; tying this cache to run.updated_at causes every sibling
  // run to invalidate and refetch the same commit checks.
  const fetchedAt = new Date(cached.fetchedAt).getTime();
  const sinceFetchHours = (now.getTime() - fetchedAt) / 3_600_000;
  if (cached.green) {
    return (
      Number.isFinite(sinceFetchHours) &&
      sinceFetchHours >= 0 &&
      sinceFetchHours < GREEN_CHECK_REFRESH_HOURS
    );
  }
  // Terminal red is not stable: Fork PR Gate is a separate workflow and may
  // rerun without changing the sampled ci.yml run's updated_at.
  const createdAt = new Date(run?.created_at).getTime();
  const ageHours = (now.getTime() - createdAt) / 3_600_000;
  const retryHours =
    Number.isFinite(ageHours) && ageHours >= INCOMPLETE_CHECK_CACHE_HOURS
      ? GREEN_CHECK_REFRESH_HOURS
      : NON_GREEN_CHECK_RETRY_HOURS;
  return (
    Number.isFinite(sinceFetchHours) &&
    sinceFetchHours >= 0 &&
    sinceFetchHours < retryHours
  );
}

/**
 * Shared budget for bounded GitHub detail hydration. `tryConsume` is checked
 * immediately before each request, so a cold cache makes incremental progress
 * without turning one Hermes tick into hundreds of sequential API calls.
 */
export function createApiRequestBudget({
  maxRequests = 24,
  maxElapsedMs = 4 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  const startedAt = now();
  let used = 0;
  return {
    tryConsume(reservedRequests = 0) {
      const reserve = Math.max(
        0,
        Math.min(maxRequests, Number(reservedRequests) || 0)
      );
      if (used >= maxRequests - reserve || now() - startedAt >= maxElapsedMs)
        return false;
      used += 1;
      return true;
    },
    get used() {
      return used;
    },
  };
}

/** Aggregate job-level runner consumption and gate diagnostics per sampled run. */
export function summarizeJobMetrics(runJobs) {
  let hostedSeconds = 0;
  let selfHostedSeconds = 0;
  let cancellationWasteSeconds = 0;
  const jobStartDelays = [];
  const firstTerminalFailures = [];
  const requiredGreen = [];

  for (const sample of runJobs ?? []) {
    const jobs = (sample?.jobs ?? []).filter(
      job => job?.conclusion !== 'skipped'
    );
    const terminalFailureCompletions = [];

    for (const job of jobs) {
      const duration = positiveElapsedSeconds(
        job?.started_at,
        job?.completed_at
      );
      if (duration !== null) {
        if (isSelfHostedJob(job)) selfHostedSeconds += duration;
        else hostedSeconds += duration;
        if (
          sample?.runConclusion === 'cancelled' ||
          job?.conclusion === 'cancelled'
        ) {
          cancellationWasteSeconds += duration;
        }
      }

      const startDelay = nonNegativeElapsedSeconds(
        sample?.runCreatedAt,
        job?.started_at
      );
      if (startDelay !== null) jobStartDelays.push(startDelay);

      if (
        TERMINAL_FAILURE_CONCLUSIONS.has(job?.conclusion) &&
        job?.completed_at
      ) {
        terminalFailureCompletions.push(job.completed_at);
      }
    }

    const firstFailureAt = terminalFailureCompletions.sort()[0];
    const firstFailure = positiveElapsedSeconds(
      sample?.runCreatedAt,
      firstFailureAt
    );
    if (firstFailure !== null) firstTerminalFailures.push(firstFailure);

    const requiredChecks = latestRequiredChecks(sample?.requiredChecks);
    if (
      hasCompleteRequiredChecks(requiredChecks) &&
      requiredChecks.every(
        check => check?.conclusion === 'success' && check?.completed_at
      )
    ) {
      const requiredGreenAt = requiredChecks
        .map(check => check.completed_at)
        .sort()
        .at(-1);
      const elapsed = positiveElapsedSeconds(
        sample?.runCreatedAt,
        requiredGreenAt
      );
      if (elapsed !== null) requiredGreen.push(elapsed);
    }
  }

  return {
    runnerSeconds: { hosted: hostedSeconds, selfHosted: selfHostedSeconds },
    cancellationWasteSeconds,
    jobStartDelaySeconds: percentilesOf(jobStartDelays),
    timeToFirstTerminalFailureSeconds: percentilesOf(firstTerminalFailures),
    timeToRequiredGreenSeconds: percentilesOf(requiredGreen),
    sampleSizes: {
      jobs: (runJobs ?? []).reduce(
        (count, sample) =>
          count +
          (sample?.jobs ?? []).filter(job => job?.conclusion !== 'skipped')
            .length,
        0
      ),
      jobStartDelay: jobStartDelays.length,
      firstTerminalFailure: firstTerminalFailures.length,
      requiredGreen: requiredGreen.length,
    },
  };
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
  const sampleCount =
    metrics?.sampleSizes?.fleetLeadTime ??
    metrics?.sampleSizes?.readyToMerge ??
    0;
  const fleetLead =
    metrics?.latency?.fleetLeadTimeSeconds ??
    metrics?.latency?.readyToMergeSeconds;
  const p50 = fleetLead?.p50 ?? 0;
  const p95 = fleetLead?.p95 ?? 0;
  const queuePolicy = {
    maxQueueDepth: GRAPHITE_QUEUE_POLICY.maxQueueDepth,
    parallelBatchSize: GRAPHITE_QUEUE_POLICY.parallelBatchSize,
  };

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
      queuePolicy,
    };
  }

  if (sampleCount < MIN_READY_TO_MERGE_SAMPLES) {
    return {
      status: 'insufficient_data',
      reason: `Need >=${MIN_READY_TO_MERGE_SAMPLES} fleet lead-time samples (have ${sampleCount})`,
      sampleCount,
      p50Seconds: p50,
      p95Seconds: p95,
      targets: {
        p50Seconds: READY_TO_MERGE_P50_TARGET_SECONDS,
        p95Seconds: READY_TO_MERGE_P95_TARGET_SECONDS,
      },
      action: 'collect_more_samples',
      queuePolicy,
    };
  }

  const p50OnTarget = p50 > 0 && p50 < READY_TO_MERGE_P50_TARGET_SECONDS;
  const p95OnTarget = p95 > 0 && p95 < READY_TO_MERGE_P95_TARGET_SECONDS;

  if (p50OnTarget && p95OnTarget) {
    return {
      status: 'on_target',
      reason: 'Fleet lead-time p50 and p95 are within targets',
      sampleCount,
      p50Seconds: p50,
      p95Seconds: p95,
      targets: {
        p50Seconds: READY_TO_MERGE_P50_TARGET_SECONDS,
        p95Seconds: READY_TO_MERGE_P95_TARGET_SECONDS,
      },
      action: 'close_follow_up',
      queuePolicy,
    };
  }

  const actions = [];
  if (!p95OnTarget) {
    if (GRAPHITE_QUEUE_POLICY.maxQueueDepth < 16) {
      actions.push(
        `raise_max_queue_depth_${GRAPHITE_QUEUE_POLICY.maxQueueDepth}_to_16`
      );
    } else {
      actions.push('investigate_runner_capacity_and_queue_churn');
    }
  }
  if (!p50OnTarget) {
    actions.push('tune_unit_test_shards');
  }

  return {
    status: 'off_target',
    reason:
      p95 > READY_TO_MERGE_P95_TARGET_SECONDS
        ? `Fleet lead-time p95 ${Math.round(p95 / 60)}m exceeds ${READY_TO_MERGE_P95_TARGET_SECONDS / 60}m target`
        : `Fleet lead-time p50 ${Math.round(p50 / 60)}m exceeds ${READY_TO_MERGE_P50_TARGET_SECONDS / 60}m target`,
    sampleCount,
    p50Seconds: p50,
    p95Seconds: p95,
    targets: {
      p50Seconds: READY_TO_MERGE_P50_TARGET_SECONDS,
      p95Seconds: READY_TO_MERGE_P95_TARGET_SECONDS,
    },
    action: actions.join(';'),
    queuePolicy,
  };
}

export function summarizeCiMetrics({
  ts,
  runs,
  prs,
  timelineResults,
  runJobs = [],
  hydration,
}) {
  const gate = gateDurationsSeconds(runs);
  const fullMerge = fullMergeTimesSeconds(prs);
  const queueWaits = queueWaitSeconds(timelineResults);
  const lastEnqueueToMerge = lastEnqueueToMergeSeconds(timelineResults);
  const activeQueued = activeQueuedSeconds(timelineResults);
  const fleetLeadTime = fleetLeadTimeSeconds(timelineResults);
  const jobMetrics = summarizeJobMetrics(runJobs);
  const { mergedPrsPerDay, spanDays, mergedCount } = mergedThroughput(prs);
  const hydrationCoverage = {
    runJobs: {
      covered: hydration?.runJobs?.covered ?? runJobs.length,
      total: hydration?.runJobs?.total ?? runJobs.length,
    },
    requiredChecks: {
      covered: hydration?.requiredChecks?.covered ?? runJobs.length,
      total: hydration?.requiredChecks?.total ?? runJobs.length,
    },
    timelines: {
      covered: hydration?.timelines?.covered ?? timelineResults?.length ?? 0,
      total: hydration?.timelines?.total ?? timelineResults?.length ?? 0,
    },
  };
  const hydrationComplete = Object.values(hydrationCoverage).every(
    coverage => coverage.covered >= coverage.total
  );
  const evaluatedVerdict = evaluateMergeQueueThroughput(
    {
      latency: {
        fleetLeadTimeSeconds: percentilesOf(fleetLeadTime),
      },
      sampleSizes: { fleetLeadTime: fleetLeadTime.length },
    },
    // Keep verdict deterministic: callers pass `ts` so wall-clock Date.now
    // cannot flip evaluation-window status between test and job runs.
    { now: ts ? new Date(ts) : new Date() }
  );

  return {
    schemaVersion: CI_METRICS_SCHEMA_VERSION,
    ts,
    hydration: {
      complete: hydrationComplete,
      ...hydrationCoverage,
    },
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
      runnerJobSeconds: jobMetrics.runnerSeconds,
      cancellationWasteSeconds: jobMetrics.cancellationWasteSeconds,
    },
    // SECONDARY: latency diagnostics.
    latency: {
      gateWallclockSeconds: percentilesOf(gate),
      fullMergeTimeSeconds: percentilesOf(fullMerge),
      // Tracks the ready→merged p50<10m / p95<15m target.
      readyToMergeSeconds: percentilesOf(fleetLeadTime),
      fleetLeadTimeSeconds: percentilesOf(fleetLeadTime),
      firstEnqueueLeadSeconds: percentilesOf(queueWaits),
      lastEnqueueToMergeSeconds: percentilesOf(lastEnqueueToMerge),
      activeQueuedSeconds: percentilesOf(activeQueued),
      jobStartDelaySeconds: jobMetrics.jobStartDelaySeconds,
      timeToFirstTerminalFailureSeconds:
        jobMetrics.timeToFirstTerminalFailureSeconds,
      timeToRequiredGreenSeconds: jobMetrics.timeToRequiredGreenSeconds,
    },
    sampleSizes: {
      gate: gate.length,
      fullMerge: fullMerge.length,
      queueWait: queueWaits.length,
      readyToMerge: fleetLeadTime.length,
      fleetLeadTime: fleetLeadTime.length,
      firstEnqueueLead: queueWaits.length,
      lastEnqueueToMerge: lastEnqueueToMerge.length,
      activeQueued: activeQueued.length,
      ...jobMetrics.sampleSizes,
    },
    throughputVerdict: hydrationComplete
      ? evaluatedVerdict
      : {
          ...evaluatedVerdict,
          status: 'insufficient_data',
          reason: 'API hydration incomplete; snapshot is non-authoritative',
          action: 'hydrate_remaining_api_samples',
        },
  };
}
