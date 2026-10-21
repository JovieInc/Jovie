#!/usr/bin/env node
/**
 * Event-driven replay for Staging/Production Controller runs that failed on a
 * transient cause (GitHub API quota, GitHub/upstream 5xx, runner loss).
 *
 * 2026-10-21 08:05-09:23Z: the GitHub App installation quota ran out. A
 * Production Controller recorded a false supersession and the successor's
 * Staging Controller failed authorize-staging on "API rate limit exceeded for
 * installation". Nothing replayed either run. The only replay path was
 * production-controller-health (daily cron), so production waited for the
 * next merge. This replays the newest failed controller run once quota
 * resets, with a bounded number of attempts, and records each decision as
 * jovie-stage-event/v1 rows (entity `release-replay`).
 *
 * Decision rules (pure, see decideReplay):
 *   - only failure/timed_out conclusions of controller attempt 1 on main
 *   - only when a failed job's log carries a transient signature; a
 *     deterministic failure (red check, blocked gate) is never retried
 *   - only for the generation at current main, and only the newest run of
 *     that controller: a newer generation owns the release
 *   - never after a Production Release job started (controller-health owns
 *     post-mutation recovery); not when production already serves main
 *   - the source CI attempt must be unchanged and below maxAttempts
 * Replay = rerun the exact source CI run, the same recovery
 * production-controller-health uses. A controller rerun cannot work: attempt
 * > 1 without marker evidence is refused at authorization by design
 * (2026-10-21 15:49Z, run 39626740948 attempt 2). The new CI attempt drives
 * fresh Staging and Production Controller attempt-1 runs through every gate.
 * Backoff: wait for the token's quota reset when it is low, and at least
 * baseBackoff * 2^(ciAttempt-1); the total wait is capped below the job timeout.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STAGE_EVENT_SCHEMA = 'jovie-stage-event/v1';
export const DECISION_SCHEMA = 'jovie-controller-replay/v1';
// Keyed by workflow path. workflow_run.name is the run's display title, and
// both controllers set run-name ("<sha> from CI <id> attempt <n>"), so the
// name never matches (2026-10-21 15:33Z: staging run 39626014366 was skipped
// as an "unknown workflow").
export const CONTROLLER_WORKFLOWS = Object.freeze({
  '.github/workflows/staging-controller.yml': 'staging-controller.yml',
  '.github/workflows/production-controller.yml': 'production-controller.yml',
});
export const DEFAULTS = Object.freeze({
  maxAttempts: 3,
  baseBackoffSeconds: 120,
  minQuotaRemaining: 100,
  resetSlackSeconds: 30,
  maxWaitSeconds: 3900,
  maxLogJobs: 5,
});

// Signatures of failures that a later attempt can clear. Keep these specific:
// a broad match would retry deterministic failures.
export const TRANSIENT_SIGNATURES = Object.freeze([
  { kind: 'quota', pattern: /API rate limit exceeded/i },
  { kind: 'quota', pattern: /secondary rate limit/i },
  { kind: 'quota', pattern: /rate limit exceeded for installation/i },
  { kind: 'quota', pattern: /HTTP 429\b/ },
  // release-lineage-gate.sh fails closed with these when a GitHub read is
  // unavailable (JOV-7674); the read itself is what quota or 5xx broke.
  { kind: 'quota', pattern: /Release (ancestry|successor lookup) is unknown/ },
  { kind: 'upstream-5xx', pattern: /\bHTTP 50[234]\b/ },
  {
    kind: 'upstream-5xx',
    pattern: /\b50[234] (Bad Gateway|Service Unavailable|Gateway Time-?out)\b/i,
  },
  { kind: 'network', pattern: /\b(ECONNRESET|ETIMEDOUT|EAI_AGAIN)\b/ },
  { kind: 'network', pattern: /Could not resolve host/i },
  {
    kind: 'runner-lost',
    pattern: /The runner has received a shutdown signal/i,
  },
  { kind: 'runner-lost', pattern: /lost communication with the server/i },
]);

/** Return the transient kinds found in the failed jobs' logs (deduped). */
export function classifyFailure(logTexts = []) {
  const kinds = new Set();
  for (const text of logTexts) {
    for (const { kind, pattern } of TRANSIENT_SIGNATURES) {
      if (pattern.test(String(text ?? ''))) kinds.add(kind);
    }
  }
  return [...kinds].sort();
}

/**
 * Seconds to wait before rerunning. Waits for the quota reset when remaining
 * is below the floor, and never less than the exponential backoff. Returns
 * null when the wait would exceed maxWaitSeconds.
 */
export function computeWaitSeconds({
  attempt,
  rateLimit,
  nowSeconds,
  options = DEFAULTS,
}) {
  const backoff = options.baseBackoffSeconds * 2 ** Math.max(0, attempt - 1);
  let quotaWait = 0;
  if (
    rateLimit &&
    Number.isFinite(rateLimit.remaining) &&
    rateLimit.remaining < options.minQuotaRemaining &&
    Number.isFinite(rateLimit.reset)
  ) {
    quotaWait = Math.max(
      0,
      rateLimit.reset - nowSeconds + options.resetSlackSeconds
    );
  }
  const wait = Math.max(backoff, quotaWait);
  return wait > options.maxWaitSeconds ? null : wait;
}

const TITLE = /([0-9a-f]{40}) from CI ([1-9][0-9]*) attempt ([1-9][0-9]*)$/;

/**
 * The generation and source CI attempt from a controller run title:
 * "<sha> from CI <id> attempt <n>" (staging) or "Production Controller <same>".
 */
export function parseControllerTitle(title) {
  const match = TITLE.exec(String(title ?? ''));
  if (!match) return null;
  return {
    sha: match[1],
    ciRunId: Number(match[2]),
    ciAttempt: Number(match[3]),
  };
}

const abandon = reason => ({ replay: false, outcome: 'abandoned', reason });

/**
 * Pure replay decision. `run` is the completed controller run from the event,
 * `runs` that controller's run listing, `source` its parsed title, `ciRun` the
 * live source CI run, `mutationStarted` whether a Production Release job ran.
 */
export function decideReplay({
  run,
  runs = [],
  source = null,
  ciRun = null,
  mutationStarted = false,
  transientKinds = [],
  liveSha = '',
  mainSha = '',
  options = DEFAULTS,
}) {
  if (!['failure', 'timed_out'].includes(run.conclusion)) {
    return abandon(`conclusion ${run.conclusion} is not a failure`);
  }
  if (run.head_branch !== 'main') {
    return abandon('not a main-branch controller run');
  }
  if (run.run_attempt !== 1) {
    return abandon(
      `controller attempt ${run.run_attempt} is a manual rerun; only attempt 1 is replayed`
    );
  }
  if (!source) {
    return abandon('controller title names no source CI run');
  }
  if (source.ciAttempt >= options.maxAttempts) {
    return {
      replay: false,
      outcome: 'failed',
      reason: `source CI attempt cap reached (${source.ciAttempt}/${options.maxAttempts})`,
    };
  }
  if (transientKinds.length === 0) {
    return abandon(
      'no transient failure signature; deterministic failures are not retried'
    );
  }
  if (mutationStarted) {
    return abandon(
      'a Production Release job started; production-controller-health owns post-mutation recovery'
    );
  }
  if (mainSha && source.sha !== mainSha) {
    return abandon(
      `main moved to ${mainSha.slice(0, 10)}; the newer generation owns the release`
    );
  }
  // A newer generation that ran or is running owns the release. Newer runs
  // that were skipped or cancelled (duplicate wakes) do not.
  const newer = runs.filter(
    other =>
      other.id > run.id &&
      !(
        other.status === 'completed' &&
        ['skipped', 'cancelled'].includes(other.conclusion)
      )
  );
  if (newer.length > 0) {
    return abandon(
      `newer controller run ${Math.min(...newer.map(r => r.id))} owns the release`
    );
  }
  if (liveSha && mainSha && liveSha === mainSha) {
    return abandon(`production already serves main ${mainSha.slice(0, 10)}`);
  }
  if (
    !ciRun ||
    ciRun.id !== source.ciRunId ||
    ciRun.run_attempt !== source.ciAttempt ||
    ciRun.status !== 'completed' ||
    ciRun.conclusion !== 'success' ||
    ciRun.head_sha !== source.sha ||
    ciRun.head_branch !== 'main' ||
    ciRun.event !== 'push' ||
    ciRun.path !== '.github/workflows/ci.yml'
  ) {
    return abandon(
      'source CI run changed or was already replayed; not replaying it again'
    );
  }
  return {
    replay: true,
    outcome: 'advanced',
    reason: `transient failure (${transientKinds.join(', ')}); replaying source CI ${source.ciRunId}`,
  };
}

/** jovie-stage-event/v1 rows for one replay decision. */
export function buildStageEvents({
  workflow,
  run,
  decision,
  decidedAt,
  replayedAt = null,
}) {
  const entityId = `${workflow}#${run.id}@${run.run_attempt}`;
  const sourceReceipt = run.html_url || `run:${run.id}`;
  const blocked = {
    schema: STAGE_EVENT_SCHEMA,
    entityType: 'release-replay',
    entityId,
    stage: 'blocked',
    enteredAt: run.updated_at,
    exitedAt: decidedAt,
    actor: 'controller-quota-replay',
    outcome:
      decision.replay && replayedAt
        ? 'advanced'
        : decision.replay
          ? 'failed'
          : decision.outcome,
    sourceReceipt,
  };
  if (!decision.replay || !replayedAt) return [blocked];
  return [
    blocked,
    {
      schema: STAGE_EVENT_SCHEMA,
      entityType: 'release-replay',
      entityId,
      stage: 'replayed',
      enteredAt: replayedAt,
      exitedAt: replayedAt,
      actor: 'controller-quota-replay',
      outcome: 'completed',
      sourceReceipt,
    },
  ];
}

const defaultGh = args =>
  execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export const defaultSleep = seconds =>
  new Promise(resolveSleep => setTimeout(resolveSleep, seconds * 1000));

/** Exact SHA live production serves, or '' when unreadable (never guessed). */
export async function defaultLiveSha(url, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, {
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) return '';
    const body = await response.json();
    return /^[0-9a-f]{40}$/.test(body?.commitSha ?? '') ? body.commitSha : '';
  } catch {
    return '';
  }
}

function readJson(gh, args) {
  return JSON.parse(gh(['api', ...args]));
}

function snapshot({ gh, repository, workflowFile }) {
  const runs =
    readJson(gh, [
      `repos/${repository}/actions/workflows/${workflowFile}/runs?branch=main&per_page=30`,
    ]).workflow_runs ?? [];
  const mainSha = gh([
    'api',
    `repos/${repository}/commits/main`,
    '--jq',
    '.sha',
  ]).trim();
  return { runs, mainSha };
}

function readJobs({ gh, repository, run }) {
  return (
    readJson(gh, [
      `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
    ]).jobs ?? []
  );
}

/** A reusable Production Release job ran (anything but skipped). */
export function productionMutationStarted(jobs) {
  return jobs.some(
    job =>
      String(job.name ?? '').startsWith('Production Release /') &&
      job.conclusion !== 'skipped'
  );
}

function failedJobLogs({ gh, repository, jobs, options }) {
  const failed = jobs
    .filter(job => ['failure', 'timed_out'].includes(job.conclusion))
    .slice(0, options.maxLogJobs);
  return failed.map(job => {
    try {
      return gh(['api', `repos/${repository}/actions/jobs/${job.id}/logs`]);
    } catch (error) {
      // An unreadable log counts as transient only if gh's own error says so.
      return String(error?.stderr ?? error?.message ?? '');
    }
  });
}

/**
 * Orchestrate one replay decision. Side effects are injected so the flow is
 * testable: gh(args) -> stdout, sleep(seconds), now() -> ms, liveSha().
 */
export async function runReplay({
  event,
  repository,
  gh = defaultGh,
  sleep = defaultSleep,
  now = () => Date.now(),
  liveSha = () => defaultLiveSha('https://jov.ie/api/health/build-info'),
  options = DEFAULTS,
}) {
  const run = event.workflow_run;
  const workflowFile = CONTROLLER_WORKFLOWS[run.path];
  if (!workflowFile) {
    const decision = {
      replay: false,
      outcome: 'abandoned',
      reason: `unknown workflow ${run.path}`,
    };
    return { decision, events: [] };
  }
  const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

  // Cheap gates first (no API calls); rate_limit does not count against quota.
  const source = parseControllerTitle(run.display_title ?? run.name);
  const precheck = decideReplay({
    run,
    runs: [],
    source,
    ciRun: source && {
      id: source.ciRunId,
      run_attempt: source.ciAttempt,
      status: 'completed',
      conclusion: 'success',
      head_sha: source.sha,
      head_branch: 'main',
      event: 'push',
      path: '.github/workflows/ci.yml',
    },
    transientKinds: ['pending'],
    options,
  });
  if (!precheck.replay) {
    return {
      decision: precheck,
      events: buildStageEvents({
        workflow: workflowFile,
        run,
        decision: precheck,
        decidedAt: iso(now()),
      }),
    };
  }

  const rateLimit = readJson(gh, ['rate_limit']).resources?.core ?? null;
  const wait = computeWaitSeconds({
    attempt: source.ciAttempt,
    rateLimit,
    nowSeconds: Math.floor(now() / 1000),
    options,
  });
  if (wait === null) {
    const decision = {
      replay: false,
      outcome: 'failed',
      reason: 'quota reset is beyond the wait cap',
    };
    return {
      decision,
      events: buildStageEvents({
        workflow: workflowFile,
        run,
        decision,
        decidedAt: iso(now()),
      }),
    };
  }
  if (wait > 0) await sleep(wait);

  const jobs = readJobs({ gh, repository, run });
  const transientKinds = classifyFailure(
    failedJobLogs({ gh, repository, jobs, options })
  );
  const { runs, mainSha } = snapshot({ gh, repository, workflowFile });
  const ciRun = readJson(gh, [
    `repos/${repository}/actions/runs/${source.ciRunId}`,
  ]);
  const decision = decideReplay({
    run,
    runs,
    source,
    ciRun,
    mutationStarted: productionMutationStarted(jobs),
    transientKinds,
    liveSha: await liveSha(),
    mainSha,
    options,
  });
  decision.waitedSeconds = wait;
  decision.transientKinds = transientKinds;
  const decidedAt = iso(now());
  if (!decision.replay) {
    return {
      decision,
      events: buildStageEvents({
        workflow: workflowFile,
        run,
        decision,
        decidedAt,
      }),
    };
  }
  let replayedAt = null;
  try {
    gh(['run', 'rerun', String(source.ciRunId), '--repo', repository]);
    replayedAt = iso(now());
  } catch (error) {
    decision.reason = `rerun request failed: ${String(error?.message ?? error).slice(0, 200)}`;
  }
  return {
    decision,
    events: buildStageEvents({
      workflow: workflowFile,
      run,
      decision,
      decidedAt,
      replayedAt,
    }),
  };
}

export function renderSummary({ run, decision }) {
  return [
    '### Controller replay',
    '',
    `Run [${run.path} ${run.id} attempt ${run.run_attempt}](${run.html_url ?? ''}) concluded \`${run.conclusion}\`.`,
    `Decision: **${decision.replay ? 'replayed' : 'not replayed'}** (${decision.reason}).`,
    decision.waitedSeconds
      ? `Waited ${decision.waitedSeconds}s for backoff/quota reset.`
      : '',
    '',
  ].join('\n');
}

export async function runCli({ env = process.env, deps = {} } = {}) {
  const { readFileSync } = await import('node:fs');
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const repository = env.GITHUB_REPOSITORY;
  const result = await runReplay({ event, repository, ...deps });
  const outPath =
    env.REPLAY_EVENTS_PATH || 'release-replay-receipts/stage-events.ndjson';
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    result.events.map(e => JSON.stringify(e)).join('\n') +
      (result.events.length ? '\n' : '')
  );
  writeFileSync(
    `${dirname(outPath)}/decision.json`,
    JSON.stringify(
      {
        schema: DECISION_SCHEMA,
        runId: event.workflow_run.id,
        attempt: event.workflow_run.run_attempt,
        ...result.decision,
      },
      null,
      2
    ) + '\n'
  );
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      env.GITHUB_STEP_SUMMARY,
      renderSummary({ run: event.workflow_run, decision: result.decision })
    );
  }
  console.log(
    `controller-quota-replay: ${result.decision.replay ? 'replayed' : 'skipped'} (${result.decision.reason})`
  );
  return result;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli().catch(error => {
    console.error(
      `::error::controller-quota-replay failed: ${error?.message ?? error}`
    );
    process.exitCode = 1;
  });
}
