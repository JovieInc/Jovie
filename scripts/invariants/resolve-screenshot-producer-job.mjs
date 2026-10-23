import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runGh } from '../../packages/api-client/gh.ts';
import { PRODUCER, PRODUCER_LAG_DELAYS_MS } from './screen-proof-resolver.mjs';

/** GitHub's jobs API placeholder before the real job name is visible. */
export const UNKNOWN_PRODUCER_JOB_NAME = 'unknown-job';

/**
 * Immediate read, then the same same-run lag budget certification uses.
 * A placeholder name is never a producer id.
 */
export const PRODUCER_JOB_RESOLVE_DELAYS_MS = Object.freeze([
  0,
  ...PRODUCER_LAG_DELAYS_MS,
]);

const positiveJobId = value =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/**
 * Accept only the exact Generate Screenshots job. `unknown-job` and a missing
 * row stay pending so the caller can retry. Ambiguous or invalid ids reject.
 * @param {{ jobs?: Array<{ name?: string, id?: number, conclusion?: string | null }> } | null | undefined} payload
 */
export function selectProducerJobId(payload) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs : [];
  const named = jobs.filter(job => job?.name === PRODUCER.job);
  if (named.length > 1) {
    return { status: 'rejected', reason: 'ambiguous-producer' };
  }
  if (named.length === 1) {
    if (!positiveJobId(named[0].id)) {
      return { status: 'rejected', reason: 'invalid-producer-id' };
    }
    return { status: 'resolved', id: String(named[0].id) };
  }
  if (jobs.some(job => job?.name === UNKNOWN_PRODUCER_JOB_NAME)) {
    return { status: 'pending', reason: 'unknown-job' };
  }
  return { status: 'pending', reason: 'missing-producer' };
}

export async function resolveProducerJobId({
  fetchJobs,
  delays = PRODUCER_JOB_RESOLVE_DELAYS_MS,
  sleep = async _ms => undefined,
}) {
  /** @type {ReturnType<typeof selectProducerJobId>} */
  let last = { status: 'pending', reason: 'missing-producer' };
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    last = selectProducerJobId(await fetchJobs());
    if (last.status !== 'pending') return last;
  }
  return last;
}

async function readJobsPayload() {
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const attempt = process.env.GITHUB_RUN_ATTEMPT;
  if (!repository || !runId || !attempt) {
    throw new Error('Could not resolve the current producer job ID.');
  }
  const result = await runGh(
    [
      'api',
      `repos/${repository}/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`,
    ],
    { priority: 'deploy' }
  );
  if (result.code !== 0) {
    console.error('::error::Could not resolve the current producer job ID.');
    process.exit(result.code);
  }
  return JSON.parse(result.stdout);
}

function sleepMs(ms) {
  const result = spawnSync('sleep', [String(ms / 1000)]);
  if (result.status !== 0) {
    throw new Error('Could not resolve the current producer job ID.');
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const result = await resolveProducerJobId({
    fetchJobs: async () => readJobsPayload(),
    sleep: async ms => sleepMs(ms),
  });
  if (result.status !== 'resolved') {
    const detail = result.reason === 'unknown-job' ? ' (unknown-job)' : '';
    console.error(
      `::error::Could not resolve the current producer job ID${detail}.`
    );
    process.exit(1);
  }
  process.stdout.write(`${result.id}\n`);
}
