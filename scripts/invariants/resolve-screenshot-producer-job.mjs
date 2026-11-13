import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { EX_TEMPFAIL } from '../../packages/api-client/client.ts';
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

/**
 * The producer step's retry budget for JOV-10153 quota deferrals (the shared
 * installation REST budget is spent and gh shed the read). Bounded well under
 * the 10-minute step timeout; a deferral that outlasts it still exits 75 —
 * honestly deferred, never a green verdict.
 */
export function producerJobHoldBudgetMs() {
  return positiveIntegerEnv('PRODUCER_JOB_HOLD_BUDGET_MS') ?? 8 * 60_000;
}
export const PRODUCER_JOB_QUOTA_RETRY_INTERVAL_MS = 30_000;

function positiveIntegerEnv(name) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export class ProducerJobDeferredError extends Error {
  constructor() {
    super('github quota deferred the producer job read (exit 75)');
    this.name = 'ProducerJobDeferredError';
  }
}

const positiveJobId = value =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/**
 * Accept only the exact Generate Screenshots job. `unknown-job` and a missing
 * row stay pending so the caller can retry. Ambiguous or invalid ids reject.
 * @param {{ jobs?: Array<{ name?: string, id?: number, conclusion?: string | null }> } | null | undefined} payload
 * @returns {{ status: 'resolved', id: string } | { status: 'rejected', reason: string } | { status: 'pending', reason: string }}
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
  if (result.code === EX_TEMPFAIL) {
    // JOV-10153: the shared installation budget is spent and gh shed the
    // read without a verdict. Retryable within the step's hold budget —
    // one deferral must not hard-fail the producer step and wedge the
    // deploy gate until the next push.
    throw new ProducerJobDeferredError();
  }
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

/**
 * The direct-run loop: lag-budget resolution with deferral retries inside
 * the hold budget. Returns the resolved id, or throws the honest outcome —
 * ProducerJobDeferredError when the budget is still shed at the deadline,
 * Error for a real failure. Never turns a deferral into a green verdict.
 * @param {{
 *   fetchJobs: () => Promise<{ jobs?: Array<{ name?: string, id?: number, conclusion?: string | null }> }>,
 *   holdBudgetMs?: number,
 *   intervalMs?: number,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   lagSleep?: (ms: number) => Promise<void>,
 * }} options
 * @returns {Promise<{ status: 'resolved', id: string }>}
 */
export async function resolveProducerJobIdWithHold({
  fetchJobs,
  holdBudgetMs = producerJobHoldBudgetMs(),
  intervalMs = PRODUCER_JOB_QUOTA_RETRY_INTERVAL_MS,
  now = Date.now,
  sleep = async ms => new Promise(resolve => setTimeout(resolve, ms)),
  lagSleep,
}) {
  const holdDeadline = now() + holdBudgetMs;
  for (;;) {
    try {
      const result = await resolveProducerJobId({
        fetchJobs,
        sleep: lagSleep ?? sleep,
      });
      if (result.status === 'resolved') return result;
      const { reason, status } = result;
      if (reason === 'unknown-job') {
        throw new Error(
          'Could not resolve the current producer job ID (unknown-job).'
        );
      }
      if (status === 'rejected') {
        throw new Error(
          `Could not resolve the current producer job ID (${reason}).`
        );
      }
      // pending: exhausted the lag budget without the job name appearing.
      throw new Error('Could not resolve the current producer job ID.');
    } catch (error) {
      if (!(error instanceof ProducerJobDeferredError)) throw error;
      if (now() + intervalMs >= holdDeadline) throw error;
      await sleep(intervalMs);
    }
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    const result = await resolveProducerJobIdWithHold({
      fetchJobs: async () => readJobsPayload(),
      sleep: async ms => sleepMs(ms),
    });
    process.stdout.write(`${result.id}\n`);
  } catch (error) {
    if (error instanceof ProducerJobDeferredError) {
      // Honest deferral: exit 75 keeps the quota-deferred semantics for the
      // workflow; the gate re-runs when the shared budget recovers.
      console.error(
        '::error::Could not resolve the current producer job ID (github quota still deferred within the hold budget).'
      );
      process.exit(EX_TEMPFAIL);
    }
    console.error(
      `::error::${error instanceof Error ? error.message : 'Could not resolve the current producer job ID.'}`
    );
    process.exit(1);
  }
}
