import { appendFileSync } from 'node:fs';

/**
 * Linear rate-limit retry policy for scheduled monitors: a Linear API rate
 * limit is a bookkeeping delay, not a production failure. Monitors retry the
 * (fingerprint-idempotent) filing thunk with bounded backoff honoring the
 * published reset, then defer VISIBLY instead of failing the probe verdict.
 */

// Linear's published cooldown floor is 60s plus jitter and Retry-After hints
// (linear-cooldown.mjs). A bounded retry must out-wait that floor to have a
// chance; past this budget the monitor defers instead of stalling the job.
export const LINEAR_RATE_LIMIT_MAX_WAIT_MS = 90_000;
const RATE_LIMIT_FALLBACK_WAIT_MS = 30_000;

export function isLinearRateLimited(result) {
  return result?.ok === false && result?.reason === 'linear_rate_limited';
}

/**
 * Visible defer for a still-rate-limited Linear signal. Never reports the
 * monitored surface healthy and never resolves a Linear issue: the verdict is
 * `unknown` on the record, surfaced as a warning annotation plus a job-summary
 * section so the deferred state cannot hide in green.
 * @param {{ label?: string, resetAt?: number | null, issue?: { id: string, identifier?: string, url?: string, action?: string } }} [options]
 */
export function deferLinearRateLimited({ label, resetAt, issue } = {}) {
  const resetMs = Number(resetAt);
  const resetIso =
    Number.isFinite(resetMs) && resetMs > 0
      ? new Date(resetMs).toISOString()
      : 'unknown';
  const progress = issue
    ? `Linear issue ${issue.identifier ?? issue.id} was ${issue.action ?? 'recorded'}; remaining intake work is deferred`
    : 'No Linear issue was filed or resolved';
  console.warn(
    `::warning title=Linear rate limited::${label} deferred: Linear API rate limited until ${resetIso}. ${progress}; the signal is unknown, not healthy. The next scheduled run retries.`
  );
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    try {
      appendFileSync(
        summary,
        `## Linear rate limited\n\n${label} was **deferred**, not failed: Linear API rate limited until ${resetIso}. ${progress}; the signal is unknown until the next scheduled run.\n`
      );
    } catch {
      // The step summary is best-effort; the warning annotation already surfaced.
    }
  }
  return {
    ok: true,
    action: 'defer',
    reason: 'linear_rate_limited',
    resetAt: Number.isFinite(resetMs) && resetMs > 0 ? resetMs : null,
    ...(issue
      ? {
          id: issue.id,
          identifier: issue.identifier,
          url: issue.url,
          completedAction: issue.action,
        }
      : {}),
  };
}

/**
 * Retry a Linear-backed signal exactly as hard as the rate limit allows and
 * no harder. Re-runs the (fingerprint-idempotent) thunk after waiting out the
 * published cooldown when that wait is bounded; any other failure passes
 * through untouched so a real outage still fails the caller.
 */
export async function withLinearRateLimitRetry(
  run,
  {
    label = 'linear signal',
    retries = 1,
    maxWaitMs = LINEAR_RATE_LIMIT_MAX_WAIT_MS,
    fallbackWaitMs = RATE_LIMIT_FALLBACK_WAIT_MS,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = Date.now,
  } = {}
) {
  let attempt = 0;
  let issue;
  for (;;) {
    const result = await run();
    if (!isLinearRateLimited(result)) return result;
    issue = result.issue ?? issue;
    if (attempt >= retries) {
      return deferLinearRateLimited({ label, resetAt: result.resetAt, issue });
    }
    attempt += 1;
    const resetMs = Number(result.resetAt);
    const wait =
      Number.isFinite(resetMs) && resetMs > 0 ? resetMs - now() : NaN;
    if (Number.isFinite(wait) && wait > maxWaitMs) {
      // A retry inside the still-published cooldown is rejected locally
      // without reaching Linear. Defer instead of burning the wait budget.
      return deferLinearRateLimited({ label, resetAt: resetMs, issue });
    }
    await sleep(Number.isFinite(wait) && wait > 0 ? wait : fallbackWaitMs);
  }
}
