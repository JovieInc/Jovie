#!/usr/bin/env node
// Predecessor verdict gate. A production mutation (migration or promotion) may
// proceed only when the generation currently live in production has a durable
// verdict of PASS. The verdict is the existing production-marker-state result
// for the predecessor SHA; no parallel store exists.
//
//   PASS        marker state `verified` with an exact deployment ID, or a
//               foreign `none` bootstrap (same admission as admitReleaseBase)
//   PENDING     marker state `pending`: verification is still running. Waits
//               up to the budget, then fails closed.
//   FAIL        recovery_available, manual, contradictory or any other state
//   UNREADABLE  evidence could not be read or was malformed
//
// While the controller lease still serializes releases a predecessor is never
// PENDING here, so the wait is a no-op. It becomes load-bearing when the
// verification tail leaves the lease.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { admitReleaseBase } from './production-marker-state.mjs';

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const CONTROLLER_PATH = '.github/workflows/production-controller.yml';
const KNOWN_STATES = new Set([
  'none',
  'pending',
  'recovery_available',
  'verified',
  'manual',
]);

export const EXIT = { PASS: 0, FAIL: 1, UNREADABLE: 2, PENDING_TIMEOUT: 3 };

export function decideVerdict(markerResult, { predecessorSha, releaseSha }) {
  if (
    !SHA_PATTERN.test(String(predecessorSha ?? '')) ||
    !SHA_PATTERN.test(String(releaseSha ?? ''))
  ) {
    return {
      verdict: 'UNREADABLE',
      reason: 'predecessor_or_release_sha_missing_or_malformed',
    };
  }
  if (
    !markerResult ||
    typeof markerResult !== 'object' ||
    !KNOWN_STATES.has(markerResult.state) ||
    typeof markerResult.reason !== 'string' ||
    markerResult.reason.length === 0
  ) {
    return { verdict: 'UNREADABLE', reason: 'malformed_marker_evidence' };
  }
  // A predecessor equal to the release is an exact-SHA rerun; the controller's
  // own marker classifier owns that path, so nothing is being stacked.
  if (predecessorSha === releaseSha) {
    return { verdict: 'PASS', reason: 'exact_sha_rerun' };
  }
  if (markerResult.state === 'pending') {
    return { verdict: 'PENDING', reason: markerResult.reason };
  }
  if (
    markerResult.state === 'manual' &&
    markerResult.reason === 'evidence_api_error'
  ) {
    return { verdict: 'UNREADABLE', reason: markerResult.reason };
  }
  const admission = admitReleaseBase(markerResult, predecessorSha, releaseSha);
  if (admission.ok) {
    return {
      verdict: 'PASS',
      reason: markerResult.state === 'none' ? 'foreign_bootstrap' : 'verified',
      deploymentId: markerResult.deploymentId ?? null,
    };
  }
  return {
    verdict: 'FAIL',
    reason: `${markerResult.state}:${markerResult.reason}`,
    errors: admission.errors,
  };
}

export async function waitForVerdict({
  readMarker,
  predecessorSha,
  releaseSha,
  budgetSeconds,
  intervalSeconds,
  sleep,
  now = () => Date.now(),
}) {
  const deadline = now() + budgetSeconds * 1000;
  let last;
  for (;;) {
    let marker;
    try {
      marker = readMarker();
    } catch (error) {
      marker = {
        state: 'manual',
        reason: 'evidence_api_error',
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    last = decideVerdict(marker, { predecessorSha, releaseSha });
    if (last.verdict !== 'PENDING') return last;
    if (now() + intervalSeconds * 1000 > deadline) {
      return { ...last, verdict: 'PENDING', timedOut: true };
    }
    await sleep(intervalSeconds * 1000);
  }
}

export function exitCodeFor(result) {
  if (result.verdict === 'PASS') return EXIT.PASS;
  if (result.verdict === 'PENDING') return EXIT.PENDING_TIMEOUT;
  if (result.verdict === 'UNREADABLE') return EXIT.UNREADABLE;
  return EXIT.FAIL;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    if (!key?.startsWith('--') || argv[index + 1] === undefined) {
      throw new Error(`Bad argument: ${key}`);
    }
    values[key.slice(2)] = argv[index + 1];
  }
  return values;
}

function gh(args) {
  const run = spawnSync('gh', args, { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr || 'gh failed');
  return run.stdout;
}

function resolveControllerWorkflowId(repo) {
  const workflow = JSON.parse(
    gh(['api', `repos/${repo}/actions/workflows/production-controller.yml`])
  );
  if (workflow.path !== CONTROLLER_PATH || workflow.state !== 'active') {
    throw new Error('Production Controller workflow identity is not canonical');
  }
  return String(workflow.id);
}

function readMarkerOnline({ repo, predecessorSha, workflowId }) {
  const run = spawnSync(
    process.execPath,
    [
      new URL('./production-marker-state.mjs', import.meta.url).pathname,
      '--sha',
      predecessorSha,
      '--repo',
      repo,
      '--controller-workflow-id',
      workflowId,
    ],
    { encoding: 'utf8' }
  );
  // The classifier prints one JSON object on stdout; its exit code is not the
  // verdict, so parse stdout and let decideVerdict judge the state.
  return JSON.parse(run.stdout.trim().split('\n').pop() ?? '');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = args.repo;
  const boundary = args.boundary ?? 'unspecified';
  const budget = Number(args['budget-seconds'] ?? 1800);
  const interval = Number(args['interval-seconds'] ?? 20);
  let result;
  try {
    const workflowId = resolveControllerWorkflowId(repo);
    result = await waitForVerdict({
      readMarker: () =>
        readMarkerOnline({
          repo,
          predecessorSha: args['predecessor-sha'],
          workflowId,
        }),
      predecessorSha: args['predecessor-sha'],
      releaseSha: args['release-sha'],
      budgetSeconds: budget,
      intervalSeconds: interval,
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    });
  } catch (error) {
    result = {
      verdict: 'UNREADABLE',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  const line = `predecessor-verdict ${result.verdict} boundary=${boundary} predecessor=${args['predecessor-sha']} reason=${result.reason}`;
  process.stderr.write(`${line}\n`);
  if (result.verdict !== 'PASS') {
    process.stderr.write(
      `::error::Production mutation (${boundary}) refused: predecessor verdict ${result.verdict} (${result.reason}). Fail closed; no migration or promotion ran.\n`
    );
    for (const message of result.errors ?? []) {
      process.stderr.write(`::error::${message}\n`);
    }
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `verdict=${result.verdict}\nverdict_reason=${result.reason}\n`
    );
  }
  process.exitCode = exitCodeFor(result);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
