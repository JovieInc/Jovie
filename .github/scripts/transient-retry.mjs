// Bounded transient-retry wrapper for the marker evidence chain's gh
// child-process calls (JOV-6813: a transient gh HTTP 503 killed the Sentry
// recurrence dead-man on 2026-11-16 15:43Z with one attempt and no retry —
// run 43899436210, reason verified_production_artifact_unavailable; the two
// prior hourly runs passed). Pure logic only: the gh call itself stays in the
// grandfathered caller. After the last attempt the original error stands, so
// a real failure still fails closed — no threshold moves, nothing is skipped.
export const TRANSIENT_ATTEMPT_DELAYS_MS = [500, 1_500];

export function isTransientFailure(error) {
  return /HTTP 5\d\d|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|connection reset/i.test(
    error?.message ?? ''
  );
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Run `run`, retrying only while its failures look transient (HTTP 5xx,
 * connection-level errors); a deterministic error returns after one attempt.
 * @template T
 * @param {() => T} run
 * @param {number[]} [delaysMs] sleep before retry attempt N (attempts 2..N+1)
 * @returns {T}
 */
export function retryTransient(run, delaysMs = TRANSIENT_ATTEMPT_DELAYS_MS) {
  let lastError;
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    if (attempt > 0) sleepSync(delaysMs[attempt - 1]);
    try {
      return run();
    } catch (error) {
      lastError = error;
      // A deterministic error is an answer, not a transient failure.
      if (!isTransientFailure(error)) break;
    }
  }
  throw lastError;
}
