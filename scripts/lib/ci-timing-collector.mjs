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

export const SCHEMA_VERSION = 1;

/** @type {{ maxJobPages: number, jobsPerPage: number, maxQueueRunsPages: number, maxRowsPerRunEvent: number, maxBackfillRuns: number, backfillWindowMinutes: number, retentionDays: number, maxPruneDeletes: number, dataBranch: string, dataDir: string }} */
export const CAPS = {
  maxJobPages: 10,
  jobsPerPage: 100,
  maxQueueRunsPages: 1,
  maxRowsPerRunEvent: 1500,
  maxBackfillRuns: 20,
  backfillWindowMinutes: 15,
  retentionDays: 30,
  maxPruneDeletes: 5000,
  dataBranch: 'ci-timing-data',
  dataDir: 'data',
};

/** Events worth a row; everything else (schedule, workflow_dispatch, repository) is noise. */
const COLLECTED_EVENTS = new Set(['pull_request', 'merge_group', 'push']);

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
 * @param {{ created_at: string }} run
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
 * @param {Array<any>} rows
 */
export function toNdjson(rows) {
  return `${rows.map(row => JSON.stringify(row)).join('\n')}\n`;
}

/**
 * Fetch a paginated collection endpoint, bounded by maxPages.
 * @param {(path: string) => Promise<any>} fetchJson
 * @param {string} path
 * @param {number} maxPages
 */
async function pagedJson(fetchJson, path, maxPages) {
  const first = await fetchJson(path);
  const firstItems = /** @type {any[]} */ (
    first.jobs ?? first.workflow_runs ?? first.items ?? []
  );
  const total =
    typeof first.total_count === 'number'
      ? first.total_count
      : firstItems.length;
  const pages = [first];
  const itemsPerPage = firstItems.length || CAPS.jobsPerPage;
  const maxPossible = maxPages * itemsPerPage;
  for (
    let page = 2;
    page <= maxPages &&
    firstItems.length < total &&
    pages.length * itemsPerPage < maxPossible;
    page += 1
  ) {
    const sep = path.includes('?') ? '&' : '?';
    pages.push(await fetchJson(`${path}${sep}page=${page}`));
  }
  const items = pages.flatMap(p => p.jobs ?? p.workflow_runs ?? p.items ?? []);
  return { items, pagesFetched: pages.length, total };
}

/**
 * Collect all rows for one workflow run: one job_attempt row per job attempt
 * plus (merge_group only) one queue_event row with queue depth and merge time.
 * @param {{ run: any, fetchJson: (path: string) => Promise<any>, collectedAt: string }} args
 */
export async function collectRunRows({ run, fetchJson, collectedAt }) {
  const jobsPath = `/repos/{owner}/{repo}/actions/runs/${run.id}/jobs?per_page=${CAPS.jobsPerPage}&filter_run_attempt=${run.run_attempt}`;
  const {
    items: jobs,
    pagesFetched,
    total,
  } = await pagedJson(fetchJson, jobsPath, CAPS.maxJobPages);

  let truncated = pagesFetched >= CAPS.maxJobPages && jobs.length < total;
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

/**
 * Filter a workflow-run payload down to collectable shape.
 * @param {any} run
 */
export function isCollectableRun(run) {
  return Boolean(
    run &&
      run.id &&
      COLLECTED_EVENTS.has(run.event) &&
      run.status === 'completed'
  );
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
 * GitHub API through the client layer (packages/api-client runGh -> gh api).
 * `path` may contain the literal {owner}/{repo} placeholders, expanded from
 * GITHUB_REPOSITORY. Priority `report`: the collector runs on the clock and
 * must never starve merge/fix traffic.
 * @param {{ owner: string, repo: string }} coords
 * @param {string} method
 * @param {string} path
 * @param {any} [body]
 */
async function ghApi(coords, method, path, body) {
  const { runGh } = await import('../../packages/api-client/gh.ts');
  const resolved = path
    .replace('{owner}', coords.owner)
    .replace('{repo}', coords.repo);
  const args = ['api'];
  if (method !== 'GET') args.push('-X', method);
  let cleanup = null;
  if (body !== undefined) {
    const { mkdtempSync, writeFileSync: wf, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ci-timing-'));
    const file = join(dir, 'body.json');
    wf(file, JSON.stringify(body));
    args.push('--input', file);
    cleanup = () => rmSync(dir, { recursive: true, force: true });
  }
  try {
    const result = await runGh(args, { priority: 'report' });
    if (result.deferred) throw new RateLimitDeferredError(result.stderr);
    if (result.code !== 0) {
      throw new Error(
        `API call ${resolved} -> ${result.code}: ${result.stderr.slice(0, 300)}`
      );
    }
    return result.stdout ? JSON.parse(result.stdout) : null;
  } finally {
    if (cleanup) cleanup();
  }
}

/** Raised when the client layer deferred the call on a rate limit. */
class RateLimitDeferredError extends Error {}

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

  // Overlap backfill: the collector's concurrency group is latest-wins, so a
  // burst can cancel an older pending collection. Re-scan recently completed
  // runs; per-run files make re-collection an idempotent overwrite.
  const windowStart = new Date(
    Date.now() - CAPS.backfillWindowMinutes * 60_000
  ).toISOString();
  const recent = await ghApi(
    coords,
    'GET',
    `/repos/{owner}/{repo}/actions/runs?status=completed&created=>=${encodeURIComponent(windowStart)}&per_page=${CAPS.jobsPerPage}`
  );
  const runsById = new Map(
    /** @type {any[]} */ (recent.workflow_runs ?? [])
      .filter(run => isCollectableRun(run))
      .slice(0, CAPS.maxBackfillRuns)
      .map(run => [run.id, run])
  );
  if (isCollectableRun(triggerRun)) runsById.set(triggerRun.id, triggerRun);

  const files = /** @type {Array<{ path: string, content: string }>} */ ([]);
  let truncatedRuns = 0;
  for (const run of [...runsById.values()].slice(0, CAPS.maxBackfillRuns)) {
    const { rows, truncated } = await collectRunRows({
      run,
      fetchJson: path => ghApi(coords, 'GET', path),
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
  const blobs = /** @type {any[]} */ (tree.tree ?? []).filter(
    entry => entry.type === 'blob'
  );
  const stale = blobs
    .filter(entry => {
      const t = ms(
        `${entry.path.slice(CAPS.dataDir.length + 1, CAPS.dataDir.length + 11)}T00:00:00Z`
      );
      return t !== null && t < cutoff;
    })
    .slice(0, CAPS.maxPruneDeletes);
  if (stale.length === 0) {
    console.log('ci-timing-collector: prune found nothing past retention');
    return;
  }

  const kept = blobs
    .filter(entry => !stale.some(s => s.path === entry.path))
    .map(entry => ({
      path: entry.path,
      mode: '100644',
      type: 'blob',
      sha: entry.sha,
    }));
  const newTree = await ghApi(
    coords,
    'POST',
    `/repos/{owner}/{repo}/git/trees`,
    {
      base_tree: head.tree.sha,
      tree: kept,
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
