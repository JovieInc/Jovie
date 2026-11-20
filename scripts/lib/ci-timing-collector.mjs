// CI Timing Collector (JOV-8933).
// Records one row per CI job attempt (queued_at / started_at / completed_at /
// conclusion, keyed on run_id + run_attempt + job_id) plus merge-queue
// enter / start / end / merge timestamps and queue depth, so gaps between
// check completion and the next event are queryable.
//
// Storage: append-only NDJSON, one file per (run_id, run_attempt) under
// data/YYYY-MM-DD/ on the `ci-timing-data` branch. Rows are joinable on
// (pr_number, head_sha, run_id, run_attempt) with the red-check collector
// (JOV-8934). This module intentionally has NO red_at / claim_at fields.
//
// All GitHub calls go through the client layer (runGh from
// packages/api-client), priority `report`, per .claude/rules/external-apis.md.
// Pure Node, zero npm dependencies. Abuse caps live in CAPS below.

import { existsSync, readFileSync } from 'node:fs';
import {
  CAPS,
  ghApi,
  pruneDeletions,
  RateLimitDeferredError,
  selectBackfillRuns,
} from './ci-timing-github.mjs';

export {
  CAPS,
  createWritePacer,
  ghApi,
  isBackfillRun,
  isCollectableRun,
  pruneDeletions,
  selectBackfillRuns,
  WRITE_SPACING_MS,
} from './ci-timing-github.mjs';

import { parseTurboCacheLog } from './turbo-cache-stats.mjs';

export const SCHEMA_VERSION = 1;

/** Workflows whose jobs run turbo; only their logs are read for turbo_cache rows. */
const TURBO_WORKFLOWS = new Set(['CI', 'Source Validation']);
/** Job names that run a turbo task (matrix suffixes allowed). */
const TURBO_JOB_RE =
  /^(Source Validation|Exact-head Coverage|Unit Tests|Build \+ Layout|Visual Snapshot Compare|ci-fast)/;

const QUEUE_BRANCH_RE = /(?:^|\/)pr-(\d+)-/;

/**
 * @param {string | undefined} headBranch
 * @returns {number | null}
 */
export function parseQueuePrNumber(headBranch) {
  if (!headBranch) return null;
  const match = QUEUE_BRANCH_RE.exec(headBranch);
  return match ? Number(match[1]) : null;
}

/**
 * Merge-queue depth = entries waiting + entries currently validating.
 * @param {number} queued
 * @param {number} inProgress
 */
export function computeQueueDepth(queued, inProgress) {
  return queued + inProgress;
}

/** @param {string} isoTs */
function ms(isoTs) {
  const t = Date.parse(isoTs);
  return Number.isNaN(t) ? null : t;
}

/**
 * Re-runs can report job started_at earlier than the run's created_at (the
 * attempt restarts before GitHub refreshes the run row). Handle explicitly:
 * keep the raw timestamp verbatim, flag the anomaly, and expose a normalized
 * start = max(job.started_at, run.created_at) for gap math.
 * @param {{ created_at: string, run_started_at?: string | null, updated_at?: string | null }} run
 * @param {{ started_at?: string | null, queued_at?: string | null }} job
 */
function normalizeStart(run, job) {
  const runStart = ms(run.created_at);
  const jobStart = job.started_at ? ms(job.started_at) : null;
  const queueStart = run.run_started_at || run.created_at;
  const queuedAt = job.queued_at ? ms(job.queued_at) : ms(queueStart);
  const anomalous =
    jobStart !== null && runStart !== null && jobStart < runStart;
  return {
    queuedAt: job.queued_at ?? (queuedAt === null ? null : queueStart),
    startedAt: job.started_at ?? null,
    startedAtNormalized: anomalous
      ? run.created_at
      : (job.started_at ?? run.created_at),
    anomalousEarlierStart: anomalous,
  };
}

/**
 * Seconds from job created_at (queued for a runner) to started_at.
 * @param {{ created_at?: string | null, started_at?: string | null }} job
 */
export function queueWaitSeconds(job) {
  const created = job.created_at ? ms(job.created_at) : null;
  const started = job.started_at ? ms(job.started_at) : null;
  if (created === null || started === null) return null;
  return Math.max(0, (started - created) / 1000);
}

const SELF_HOSTED_LABELS = new Set(['self-hosted', 'jovie-fixed']);

/**
 * Runner pool a job asked for: 'self-hosted' (gem jovie-fixed pool) or
 * 'hosted' (GitHub-hosted). Same rule as throughput_sentinel.runner_pool.
 * @param {string[] | undefined} labels
 */
export function runnerPool(labels) {
  return (labels ?? []).some(label =>
    SELF_HOSTED_LABELS.has(String(label).toLowerCase())
  )
    ? 'self-hosted'
    : 'hosted';
}

/**
 * Queue-wait p50/p95 (seconds) per runner pool over job_attempt rows.
 * @param {Array<{ row_type?: string, runner_pool?: string, queue_wait_s?: number | null }>} rows
 */
export function poolQueueWait(rows) {
  /** @type {Record<string, number[]>} */
  const byPool = {};
  for (const row of rows) {
    if (row.row_type !== 'job_attempt' || typeof row.queue_wait_s !== 'number')
      continue;
    (byPool[row.runner_pool ?? 'hosted'] ??= []).push(row.queue_wait_s);
  }
  return Object.fromEntries(
    Object.entries(byPool).map(([pool, waits]) => {
      const sorted = [...waits].sort((a, b) => a - b);
      const at = p =>
        sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
      return [pool, { n: sorted.length, p50S: at(0.5), p95S: at(0.95) }];
    })
  );
}

/**
 * @param {{ run: any, job: any, collectedAt: string, prNumber?: number | null }} args
 */
export function jobAttemptRow({ run, job, collectedAt, prNumber }) {
  const prFromPayload =
    run.pull_requests && run.pull_requests.length > 0
      ? run.pull_requests[0].number
      : null;
  const norm = normalizeStart(run, job);
  return {
    schema_version: SCHEMA_VERSION,
    row_type: 'job_attempt',
    pr_number:
      prNumber ?? prFromPayload ?? parseQueuePrNumber(run.head_branch) ?? null,
    head_sha: job.head_sha ?? run.head_sha,
    run_id: run.id,
    run_attempt: job.run_attempt ?? run.run_attempt,
    job_id: job.id,
    job_name: job.name,
    workflow_name: run.name,
    event: run.event,
    queued_at: norm.queuedAt,
    started_at: norm.startedAt,
    started_at_normalized: norm.startedAtNormalized,
    anomalous_earlier_start: norm.anomalousEarlierStart,
    completed_at: job.completed_at ?? null,
    conclusion: job.conclusion ?? null,
    runner_name: job.runner_name ?? null,
    runner_pool: runnerPool(job.labels),
    queue_wait_s: queueWaitSeconds(job),
    collected_at: collectedAt,
  };
}

/**
 * @param {{ run: any, mergedAt?: string | null, queueDepth: number, collectedAt: string }} args
 */
export function queueEventRow({ run, mergedAt, queueDepth, collectedAt }) {
  return {
    schema_version: SCHEMA_VERSION,
    row_type: 'queue_event',
    pr_number: parseQueuePrNumber(run.head_branch),
    head_sha: run.head_sha,
    run_id: run.id,
    run_attempt: run.run_attempt,
    workflow_name: run.name,
    event: run.event,
    queue_enter_at: run.created_at,
    queue_start_at: run.run_started_at,
    queue_end_at: run.updated_at,
    conclusion: run.conclusion,
    merged_at: mergedAt ?? null,
    queue_depth: queueDepth,
    collected_at: collectedAt,
  };
}

/**
 * One turbo_cache row per sampled job: which remote cache the job selected
 * and how many turbo tasks it replayed from cache.
 * @param {{ run: any, job: any, log: string, collectedAt: string }} args
 */
export function turboCacheRow({ run, job, log, collectedAt }) {
  const stats = parseTurboCacheLog(log);
  return {
    schema_version: SCHEMA_VERSION,
    row_type: 'turbo_cache',
    pr_number:
      (run.pull_requests && run.pull_requests.length > 0
        ? run.pull_requests[0].number
        : null) ?? parseQueuePrNumber(run.head_branch),
    head_sha: job.head_sha ?? run.head_sha,
    run_id: run.id,
    run_attempt: job.run_attempt ?? run.run_attempt,
    job_id: job.id,
    job_name: job.name,
    workflow_name: run.name,
    event: run.event,
    backend: stats.backend ?? (stats.remoteDisabled ? 'none' : null),
    role: stats.role,
    turbo_runs: stats.turboRuns,
    tasks_cached: stats.tasksCached,
    tasks_total: stats.tasksTotal,
    collected_at: collectedAt,
  };
}

/**
 * Sampled jobs whose logs are read for turbo_cache rows.
 * @param {any} run
 * @param {any[]} jobs
 */
export function turboLogJobs(run, jobs) {
  if (!TURBO_WORKFLOWS.has(run.name)) return [];
  if (Number(run.id) % CAPS.turboCacheSampleModulo !== 0) return [];
  return jobs
    .filter(
      job =>
        TURBO_JOB_RE.test(job.name ?? '') &&
        job.conclusion !== 'skipped' &&
        job.conclusion !== 'cancelled'
    )
    .slice(0, CAPS.maxTurboLogJobsPerRun);
}

/**
 * @param {Array<any>} rows
 */
export function toNdjson(rows) {
  return `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;
}

/**
 * Fetch a paginated collection endpoint, bounded by maxPages. Pages advance
 * until the fetched item count reaches `total_count` or a short page marks
 * the end — 101 jobs therefore fetch 2 pages, not 10.
 * @param {(path: string) => Promise<any>} fetchJson
 * @param {string} path
 * @param {number} maxPages
 */
async function pagedJson(fetchJson, path, maxPages) {
  const first = await fetchJson(path);
  const pages = [first];
  const items = [
    .../** @type {any[]} */ (
      first.jobs ?? first.workflow_runs ?? first.items ?? []
    ),
  ];
  const total =
    typeof first.total_count === 'number' ? first.total_count : items.length;
  const itemsPerPage = items.length || CAPS.jobsPerPage;
  for (let page = 2; page <= maxPages && items.length < total; page += 1) {
    const sep = path.includes('?') ? '&' : '?';
    const next = await fetchJson(`${path}${sep}page=${page}`);
    const nextItems = /** @type {any[]} */ (
      next.jobs ?? next.workflow_runs ?? next.items ?? []
    );
    pages.push(next);
    items.push(...nextItems);
    // A short page is the last one even when total_count disagrees.
    if (nextItems.length < itemsPerPage) break;
  }
  return { items, pagesFetched: pages.length, total };
}

/**
 * Collect all rows for one workflow run: one job_attempt row per job attempt,
 * (merge_group only) one queue_event row with queue depth and merge time, and
 * (sampled runs, when fetchText is given) one turbo_cache row per turbo job.
 * @param {{ run: any, fetchJson: (path: string) => Promise<any>, fetchText?: (path: string) => Promise<string>, collectedAt: string }} args
 */
export async function collectRunRows({
  run,
  fetchJson,
  fetchText,
  collectedAt,
}) {
  // The attempt-scoped jobs endpoint is the only race-free way to read a
  // rerun's jobs: the general /runs/{id}/jobs URL serves the latest attempt
  // and can mix two attempts' jobs when a rerun starts mid-collection.
  const attempt = Number(run.run_attempt) || 1;
  const jobsPath = `/repos/{owner}/{repo}/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=${CAPS.jobsPerPage}`;
  const {
    items: jobs,
    pagesFetched,
    total,
  } = await pagedJson(fetchJson, jobsPath, CAPS.maxJobPages);

  let truncated = pagesFetched >= CAPS.maxJobPages && jobs.length < total;
  /** @type {any[]} */
  let rows = jobs
    .slice(0, CAPS.maxRowsPerRunEvent)
    .map(job => jobAttemptRow({ run, job, collectedAt }));
  if (jobs.length > CAPS.maxRowsPerRunEvent) truncated = true;

  if (run.event === 'merge_group') {
    const depth = await collectQueueDepth(fetchJson);
    const mergedAt =
      run.conclusion === 'success'
        ? await collectMergedAt(fetchJson, run)
        : null;
    rows = rows.concat([
      queueEventRow({ run, mergedAt, queueDepth: depth, collectedAt }),
    ]);
  }

  if (fetchText) {
    for (const job of turboLogJobs(run, jobs)) {
      let log = '';
      try {
        log = await fetchText(
          `/repos/{owner}/{repo}/actions/jobs/${job.id}/logs`
        );
      } catch (error) {
        // A missing or expired log is a gap in the sample, not a failure.
        if (error instanceof RateLimitDeferredError) throw error;
        continue;
      }
      rows.push(turboCacheRow({ run, job, log, collectedAt }));
    }
  }

  return {
    rows,
    truncated,
    jobPagesFetched: pagesFetched,
    jobsFetched: jobs.length,
  };
}

/**
 * @param {(path: string) => Promise<any>} fetchJson
 */
async function collectQueueDepth(fetchJson) {
  const queries = ['status=queued', 'status=in_progress'].map(
    status =>
      `/repos/{owner}/{repo}/actions/runs?event=merge_group&${status}&per_page=${CAPS.jobsPerPage}`
  );
  let depth = 0;
  for (const path of queries) {
    const { total } = await pagedJson(fetchJson, path, CAPS.maxQueueRunsPages);
    depth = computeQueueDepth(depth, total);
  }
  return depth;
}

/**
 * @param {(path: string) => Promise<any>} fetchJson
 * @param {{ head_branch?: string, pull_requests?: Array<{ number: number }> }} run
 */
async function collectMergedAt(fetchJson, run) {
  const prNumber =
    (run.pull_requests && run.pull_requests.length > 0
      ? run.pull_requests[0].number
      : null) ?? parseQueuePrNumber(run.head_branch);
  if (!prNumber) return null;
  const pr = await fetchJson(`/repos/{owner}/{repo}/pulls/${prNumber}`);
  return pr.merged && pr.merged_at ? pr.merged_at : null;
}

// ---------------------------------------------------------------------------
// CLI (thin): --write-data / --prune. Runs inside GitHub Actions with
// GITHUB_TOKEN. All calls go through packages/api-client runGh (the gh binary
// is used only by the client layer; this module never spawns it directly).
// ---------------------------------------------------------------------------

function repoCoords() {
  const slug = process.env.GITHUB_REPOSITORY;
  if (!slug || !slug.includes('/'))
    throw new Error('GITHUB_REPOSITORY is required');
  const [owner, repo] = slug.split('/');
  return { owner, repo };
}

/**
 * One no-parent-change data-branch commit via the git-data REST API.
 * Creates the branch (from an empty tree) when it does not exist yet.
 * @param {{ owner: string, repo: string }} coords
 * @param {Array<{ path: string, content: string }>} files
 */
async function commitDataFiles(coords, files) {
  const branch = CAPS.dataBranch;

  let parentCommit = null;
  try {
    const ref = await ghApi(
      coords,
      'GET',
      `/repos/{owner}/{repo}/git/ref/heads/${branch}`
    );
    parentCommit = await ghApi(
      coords,
      'GET',
      `/repos/{owner}/{repo}/git/commits/${ref.object.sha}`
    );
  } catch (error) {
    if (!String(error).includes('404')) throw error;
  }

  const treeEntries = [];
  for (const file of files) {
    const blob = await ghApi(
      coords,
      'POST',
      `/repos/{owner}/{repo}/git/blobs`,
      {
        content: file.content,
        encoding: 'utf-8',
      }
    );
    treeEntries.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  const tree = await ghApi(coords, 'POST', `/repos/{owner}/{repo}/git/trees`, {
    base_tree: parentCommit ? parentCommit.tree.sha : undefined,
    tree: treeEntries,
  });

  const commit = await ghApi(
    coords,
    'POST',
    `/repos/{owner}/{repo}/git/commits`,
    {
      message: `ci-timing: collect ${files.length} run file(s)`,
      tree: tree.sha,
      parents: parentCommit ? [parentCommit.sha] : [],
    }
  );

  if (parentCommit) {
    await ghApi(
      coords,
      'PATCH',
      `/repos/{owner}/{repo}/git/refs/heads/${branch}`,
      {
        sha: commit.sha,
      }
    );
  } else {
    await ghApi(coords, 'POST', `/repos/{owner}/{repo}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: commit.sha,
    });
  }
  return commit.sha;
}

function eventPayload() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  return eventPath && existsSync(eventPath)
    ? JSON.parse(readFileSync(eventPath, 'utf8'))
    : {};
}

async function modeWriteData() {
  const coords = repoCoords();
  const triggerRun = eventPayload().workflow_run;

  // Overlap backfill (best-effort): the collector's concurrency group is
  // latest-wins, so a burst can cancel an older pending collection. Re-scan
  // recently completed runs of the measured workflows (CI + Source
  // Validation, filtered BEFORE the cap); per-run files make re-collection
  // an idempotent overwrite. This does not recover every dropped pending
  // run — see selectBackfillRuns.
  const windowStartMs = Date.now() - CAPS.backfillWindowMinutes * 60_000;
  const listedRuns = [];
  const backfillListPages = 3;
  for (let page = 1; page <= backfillListPages; page += 1) {
    const list = await ghApi(
      coords,
      'GET',
      `/repos/{owner}/{repo}/actions/runs?status=completed&per_page=${CAPS.jobsPerPage}&page=${page}`
    );
    const batch = /** @type {any[]} */ (list?.workflow_runs ?? []);
    listedRuns.push(...batch);
    if (batch.length < CAPS.jobsPerPage) break;
  }
  const runsById = new Map(
    selectBackfillRuns({ triggerRun, listedRuns, windowStartMs }).map(run => [
      `${run.id}:${run.run_attempt}`,
      run,
    ])
  );

  const files = /** @type {Array<{ path: string, content: string }>} */ ([]);
  let truncatedRuns = 0;
  for (const run of runsById.values()) {
    const { rows, truncated } = await collectRunRows({
      run,
      fetchJson: path => ghApi(coords, 'GET', path),
      fetchText: path => ghApi(coords, 'GET', path, undefined, { raw: true }),
      collectedAt: new Date().toISOString(),
    });
    if (rows.length === 0) continue;
    if (truncated) truncatedRuns += 1;
    const day =
      (run.updated_at || run.created_at || '').slice(0, 10) || 'unknown-date';
    files.push({
      path: `${CAPS.dataDir}/${day}/run-${run.id}-a${run.run_attempt}.ndjson`,
      content: toNdjson(rows),
    });
  }

  if (files.length === 0) {
    console.log('ci-timing-collector: nothing to collect');
    return;
  }
  const sha = await commitDataFiles(coords, files);
  console.log(
    `ci-timing-collector: wrote ${files.length} file(s), ${truncatedRuns} truncated run(s), head ${sha}`
  );
}

async function modePrune() {
  const coords = repoCoords();
  const branch = CAPS.dataBranch;
  let head;
  try {
    const ref = await ghApi(
      coords,
      'GET',
      `/repos/{owner}/{repo}/git/ref/heads/${branch}`
    );
    head = await ghApi(
      coords,
      'GET',
      `/repos/{owner}/{repo}/git/commits/${ref.object.sha}`
    );
  } catch (error) {
    if (String(error).includes('404')) {
      console.log('ci-timing-collector: no data branch yet, nothing to prune');
      return;
    }
    throw error;
  }

  const tree = await ghApi(
    coords,
    'GET',
    `/repos/{owner}/{repo}/git/trees/${head.tree.sha}?recursive=1`
  );
  const cutoff = Date.now() - CAPS.retentionDays * 24 * 60 * 60_000;
  const stale = pruneDeletions(tree, { cutoffMs: cutoff });
  if (stale === null) {
    console.log(
      'ci-timing-collector: tree listing truncated, skipping prune (fail-safe)'
    );
    return;
  }
  if (stale.length === 0) {
    console.log('ci-timing-collector: prune found nothing past retention');
    return;
  }

  // Explicit null-SHA deletions on top of the head tree: base_tree carries
  // every surviving path forward, and a sha: null entry REMOVES the path.
  // (Overlaying kept entries onto base_tree was a no-op — the stale blobs
  // stayed.) Deletions are constrained to data/YYYY-MM-DD/ in pruneDeletions.
  const newTree = await ghApi(
    coords,
    'POST',
    `/repos/{owner}/{repo}/git/trees`,
    {
      base_tree: head.tree.sha,
      tree: stale,
    }
  );
  const commit = await ghApi(
    coords,
    'POST',
    `/repos/{owner}/{repo}/git/commits`,
    {
      message: `ci-timing: prune ${stale.length} file(s) older than ${CAPS.retentionDays}d`,
      tree: newTree.sha,
      parents: [head.sha],
    }
  );
  await ghApi(
    coords,
    'PATCH',
    `/repos/{owner}/{repo}/git/refs/heads/${branch}`,
    {
      sha: commit.sha,
    }
  );
  console.log(`ci-timing-collector: pruned ${stale.length} file(s)`);
}

/** @param {string[]} argv */
export async function main(argv) {
  if (argv[0] === '--prune') return modePrune();
  if (argv[0] === '--write-data') return modeWriteData();
  throw new Error(
    `usage: node scripts/lib/ci-timing-collector.mjs --write-data|--prune (got ${JSON.stringify(argv)})`
  );
}

if (process.argv[1] && process.argv[1].endsWith('ci-timing-collector.mjs')) {
  main(process.argv.slice(2)).catch(error => {
    if (error instanceof RateLimitDeferredError) {
      console.log(
        '::warning::ci-timing-collector deferred on GitHub rate limit; not a verdict. The next collected event re-runs the overlap window.'
      );
      return;
    }
    console.error(error);
    process.exitCode = 1;
  });
}
