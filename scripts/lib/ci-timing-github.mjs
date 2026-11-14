/** GitHub transport and data-branch policies for the CI timing collector. */
// api-budget: github-actions-token 0/hr - no scheduled caller; activation and its event-rate budget remain owned by JOV-8933.

/** @type {{ maxJobPages: number, jobsPerPage: number, maxQueueRunsPages: number, maxRowsPerRunEvent: number, maxBackfillRuns: number, backfillWindowMinutes: number, retentionDays: number, maxPruneDeletes: number, turboCacheSampleModulo: number, maxTurboLogJobsPerRun: number, dataBranch: string, dataDir: string }} */
export const CAPS = {
  maxJobPages: 10,
  jobsPerPage: 100,
  maxQueueRunsPages: 1,
  maxRowsPerRunEvent: 1500,
  maxBackfillRuns: 20,
  backfillWindowMinutes: 15,
  retentionDays: 30,
  maxPruneDeletes: 5000,
  // Turbo remote-cache hit rate (turbo_cache rows) comes from job logs, one
  // REST call per log. Sample 1 in N runs of the turbo-bearing workflows and
  // read at most M jobs per sampled run so the collector's budget stays flat.
  turboCacheSampleModulo: 4,
  maxTurboLogJobsPerRun: 6,
  dataBranch: 'ci-timing-data',
  dataDir: 'data',
};

/** Backfill scope: the PR-gate workflows the timing layer measures. */
const BACKFILL_WORKFLOW_PATHS = new Set([
  '.github/workflows/ci.yml',
  '.github/workflows/source-validation.yml',
]);
const BACKFILL_WORKFLOW_NAMES = new Set(['CI', 'Source Validation']);
const DATA_DAY_RE = new RegExp(`^${CAPS.dataDir}/(\\d{4}-\\d{2}-\\d{2})/`);

/**
 * Backfill scope check: collectable AND one of the measured workflows.
 * Applied BEFORE the 20-run cap so unrelated scheduled runs cannot evict
 * CI/Source Validation runs from the overlap window.
 * @param {any} run
 */
export function isBackfillRun(run) {
  return (
    isCollectableRun(run) &&
    (BACKFILL_WORKFLOW_PATHS.has(run.path) ||
      BACKFILL_WORKFLOW_NAMES.has(run.name))
  );
}

/**
 * Overlap-window run selection (best-effort backfill): the triggering run is
 * reserved first, keyed by (run_id, run_attempt) so a rerun listing alongside
 * it cannot displace it; the rest are the measured-workflow runs completed or
 * updated inside the window, most recently finished first. A long-running job
 * created before the window but finished inside it is eligible via updated_at.
 * This does NOT recover every dropped pending run — runs outside the listed
 * pages or outside the measured workflows are simply not re-collected; per-run
 * idempotent overwrite makes the next event heal the gap.
 * @param {{ triggerRun: any, listedRuns: any[], windowStartMs: number, maxRuns?: number }} args
 */
export function selectBackfillRuns({
  triggerRun,
  listedRuns,
  windowStartMs,
  maxRuns = CAPS.maxBackfillRuns,
}) {
  const finishedAt = run => {
    const t = ms(run?.updated_at ?? run?.created_at);
    return t === null ? -Infinity : t;
  };
  const selected = new Map();
  if (isBackfillRun(triggerRun))
    selected.set(`${triggerRun.id}:${triggerRun.run_attempt}`, triggerRun);
  const candidates = (listedRuns ?? [])
    .filter(run => isBackfillRun(run) && finishedAt(run) >= windowStartMs)
    .sort((a, b) => finishedAt(b) - finishedAt(a));
  for (const run of candidates) {
    if (selected.size >= maxRuns) break;
    selected.set(`${run.id}:${run.run_attempt}`, run);
  }
  return [...selected.values()];
}

/**
 * Retention plan for the data branch: explicit null-SHA deletion entries for
 * blob paths under data/YYYY-MM-DD/ older than the cutoff. Deleting via
 * kept-entry overlays (base_tree + re-listing survivors) left stale blobs in
 * the tree — only a null sha removes a path. Returns null when the recursive
 * tree listing was truncated (fail-safe: never prune from a partial listing).
 * @param {any} tree
 * @param {{ cutoffMs: number, maxDeletes?: number }} limits
 */
export function pruneDeletions(
  tree,
  { cutoffMs, maxDeletes = CAPS.maxPruneDeletes }
) {
  if (!tree || tree.truncated) return null;
  return (tree.tree ?? [])
    .filter(entry => entry?.type === 'blob' && DATA_DAY_RE.test(entry.path))
    .filter(entry => {
      const day = DATA_DAY_RE.exec(entry.path)?.[1];
      const t = ms(`${day}T00:00:00Z`);
      return t !== null && t < cutoffMs;
    })
    .slice(0, maxDeletes)
    .map(entry => ({ path: entry.path, sha: null }));
}

/** Events worth a row; everything else (schedule, workflow_dispatch, repository) is noise. */
const COLLECTED_EVENTS = new Set(['pull_request', 'merge_group', 'push']);

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

// The github provider paces writes to one per minWriteIntervalMs (1000ms) and
// the `report` priority runs in the background class with a zero wait budget
// — so a write issued inside the spacing window would be deferred and the
// collector would exit 0 without publishing. The collector waits out the
// spacing itself (bounded: at most one interval per call) while keeping the
// report priority. Priority is never raised.
export const WRITE_SPACING_MS = 1100;

/**
 * Bounded write pacing. Returns a `paceWrite()` that sleeps at most one
 * spacing interval so consecutive blob/tree/commit/ref writes land outside
 * the ledger's min-write window.
 */
export function createWritePacer({
  spacingMs = WRITE_SPACING_MS,
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  let lastWriteAt = null;
  return async function paceWrite() {
    const wait = lastWriteAt === null ? 0 : lastWriteAt + spacingMs - now();
    if (wait > 0) await sleep(wait);
    lastWriteAt = now();
  };
}

const paceWrite = createWritePacer();

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
export async function ghApi(
  coords,
  method,
  path,
  body,
  { raw = false, run = null, pacer = null } = {}
) {
  const { runGh } =
    run !== null
      ? { runGh: run }
      : await import('../../packages/api-client/gh.ts');
  const resolved = path
    .replace('{owner}', coords.owner)
    .replace('{repo}', coords.repo);
  // The endpoint is gh api's positional argument — without it every call
  // failed with a usage error (the path was resolved but never passed).
  const args = ['api', resolved];
  if (method !== 'GET') {
    args.push('-X', method);
    await (pacer ?? paceWrite)();
  }
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
    if (raw) return result.stdout ?? '';
    return result.stdout ? JSON.parse(result.stdout) : null;
  } finally {
    if (cleanup) cleanup();
  }
}

/** Raised when the client layer deferred the call on a rate limit. */
export class RateLimitDeferredError extends Error {}

function ms(isoTs) {
  const t = Date.parse(isoTs);
  return Number.isNaN(t) ? null : t;
}
