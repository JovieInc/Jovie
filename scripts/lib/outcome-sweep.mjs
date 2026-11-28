// Outcome sweep (Tim 2026-11-22: "nothing should be able to fail without a
// repair or a sucess"). Busy unattended workflows would cost thousands of extra
// runner jobs a week if each ran its own report-outcome job, so the liveness
// check reads the newest completed main runs once per bucket (at most
// SWEEP_PAGES GitHub calls) and turns each swept workflow's newest verdict into
// the same remediation issue the action files: red opens or updates it, the
// exact failed-probe recovery resolves it. A steady red refiles at most every
// REFILE_MS so the shared Linear budget is not spent on repeats.
// api-budget: github-actions-token 15/hr - every 20 minutes, at most five inventory reads; spare capacity reads exact attempt jobs for open repairs
import { GITHUB_API } from '../../packages/api-client/github.ts';
import { readGithubJson } from './github-json-read.mjs';
import { outcomeFingerprint, readSweptList } from './outcome-sweep-config.mjs';
import {
  advanceSweepProof,
  hasSeenSweepRun,
  queueSweepObservations,
  readSweepJobs,
  SWEEP_JOBS_LIMIT,
  sweepRunIdentity,
} from './outcome-sweep-proof.mjs';
import { noteRecurrence } from './remediation-recurrence.mjs';
import { applyRemediationDecisionWithRetry } from './remediation-signal.mjs';
import { workflowRedBinding } from './workflow-outcome-proof.mjs';

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

function sweepObservations(runs, swept) {
  const wanted = new Set(swept);
  /** @type {Map<string, {verdict: string, run: any}[]>} */
  const timelines = new Map(swept.map(file => [file, []]));
  const sorted = [...(runs ?? [])].sort((a, b) =>
    String(a?.created_at ?? '').localeCompare(String(b?.created_at ?? ''))
  );
  for (const run of sorted) {
    const file = workflowFile(run?.path);
    if (!wanted.has(file) || run?.head_branch !== 'main') continue;
    if (/^pull_request|^merge_group$/.test(String(run?.event ?? ''))) continue;
    const verdict = VERDICTS.get(run?.conclusion);
    if (verdict) timelines.get(file).push({ verdict, run });
  }
  return timelines;
}

/** Newest usable wrapper verdict per workflow. Success here is not recovery. */
export function latestVerdicts(runs, swept) {
  const latest = new Map();
  for (const [file, observations] of sweepObservations(runs, swept)) {
    if (observations.length) latest.set(file, observations.at(-1));
  }
  return latest;
}

/**
 * Keep normal red filing and its cooldown. Green is authorized separately by
 * exact-attempt evidence; an absent cache may hide an older open issue.
 * @param {{verdicts: Map<string, {verdict: string, run: any}>, state?: Record<string, any> | null, nowMs: number}} input
 */
export function planSweep({ verdicts, state, nowMs }) {
  const next = { ...(state ?? {}) };
  const decisions = [];
  for (const [file, { verdict, run }] of verdicts) {
    const prev = next[file];
    const alreadySeen =
      prev?.runId === run.id &&
      (prev.runAttempt ?? run.run_attempt) === run.run_attempt;
    if (alreadySeen) continue;
    if (verdict === 'red') {
      const stale = !prev?.at || nowMs - prev.at >= REFILE_MS;
      if (prev?.state !== 'red' || stale) {
        decisions.push({ file, action: 'red', run });
        next[file] = {
          ...prev,
          state: 'red',
          at: nowMs,
          runId: run.id,
          runAttempt: run.run_attempt,
        };
      }
    } else if (prev?.state !== 'red') {
      next[file] = {
        ...prev,
        state: prev?.state === 'green' ? 'green' : 'unknown',
        at: nowMs,
        runId: run.id,
        runAttempt: run.run_attempt,
      };
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
  throughMs = nowMs - SWEEP_WINDOW_MS,
}) {
  const runs = [];
  let reads = 0;
  let complete = false;
  for (let page = 1; page <= pages; page += 1) {
    reads += 1;
    const read = await readGithubJson(
      `${apiUrl}/repos/${repo}/actions/runs?branch=main&status=completed&per_page=100&page=${page}`,
      { fetchImpl, token, apiUrl, nowMs }
    );
    if (!read.ok)
      return {
        ok: runs.length > 0,
        runs,
        reason: read.reason,
        complete,
        reads,
      };
    const rows = read.body?.workflow_runs;
    if (!Array.isArray(rows))
      return { ok: false, runs, reason: 'unreadable', complete, reads };
    runs.push(...rows);
    const oldest = Date.parse(rows.at(-1)?.created_at ?? '');
    if (rows.length < 100 || oldest < throughMs) {
      complete = true;
      break;
    }
  }
  return { ok: true, runs, complete, reads };
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
  for (const { file, action, run, redBinding, recoveryProof } of decisions) {
    const fingerprint = outcomeFingerprint(file);
    const result = await applyRemediationDecisionWithRetry(
      { action },
      {
        fingerprint,
        source: file,
        runUrl: run.html_url,
        detail: `Newest main run ${run.conclusion} (${run.event}, ${String(run.head_sha ?? '').slice(0, 8)}).`,
        redBinding,
        recoveryProof,
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
    const applied = 'action' in result ? result.action : null;
    if (!result.ok || applied === 'hold') {
      if (state[file]?.since) {
        // Preserve fetched evidence and retry the original mutation. A failed
        // Linear update does not create a fresh incident or consume its proof.
        state[file] = {
          ...state[file],
          state: 'red',
          ...(action === 'red'
            ? {
                at: previous?.[file]?.at ?? 0,
                runId: previous?.[file]?.runId,
                runAttempt: previous?.[file]?.runAttempt,
                pendingSignal: run,
              }
            : {}),
        };
      } else if (previous?.[file]) state[file] = previous[file];
      else delete state[file];
    } else if (action === 'red' && state[file]?.since) {
      const hadScope =
        Boolean(previous?.[file]?.linearBinding) &&
        previous?.[file]?.state === 'red';
      const reopened = 'reopened' in result && result.reopened === true;
      const legacyRed =
        state[file].legacyRed ||
        (!hadScope && applied !== 'created' && !reopened);
      const proof = state[file].proof;
      state[file] = {
        ...state[file],
        linearBinding: redBinding,
        legacyRed,
        pendingSignal: undefined,
        ...(legacyRed && proof
          ? { proof: { ...proof, status: 'red', unknown: true } }
          : {}),
      };
    } else if (action === 'green' && applied === 'green') {
      state[file] = { ...state[file], state: 'green', recovery: undefined };
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
  // Replay back through the start of every unresolved episode before
  // authorizing recovery. A recent page alone cannot bridge an outage.
  const throughMs = Object.values(previous ?? {}).reduce((oldest, record) => {
    if (record?.state !== 'red' || record.inventoryGap) return oldest;
    const since = Date.parse(record.since ?? '');
    return Number.isFinite(since) ? Math.min(oldest, since) : oldest;
  }, nowMs - SWEEP_WINDOW_MS);
  const read = await readMainRuns({
    repo: env.GITHUB_REPOSITORY,
    token: env.GH_TOKEN ?? env.GITHUB_TOKEN ?? '',
    fetchImpl,
    nowMs,
    throughMs,
  });
  if (!read.ok) {
    log(JSON.stringify({ sweep: 'runs', ok: false, reason: read.reason }));
    return previous ?? undefined;
  }
  const timelines = sweepObservations(read.runs, swept);
  const files = [...timelines.keys()].sort(
    (a, b) =>
      (previous?.[a]?.lastProofReadAt ?? 0) -
      (previous?.[b]?.lastProofReadAt ?? 0)
  );
  const budget = {
    remaining: read.complete
      ? Math.min(SWEEP_JOBS_LIMIT, SWEEP_PAGES - read.reads)
      : 0,
  };
  const reportable = new Map();
  const next = { ...(previous ?? {}) };
  const recoveryDecisions = [];
  for (const file of files) {
    const timeline = timelines.get(file);
    const latest = timeline.at(-1);
    const old = previous?.[file];
    if (!old && !latest) continue;
    const firstRecent = timeline.find(
      ({ run }) => Date.parse(run.created_at ?? '') >= nowMs - SWEEP_WINDOW_MS
    );
    const since =
      old?.since ?? firstRecent?.run.created_at ?? latest?.run.created_at;
    const observations = timeline.filter(({ run }) => run.created_at >= since);
    const currentRed =
      old?.pendingSignal ??
      observations
        .filter(
          ({ verdict, run }) =>
            verdict === 'red' &&
            (old?.state !== 'green' || !hasSeenSweepRun(old, run))
        )
        .at(-1)?.run;
    if (currentRed) reportable.set(file, { verdict: 'red', run: currentRed });
    else if (latest) reportable.set(file, latest);
    // A partial list may omit an intervening failure or an earlier attempt of
    // the same run. Once a gap is observed, later green is insufficient.
    const inventoryGap = Boolean(
      old?.inventoryGap ||
        (!read.complete && (old?.state === 'red' || currentRed))
    );
    const queued = queueSweepObservations(
      {
        ...old,
        since,
        inventoryGap,
        legacyRed: old?.legacyRed ?? (old?.state === 'red' && !old?.since),
      },
      observations
    );
    const before = budget.remaining;
    const qualified = await advanceSweepProof({
      file,
      record: queued,
      budget,
      log,
      readJobs: (identity, event) =>
        readSweepJobs({
          file,
          repo: env.GITHUB_REPOSITORY,
          token: env.GH_TOKEN ?? env.GITHUB_TOKEN ?? '',
          identity,
          event,
          fetchImpl,
          nowMs,
        }),
    });
    next[file] = {
      ...qualified,
      ...(before !== budget.remaining ? { lastProofReadAt: nowMs } : {}),
    };
    if (
      read.complete &&
      old?.state === 'red' &&
      old.linearBinding &&
      !qualified.overflow &&
      !qualified.inventoryGap &&
      !qualified.legacyRed &&
      !qualified.pending.length &&
      qualified.proof?.status === 'green' &&
      qualified.recovery
    ) {
      recoveryDecisions.push({
        file,
        action: 'green',
        run: { html_url: qualified.recovery.url },
        redBinding: old.linearBinding,
        recoveryProof: qualified.recovery.proof,
      });
    } else if (qualified.inventoryGap) {
      log(
        JSON.stringify({
          sweep: file,
          action: 'hold',
          reason: 'run_inventory_gap',
        })
      );
    } else if ((!old && latest?.verdict === 'green') || qualified.legacyRed) {
      log(
        JSON.stringify({
          sweep: file,
          action: 'hold',
          reason: 'original_failed_probes_unknown',
        })
      );
    }
  }
  const planned = planSweep({ verdicts: reportable, state: next, nowMs });
  const red = planned.decisions.map(item => ({
    ...item,
    redBinding: workflowRedBinding(sweepRunIdentity(item.run)),
  }));
  const redFiles = new Set(red.map(item => item.file));
  return applySweep({
    decisions: [
      ...red,
      ...recoveryDecisions.filter(item => !redFiles.has(item.file)),
    ],
    next: planned.next,
    previous,
    apiKey: env.LINEAR_API_KEY,
    fetchImpl,
    log,
  });
}
