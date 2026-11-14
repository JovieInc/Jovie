// Bounded retry + loud failure logging for Linear actions shared by lanes.
//
// The LINEAR_API_KEY is shared across lanes and the runner network blips: a
// single 429 or transport failure used to fail a whole intake loop silently
// (run 43570012143 exited 1 after 21 actions with no error line). Retry the
// transient failure classes with a short backoff, and print every final
// failure to the job log so the receipt summary never hides the cause.

/** Retryable Linear failures: shared-key rate limits, runner transport blips
 * and Linear 5xx/429 blips. Deterministic 4xx (auth, bad query) return at
 * once — retrying them cannot succeed. */
export function isTransientLinearFailure(result) {
  if (!result || result.ok) return false;
  if (result.rateLimited === true || result.reason === 'linear_rate_limited')
    return true;
  const reason = String(result.reason ?? '');
  return reason.endsWith('_transport') || /_(429|5\d\d)$/.test(reason);
}

export const LINEAR_RETRY_DELAYS_MS = [5_000, 15_000, 30_000];

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Run one Linear action with bounded retries over transient failures.
 * `run` is a zero-arg factory so each attempt re-executes the call. Returns
 * the last result; exhausted retries keep ok:false so the caller still exits 1
 * (fail-closed — a deferral is honest, a false green is not).
 *
 * @param {() => Promise<{ok: boolean, reason?: string, rateLimited?: boolean, resetAt?: number}>} run
 * @param {{fingerprint?: string, op?: string, delays?: number[], sleep?: (ms: number) => Promise<void>, log?: (line: string) => void}} options
 */
export async function withLinearRetry(
  run,
  {
    fingerprint = 'unknown',
    op = 'linear',
    delays = LINEAR_RETRY_DELAYS_MS,
    sleep = defaultSleep,
    log = console.error,
  } = {}
) {
  let result = await run();
  for (const delay of delays) {
    if (result.ok || !isTransientLinearFailure(result)) return result;
    log(
      `Linear ${op} for ${fingerprint} failed transiently (${result.reason ?? 'unknown'}); retrying in ${Math.round(delay / 1000)}s`
    );
    await sleep(delay);
    result = await run();
  }
  return result;
}

/**
 * Print one failed Linear action to the job log. The receipt summary printed
 * to stdout only carries action counts, so without this the run exits 1 with
 * no line naming the failing fingerprint (run 43570012143).
 *
 * @param {{fingerprint: string, op: string, action?: string, reason?: string}} action
 * @param {{log?: (line: string) => void, githubActions?: boolean}} options
 */
export function logFailedLinearAction(
  action,
  {
    log = console.error,
    githubActions = process.env.GITHUB_ACTIONS === 'true',
  } = {}
) {
  const cause = action.reason ?? action.action ?? 'unknown';
  const line = `Security advisory intake: ${action.op} for ${action.fingerprint} failed (${cause})`;
  if (githubActions) log(`::error::${line}`);
  else log(line);
}
