/**
 * Bounded retry for the Backlog catch-up census read (JOV-12500).
 *
 * The catch-up census is a metadata read on the shared Linear credential.
 * When that credential is cooling down (a published RATE_LIMITED reset still
 * in the future) or the transport hits a transient failure, the census read
 * used to surface as the anonymous `backlog-catch-up-census-unavailable` row
 * with no cause at all — the bare catch discarded the error. Both observed
 * Fleet Gate Refresh reds (2026-11-12 20:19Z, 2026-11-13 19:25Z/19:26Z)
 * failed within ~60ms of process start: the enforced credential backoff
 * threw before any Linear round trip, and the receipt named nothing.
 *
 * The retry waits inside the Fleet Gate Refresh step's existing 300s budget
 * — for an active cooldown, until its published reset — and a persistent
 * miss still throws, now carrying sanitized, typed failure fields so the
 * receipt row and the job log name the precise, remediable cause. No
 * cooldown policy, budget, threshold, or admission behavior is changed here.
 */

import {
  activeLinearCooldown,
  LinearTransportError,
} from './linear-client.mjs';

export const CENSUS_MAX_RETRIES = 2;

/** Transport-level failures (timeout, network, Linear 5xx) retry on short
 * backoff; a fresh page read is as good as the failed one. */
export const TRANSIENT_RETRY_DELAYS_MS = Object.freeze([2_000, 8_000]);

/** An active shared-credential cooldown waits at most this long for its
 * published reset inside one sweep; a longer reset is left to the next
 * fleet-gate-refresh tick (which reports the reset precisely on failure). */
export const COOLDOWN_MAX_WAIT_MS = 60_000;

/** Upper bound on total added wall clock across retries, so discovery can
 * never push the bounded assess loop out of the step's 300s timeout. */
export const RETRY_TOTAL_WAIT_MS = 65_000;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Compute the wait before the next census attempt, or null when the error is
 * not retryable (auth, schema, held cohort guards) or the wait would not fit
 * the remaining budget.
 * @param {unknown} error
 * @param {{ attempt: number, nowMs: number, remainingMs: number }} budget
 * @returns {{ waitMs: number } | null}
 */
export function censusRetryDelay(error, { attempt, nowMs, remainingMs }) {
  if (attempt >= CENSUS_MAX_RETRIES) return null;
  const cooldown = activeLinearCooldown(error, nowMs);
  if (cooldown) {
    const waitMs = cooldown.resetAt + 1_000 - nowMs;
    if (waitMs <= 0) return null;
    return waitMs <= Math.min(COOLDOWN_MAX_WAIT_MS, remainingMs)
      ? { waitMs }
      : null;
  }
  const delayMs = TRANSIENT_RETRY_DELAYS_MS[attempt];
  if (
    error instanceof LinearTransportError &&
    ['TIMEOUT', 'NETWORK', 'SERVER'].includes(error.code) &&
    Number.isSafeInteger(delayMs) &&
    delayMs <= remainingMs
  )
    return { waitMs: delayMs };
  return null;
}

/**
 * Sanitized, typed fields for the census-unavailable receipt row: the row
 * keeps the private-safe message and, for a cooldown, its published reset.
 * Response bodies and nested causes are never spread into the receipt.
 * @param {unknown} error
 * @param {number} [nowMs]
 */
export function censusFailureFields(error, nowMs = Date.now()) {
  const fields = {
    error: String(/** @type {any} */ (error)?.message ?? error),
  };
  const cooldown = activeLinearCooldown(error, nowMs);
  if (cooldown)
    fields.cooldown = { resetAt: cooldown.resetAt, retryAt: cooldown.retryAt };
  return fields;
}

/**
 * The persistent-miss receipt: the sweep still fails (failed: 1) exactly as
 * before, but the row now names the sanitized cause, so the job log is
 * remediable without a code read (JOV-12500).
 * @param {unknown} error
 * @param {number} [nowMs]
 */
export function censusUnavailableReceipt(error, nowMs = Date.now()) {
  return {
    schema: 'linear-backlog-catch-up/v1',
    observedAt: new Date(nowMs).toISOString(),
    issueCount: 0,
    inventoryUnknown: true,
    assessed: 0,
    deferred: 0,
    failed: 1,
    wakeSymphony: false,
    results: [
      {
        disposition: 'assessment-failed',
        reason: 'backlog-catch-up-census-unavailable',
        owner: 'JOV-8022 Fleet admission owner',
        mutations: 0,
        wakeSymphony: false,
        ...censusFailureFields(error, nowMs),
      },
    ],
  };
}

/**
 * An active shared-credential cooldown defers the census exactly like the
 * Triage catch-up defers on the same condition (triageSweepReceiptForError):
 * a truthful deferred receipt with the published reset, failed: 0, so the
 * next fleet-gate-refresh tick retries it. This is the typed, named path —
 * not a hidden miss: every other census failure still fails visibly via
 * censusUnavailableReceipt (JOV-12500).
 * @param {{ resetAt: number, retryAt: string }} cooldown
 * @param {number} [nowMs]
 */
export function censusDeferredReceipt(cooldown, nowMs = Date.now()) {
  return {
    schema: 'linear-backlog-catch-up/v1',
    observedAt: new Date(nowMs).toISOString(),
    issueCount: 0,
    inventoryUnknown: true,
    assessed: 0,
    deferred: 0,
    failed: 0,
    wakeSymphony: false,
    census: {
      status: 'deferred',
      reason: 'RATE_LIMITED',
      resetAt: cooldown.resetAt,
      retryAt: cooldown.retryAt,
    },
    results: [
      {
        disposition: 'census-deferred',
        reason: 'backlog-catch-up-census-deferred',
        owner: 'JOV-8022 Fleet admission owner',
        mutations: 0,
        wakeSymphony: false,
        resetAt: cooldown.resetAt,
        retryAt: cooldown.retryAt,
      },
    ],
  };
}

/**
 * Classify a failed census read into its receipt: an active published
 * cooldown defers; every other persistent miss fails with its cause named.
 * @param {unknown} error
 * @param {number} [nowMs]
 */
export function censusFailureReceipt(error, nowMs = Date.now()) {
  const cooldown = activeLinearCooldown(error, nowMs);
  if (cooldown) return censusDeferredReceipt(cooldown, nowMs);
  return censusUnavailableReceipt(error, nowMs);
}

/**
 * Run the census discovery with the bounded retry above.
 * @param {(client: any, options: any) => Promise<any>} discover
 * @param {any} client
 * @param {any} options Linear read options passed through to discovery.
 * @param {{ started: number, timeBudgetMs: number, now?: () => number, sleepImpl?: (ms: number) => Promise<void> }} budget
 */
export async function discoverCensusWithRetry(
  discover,
  client,
  options,
  {
    started,
    timeBudgetMs,
    now = /** @type {() => number} */ (Date.now),
    sleepImpl = sleep,
  }
) {
  let waitedMs = 0;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await discover(client, options);
    } catch (error) {
      const nowMs = now();
      const plan = censusRetryDelay(error, {
        attempt,
        nowMs,
        remainingMs: Math.min(
          RETRY_TOTAL_WAIT_MS - waitedMs,
          timeBudgetMs - (nowMs - started)
        ),
      });
      if (plan === null) throw error;
      waitedMs += plan.waitMs;
      await sleepImpl(plan.waitMs);
    }
  }
}
