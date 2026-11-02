// Turbo remote-cache hit rate from GitHub Actions job logs.
//
// Two log lines carry everything:
//   `turbo-cache: backend=<b> [role=<r>] ...`  printed by the setup-node-pnpm
//      composite action ("Select Turbo remote cache"), once per job.
//   `Cached:    <n> cached, <m> total`        printed by turbo after each run.
// A job can run turbo several times; their counts add up.
//
// Pure: no I/O. Used by the CI timing collector (turbo_cache rows) and by
// scripts/turbo-cache-hit-rate.mjs (ad-hoc sampling of named runs).

const CACHED_RE = /Cached:\s+(\d+) cached, (\d+) total/g;
const BACKEND_RE = /turbo-cache: backend=(\S+)(?: role=(\S+))?/;
const REMOTE_DISABLED_RE = /Remote caching disabled/;

/**
 * @param {string} log one job's plain-text log
 * @returns {{ backend: string | null, role: string | null, remoteDisabled: boolean, turboRuns: number, tasksCached: number, tasksTotal: number }}
 */
export function parseTurboCacheLog(log) {
  let tasksCached = 0;
  let tasksTotal = 0;
  let turboRuns = 0;
  for (const match of String(log ?? '').matchAll(CACHED_RE)) {
    tasksCached += Number(match[1]);
    tasksTotal += Number(match[2]);
    turboRuns += 1;
  }
  const backend = BACKEND_RE.exec(String(log ?? ''));
  return {
    backend: backend ? backend[1] : null,
    role: backend && backend[2] ? backend[2] : null,
    remoteDisabled: REMOTE_DISABLED_RE.test(String(log ?? '')),
    turboRuns,
    tasksCached,
    tasksTotal,
  };
}

/**
 * Hit rate over parsed jobs, overall and per job-name lane (matrix suffixes
 * such as "(3/14)" fold into one lane).
 * @param {Array<{ job_name: string, tasks_cached: number, tasks_total: number }>} rows
 */
export function summarizeHitRate(rows) {
  /** @type {Record<string, { cached: number, total: number, jobs: number }>} */
  const lanes = {};
  let cached = 0;
  let total = 0;
  for (const row of rows) {
    if (!row.tasks_total) continue;
    const lane = laneName(row.job_name);
    lanes[lane] ??= { cached: 0, total: 0, jobs: 0 };
    lanes[lane].cached += row.tasks_cached;
    lanes[lane].total += row.tasks_total;
    lanes[lane].jobs += 1;
    cached += row.tasks_cached;
    total += row.tasks_total;
  }
  return {
    cached,
    total,
    hitRate: total ? cached / total : null,
    lanes: Object.fromEntries(
      Object.entries(lanes).map(([lane, v]) => [
        lane,
        { ...v, hitRate: v.total ? v.cached / v.total : null },
      ])
    ),
  };
}

/** @param {string} jobName */
export function laneName(jobName) {
  return String(jobName ?? '')
    .replace(/\s*\(\d+\/\d+\)\s*$/, '')
    .trim();
}
