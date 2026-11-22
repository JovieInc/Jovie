// Outcome sweep (Tim 2026-11-22: "nothing should be able to fail without a
// repair or a sucess"). Busy unattended workflows would cost thousands of extra
// runner jobs a week if each ran its own report-outcome job, so the liveness
// check reads the newest completed main runs once per bucket (at most
// SWEEP_PAGES GitHub calls) and turns each swept workflow's newest verdict into
// the same remediation issue the action files: red opens or updates it, the
// first green after a red resolves it. A steady red refiles at most every
// REFILE_MS so the shared Linear budget is not spent on repeats.
// api-budget: github-actions-token 15/hr - automation-liveness bucket every 20 minutes: 3-5 completed-run list pages on main
import { GITHUB_API } from '../../packages/api-client/github.ts';
import { readGithubJson } from './github-json-read.mjs';
import { outcomeFingerprint, readSweptList } from './outcome-coverage.mjs';
import { noteRecurrence } from './remediation-recurrence.mjs';
import { applyRemediationDecisionWithRetry } from './remediation-signal.mjs';

export const SWEEP_PAGES = 5;
// Liveness runs every 20 minutes; reading 30 minutes back means no run falls
// between two buckets.
export const SWEEP_WINDOW_MS = 30 * 60 * 1000;
export const REFILE_MS = 6 * 60 * 60 * 1000;
export const SWEEP_STATE_KEY = 'outcome-sweep';
const VERDICTS = new Map([
  ['success', 'green'],
  ['failure', 'red'],
  ['timed_out', 'red'],
  ['startup_failure', 'red'],
]);

/** `.github/workflows/x.yml@refs/heads/main` -> `x.yml` */
export function workflowFile(path) {
  const clean = String(path ?? '').split('@')[0];
  return clean.slice(clean.lastIndexOf('/') + 1);
}

/**
 * Newest verdict per swept workflow among runs on main. Skipped, cancelled and
 * PR-context runs carry no verdict.
 * @param {any[]} runs
 * @param {string[]} swept
 */
export function latestVerdicts(runs, swept) {
  const wanted = new Set(swept);
  /** @type {Map<string, {verdict: string, run: any}>} */
  const out = new Map();
  const sorted = [...(runs ?? [])].sort((a, b) =>
    String(b?.created_at ?? '').localeCompare(String(a?.created_at ?? ''))
  );
  for (const run of sorted) {
    const file = workflowFile(run?.path);
    if (!wanted.has(file) || out.has(file)) continue;
    if (run?.head_branch !== 'main') continue;
    if (/^pull_request|^merge_group$/.test(String(run?.event ?? ''))) continue;
    const verdict = VERDICTS.get(run?.conclusion);
    if (verdict) out.set(file, { verdict, run });
  }
  return out;
}

/**
 * @param {{verdicts: Map<string, {verdict: string, run: any}>, state?: Record<string, any> | null, nowMs: number}} input
 * state null means the stored state was lost: each verdict then acts as if
 * the previous state were red, so a green resolves any issue left open.
 */
export function planSweep({ verdicts, state, nowMs }) {
  const lost = state === null || state === undefined;
  const next = { ...(state ?? {}) };
  const decisions = [];
  for (const [file, { verdict, run }] of verdicts) {
    const prev = lost ? { state: 'red', at: 0 } : next[file];
    const record = { state: verdict, at: nowMs, runId: run.id };
    if (prev?.runId === run.id) continue;
    if (verdict === 'red') {
      const stale = !prev?.at || nowMs - prev.at >= REFILE_MS;
      if (prev?.state !== 'red' || stale) {
        decisions.push({ file, action: 'red', run });
        next[file] = record;
      } else next[file] = { ...prev, runId: run.id };
    } else {
      if (prev?.state === 'red') decisions.push({ file, action: 'green', run });
      next[file] = record;
    }
  }
  return { decisions, next };
}

/** Newest completed main runs across the repo, newest first. */
export async function readMainRuns({
  repo,
  token,
  fetchImpl = fetch,
  pages = SWEEP_PAGES,
  apiUrl = GITHUB_API,
  nowMs = Date.now(),
}) {
  const runs = [];
  for (let page = 1; page <= pages; page += 1) {
    const read = await readGithubJson(
      `${apiUrl}/repos/${repo}/actions/runs?branch=main&status=completed&per_page=100&page=${page}`,
      { fetchImpl, token, apiUrl, nowMs }
    );
    if (!read.ok) return { ok: runs.length > 0, runs, reason: read.reason };
    const rows = read.body?.workflow_runs;
    if (!Array.isArray(rows)) return { ok: false, runs, reason: 'unreadable' };
    runs.push(...rows);
    const oldest = Date.parse(rows.at(-1)?.created_at ?? '');
    if (rows.length < 100 || oldest < nowMs - SWEEP_WINDOW_MS) break;
  }
  return { ok: true, runs };
}

/**
 * File and resolve. A failed filing keeps the previous record so the next
 * bucket retries.
 * @param {{decisions: any[], next: Record<string, any>, previous?: Record<string, any> | null, apiKey?: string, fetchImpl?: typeof fetch, log?: (line: string) => void}} input
 */
export async function applySweep({
  decisions,
  next,
  previous,
  apiKey,
  fetchImpl,
  log = () => {},
}) {
  const state = { ...next };
  for (const { file, action, run } of decisions) {
    const fingerprint = outcomeFingerprint(file);
    const result = await applyRemediationDecisionWithRetry(
      { action },
      {
        fingerprint,
        source: file,
        runUrl: run.html_url,
        detail: `Newest main run ${run.conclusion} (${run.event}, ${String(run.head_sha ?? '').slice(0, 8)}).`,
        apiKey,
        fetchImpl,
      }
    );
    const recurrence =
      action === 'red' && result.ok
        ? await noteRecurrence(result, {
            fingerprint,
            runUrl: run.html_url,
            apiKey,
            fetchImpl,
          })
        : { ok: true, action: 'none' };
    log(
      JSON.stringify({
        sweep: file,
        action,
        ok: result.ok,
        reason: 'reason' in result ? result.reason : null,
        ...(recurrence.action === 'none' ? {} : { recurrence }),
      })
    );
    if (!result.ok) {
      if (previous?.[file]) state[file] = previous[file];
      else delete state[file];
    }
  }
  return state;
}

/**
 * One bucket of the sweep. Returns the state to persist; an unreadable run
 * list keeps the previous state so nothing flips on a blind read.
 * @param {{root: string, previous?: Record<string, any> | null, env: Record<string, string | undefined>, fetchImpl?: typeof fetch, log?: (line: string) => void, nowMs?: number}} input
 */
export async function sweepOutcomes({
  root,
  previous,
  env,
  fetchImpl = fetch,
  log = () => {},
  nowMs = Date.now(),
}) {
  const swept = readSweptList(root);
  if (!swept.length || !env.GITHUB_REPOSITORY) return previous ?? undefined;
  const read = await readMainRuns({
    repo: env.GITHUB_REPOSITORY,
    token: env.GH_TOKEN ?? env.GITHUB_TOKEN ?? '',
    fetchImpl,
    nowMs,
  });
  if (!read.ok) {
    log(JSON.stringify({ sweep: 'runs', ok: false, reason: read.reason }));
    return previous ?? undefined;
  }
  const { decisions, next } = planSweep({
    verdicts: latestVerdicts(read.runs, swept),
    state: previous,
    nowMs,
  });
  return applySweep({
    decisions,
    next,
    previous,
    apiKey: env.LINEAR_API_KEY,
    fetchImpl,
    log,
  });
}
