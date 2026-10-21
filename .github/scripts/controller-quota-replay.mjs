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
 *   - only failure/timed_out conclusions on main, attempt < maxAttempts
 *   - only when a failed job's log carries a transient signature; a
 *     deterministic failure (red check, blocked gate) is never retried
 *   - only the newest run of that controller: a newer run owns the release
 *   - not when production already serves current main
 * Backoff: wait for the token's quota reset when it is low, and at least
 * baseBackoff * 2^(attempt-1); the total wait is capped below the job timeout.
 * The rerun uses `gh run rerun --failed`, so the controller's own lineage and
 * authorization gates decide again against current main.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const STAGE_EVENT_SCHEMA = 'jovie-stage-event/v1';
export const DECISION_SCHEMA = 'jovie-controller-replay/v1';
export const CONTROLLER_WORKFLOWS = Object.freeze({
  'Staging Controller': 'staging-controller.yml',
  'Production Controller': 'production-controller.yml',
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

/**
 * Pure replay decision. `runs` is the controller workflow's run listing
 * (newest first or any order); `run` is the completed run from the event.
 */
export function decideReplay({
  run,
  runs = [],
  transientKinds = [],
  liveSha = '',
  mainSha = '',
  options = DEFAULTS,
}) {
  if (!['failure', 'timed_out'].includes(run.conclusion)) {
    return {
      replay: false,
      outcome: 'abandoned',
      reason: `conclusion ${run.conclusion} is not a failure`,
    };
  }
  if (run.head_branch !== 'main') {
    return {
      replay: false,
      outcome: 'abandoned',
      reason: 'not a main-branch controller run',
    };
  }
  if (run.run_attempt >= options.maxAttempts) {
    return {
      replay: false,
      outcome: 'failed',
      reason: `attempt cap reached (${run.run_attempt}/${options.maxAttempts})`,
    };
  }
  if (transientKinds.length === 0) {
    return {
      replay: false,
      outcome: 'abandoned',
      reason:
        'no transient failure signature; deterministic failures are not retried',
    };
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
    return {
      replay: false,
      outcome: 'abandoned',
      reason: `newer controller run ${Math.min(...newer.map(r => r.id))} owns the release`,
    };
  }
  if (liveSha && mainSha && liveSha === mainSha) {
    return {
      replay: false,
      outcome: 'abandoned',
      reason: `production already serves main ${mainSha.slice(0, 10)}`,
    };
  }
  return {
    replay: true,
    outcome: 'advanced',
    reason: `transient failure (${transientKinds.join(', ')})`,
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

function failedJobLogs({ gh, repository, run, options }) {
  const jobs =
    readJson(gh, [
      `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
    ]).jobs ?? [];
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
  const workflowFile = CONTROLLER_WORKFLOWS[run.name];
  if (!workflowFile) {
    const decision = {
      replay: false,
      outcome: 'abandoned',
      reason: `unknown workflow ${run.name}`,
    };
    return { decision, events: [] };
  }
  const iso = ms => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

  // Cheap gates first (no API calls); rate_limit does not count against quota.
  const precheck = decideReplay({
    run,
    runs: [],
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
    attempt: run.run_attempt,
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

  const transientKinds = classifyFailure(
    failedJobLogs({ gh, repository, run, options })
  );
  const { runs, mainSha } = snapshot({ gh, repository, workflowFile });
  const decision = decideReplay({
    run,
    runs,
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
    gh(['run', 'rerun', String(run.id), '--failed', '--repo', repository]);
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
    `Run [${run.name} ${run.id} attempt ${run.run_attempt}](${run.html_url ?? ''}) concluded \`${run.conclusion}\`.`,
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
