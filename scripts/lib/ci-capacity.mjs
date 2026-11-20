// Hosted-runner capacity SLO: queue wait and control-plane spend.
// Pure functions; collection lives in scripts/ci-capacity-slo.mjs.
// Measured 2026-10-29: hosted queue is saturated by gates (Source Validation
// ~53% of job-minutes), not by control-plane workflows (~6%), so this feed
// exists to keep that split visible and alarm when hosted wait p95 > 120s.

export const HOSTED_QUEUE_P95_ALARM_SECONDS = 120;

// Workflows that coordinate, label, enroll or relay rather than gate a merge.
export const CONTROL_PLANE_WORKFLOWS = [
  'Merge Queue Green Enroll',
  'Lane Fix Relay',
  'PR Fleet Rules',
  'Auto-Ready Agent Drafts',
  'Dependabot Pin Sync',
  'Legacy Human Hold Scrub',
  'Unstack Merged Parent',
  'Security Suppression Audit',
  'Source Admission Review Signal',
  'PR Size Guard Label Override',
  'Linear Sync on Merge',
];

export function percentile(sorted, q) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
}

export function isSelfHosted(job) {
  return (job.labels ?? []).includes('self-hosted');
}

const sec = (a, b) => (Date.parse(a) - Date.parse(b)) / 1000;

/**
 * @param {Array<{workflow:string,status:string,conclusion?:string|null,
 *   created_at:string,started_at?:string|null,completed_at?:string|null,
 *   labels?:string[],noop?:boolean}>} jobs
 */
export function summarizeCapacity(
  jobs,
  { now = Date.now(), windowHours = 0.25, sampleRatio = 1 } = {}
) {
  const nowMs = typeof now === 'number' ? now : Date.parse(now);
  const hours = windowHours * 1;
  const scale = sampleRatio > 0 ? 1 / sampleRatio : 1;
  const waits = { hosted: [], selfHosted: [] };
  const byWorkflow = {};
  for (const job of jobs) {
    // Skipped jobs never take a runner; cancelled-before-start did not wait on one.
    if (job.conclusion === 'skipped') continue;
    const queued = !job.started_at || job.status === 'queued';
    if (!queued && job.conclusion === 'cancelled' && !job.completed_at)
      continue;
    const wait = queued
      ? (nowMs - Date.parse(job.created_at)) / 1000
      : sec(job.started_at, job.created_at);
    if (!Number.isFinite(wait) || wait < 0) continue;
    (isSelfHosted(job) ? waits.selfHosted : waits.hosted).push(wait);
    if (queued) continue;
    const minutes =
      job.completed_at && job.started_at
        ? sec(job.completed_at, job.started_at) / 60
        : 0;
    const row = (byWorkflow[job.workflow] ??= {
      jobs: 0,
      jobMinutes: 0,
      noopJobs: 0,
    });
    if (!isSelfHosted(job)) {
      row.jobs += 1;
      row.jobMinutes += Math.max(0, minutes);
      if (job.noop) row.noopJobs += 1;
    }
  }
  const stat = list => {
    const s = [...list].sort((a, b) => a - b);
    return {
      n: s.length,
      p50: percentile(s, 0.5),
      p95: percentile(s, 0.95),
      max: s.length ? s[s.length - 1] : null,
    };
  };
  const hostedQueue = stat(waits.hosted);
  const controlPlane = {};
  let controlPlaneJobMinutes = 0;
  let totalJobMinutes = 0;
  for (const [workflow, row] of Object.entries(byWorkflow)) {
    totalJobMinutes += row.jobMinutes;
    if (!CONTROL_PLANE_WORKFLOWS.includes(workflow)) continue;
    controlPlaneJobMinutes += row.jobMinutes;
    controlPlane[workflow] = {
      jobsPerHour: round((row.jobs * scale) / hours),
      jobMinutesPerHour: round((row.jobMinutes * scale) / hours),
      noopJobsPerHour: round((row.noopJobs * scale) / hours),
    };
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date(nowMs).toISOString(),
    windowHours,
    sampleRatio,
    hostedQueueSeconds: hostedQueue,
    selfHostedQueueSeconds: stat(waits.selfHosted),
    controlPlane,
    controlPlaneJobMinutesPerHour: round(
      (controlPlaneJobMinutes * scale) / hours
    ),
    totalHostedJobMinutesPerHour: round((totalJobMinutes * scale) / hours),
    controlPlaneShare: totalJobMinutes
      ? round(controlPlaneJobMinutes / totalJobMinutes, 3)
      : null,
    alarm: {
      metric: 'hosted_queue_wait_p95_seconds',
      threshold: HOSTED_QUEUE_P95_ALARM_SECONDS,
      firing:
        hostedQueue.p95 !== null &&
        hostedQueue.p95 > HOSTED_QUEUE_P95_ALARM_SECONDS,
    },
  };
}

function round(n, digits = 1) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
