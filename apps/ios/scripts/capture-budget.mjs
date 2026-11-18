/**
 * Capture wall-clock budgeting for App Store graphics. Extracted from
 * app-store-graphics.mjs (size-500 is shrink-only; extract a module instead).
 *
 * The CI step that runs `capture` has a fixed timeout (15 minutes in
 * ios-app-store-graphics.yml). A cold hosted runner can spend most of that in
 * `simctl bootstatus` before the first fixture even launches, and grinding to
 * the step timeout kills the capture with zero diagnostics. This budget makes
 * the script fail fast, with a staged error naming where the time went,
 * instead of an opaque SIGKILL mid-capture.
 */

/** Wall-clock budget for the whole capture (step limit 15m minus headroom). */
export const CAPTURE_BUDGET_MS = 840_000;

/** Wall-clock cap for one screen across its bounded relaunch attempts. */
export const SCREEN_DEADLINE_MS = 300_000;

/** A screen needs at least this much remaining budget to start. */
export const MIN_SCREEN_MS = 60_000;

export const sleep = ms => new Promise(done => setTimeout(done, ms));

/** Waiting-budget multiple for one screen's settle loop. */
export const SETTLE_BUDGET = 18;

/**
 * Wall-clock deadline for one screen's settle loop (JOV-7952). The budget is
 * `settleMs * SETTLE_BUDGET` of *waiting* for the fixture to seed and go
 * still; time spent inside `simctl io screenshot` is capture latency, not
 * settling — a cold hosted runner can spend 30s+ per frame — so `shotMs` is
 * credited back. Without that credit a healthy-but-slow screen fails as
 * "never settled" purely from screenshot latency.
 */
export function settleDeadline({ settleMs, startedAt, shotMs = 0 }) {
  return startedAt + settleMs * SETTLE_BUDGET + shotMs;
}

/** Where the capture's time went, for the failure message. */
export function budgetRecap({ bootMs, installMs, captured, total, startedAt }) {
  const stages = [];
  if (bootMs !== undefined) stages.push(`boot ${(bootMs / 1000).toFixed(0)}s`);
  if (installMs !== undefined)
    stages.push(`install ${(installMs / 1000).toFixed(0)}s`);
  return `${stages.join(', ')}; ${captured}/${total} screens captured, ${(
    (Date.now() - startedAt) / 1000
  ).toFixed(0)}s elapsed`;
}

/**
 * Fail fast and visibly when the remaining budget cannot fit another screen.
 * Returns the wall-clock deadline for the screen that is about to start.
 */
export function guardScreenStart({
  startedAt,
  budgetMs,
  bootMs,
  installMs,
  captured,
  total,
}) {
  const remaining = startedAt + budgetMs - Date.now();
  if (remaining < MIN_SCREEN_MS) {
    throw new Error(
      `capture budget exhausted before the next screen: ${budgetRecap({
        bootMs,
        installMs,
        captured,
        total,
        startedAt,
      })} of a ${(budgetMs / 1000).toFixed(0)}s budget — the CI step cannot fit this runner's boot; re-run or raise the step timeout`
    );
  }
  return Math.min(Date.now() + SCREEN_DEADLINE_MS, startedAt + budgetMs);
}

/**
 * Reject when `promise` outlives `ms`, without losing its earlier rejection.
 * The abandoned promise's failure is swallowed (`.catch(() => {})` on the
 * detached branch only) so the deadline error is the one that surfaces.
 */
export function withDeadline(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(`${label}: exceeded its ${Math.round(ms / 1000)}s deadline`)
        ),
      ms
    );
  });
  promise.catch(() => {});
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
