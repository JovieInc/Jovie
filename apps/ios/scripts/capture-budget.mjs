/**
 * Capture wall-clock budgeting for App Store graphics. Extracted from
 * app-store-graphics.mjs (size-500 is shrink-only; extract a module instead).
 *
 * The CI capture step is 15 minutes. `execFileSync`'s timeout only sends
 * SIGTERM, and simctl/xcrun ignore it, so the parent blocks until Actions
 * kills the step (run 44540495367). `runBounded` SIGKILLs the process group.
 * A cold `bootstatus -b` belongs on the build step: this module's
 * BOOT_STATUS_TIMEOUT_MS fits inside that step's existing 20 minutes.
 */
import { spawn } from 'node:child_process';

/** Wall-clock budget for the whole capture (step limit 15m minus headroom). */
export const CAPTURE_BUDGET_MS = 840_000;

/** Wall-clock cap for one screen across its bounded relaunch attempts. */
export const SCREEN_DEADLINE_MS = 300_000;

/** A screen needs at least this much remaining budget to start. */
export const MIN_SCREEN_MS = 60_000;

/** Cap for one `simctl launch` (a cold first launch can take minutes). */
export const LAUNCH_TIMEOUT_MS = 300_000;

/**
 * Cap for one blocking `simctl bootstatus -b` overlapped with xcodebuild.
 * Run 44540495367 still had ~15.5 min of bootstatus left when the build
 * started; 17 min fits in the build step without raising its timeout.
 */
export const BOOT_STATUS_TIMEOUT_MS = 1_020_000;

/** setTimeout cannot represent delays above 2^31-1 ms; an epoch is not a duration. */
const MAX_TIMER_MS = 2_147_483_647;

/** How long SIGTERM has to land before the process group is SIGKILLed. */
const KILL_GRACE_MS = 500;

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

/** Milliseconds from `now` until an absolute deadline. Never an epoch. */
export function durationUntil(deadlineAt, now) {
  return Math.max(0, deadlineAt - now);
}

/** Where the capture's time went, for the failure message. */
export function budgetRecap({
  bootMs,
  installMs,
  captured,
  total,
  startedAt,
  now = Date.now(),
}) {
  const stages = [];
  if (bootMs !== undefined) stages.push(`boot ${(bootMs / 1000).toFixed(0)}s`);
  if (installMs !== undefined)
    stages.push(`install ${(installMs / 1000).toFixed(0)}s`);
  return `${stages.join(', ')}; ${captured}/${total} screens captured, ${(
    (now - startedAt) / 1000
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
  now = Date.now(),
}) {
  const remaining = startedAt + budgetMs - now;
  if (remaining < MIN_SCREEN_MS) {
    const error = new Error(
      `capture budget exhausted before the next screen: ${budgetRecap({
        bootMs,
        installMs,
        captured,
        total,
        startedAt,
        now,
      })} of a ${(budgetMs / 1000).toFixed(0)}s budget — the CI step cannot fit this runner's boot; re-run or raise the step timeout`
    );
    error.budgetExhausted = true;
    throw error;
  }
  return Math.min(now + SCREEN_DEADLINE_MS, startedAt + budgetMs);
}

/**
 * Reject when `promise` outlives `ms` — a RELATIVE duration in milliseconds,
 * never a wall-clock timestamp. (Passing an epoch deadline overflows
 * setTimeout's 32-bit range, Node clamps it to 1ms, and the deadline fires
 * instantly — the run-44533014226 failure.) The abandoned promise's failure
 * is swallowed (`.catch(() => {})` on the detached branch only) so the
 * deadline error is the one that surfaces.
 */
export function withDeadline(promise, ms, label) {
  promise.catch(() => {});
  if (!Number.isFinite(ms) || ms < 0 || ms > MAX_TIMER_MS) {
    return Promise.reject(
      new Error(
        `${label}: deadline must be a duration under 2^31 ms, got ${ms}`
      )
    );
  }
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
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function signalGroup(child, signal) {
  const pid = child.pid;
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // Already exited.
    }
  }
}

/**
 * Run a command and resolve its stdout. A timeout always settles the promise:
 * SIGTERM the process group, then SIGKILL. `execFileSync` does not return when
 * the child ignores SIGTERM, which is what simctl does.
 */
export function runBounded(command, args, options = {}) {
  const {
    timeout = 180_000,
    cwd,
    env = process.env,
    encoding = 'utf8',
    stdio,
    killGraceMs = KILL_GRACE_MS,
    spawnImpl = spawn,
  } = options;
  return new Promise((resolve, reject) => {
    const ignore = stdio === 'ignore';
    const child = spawnImpl(command, args, {
      cwd,
      env,
      detached: true,
      stdio: ignore ? 'ignore' : ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let escalate;
    let settled = false;
    let timer;
    const finish = settle => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(escalate);
      settle();
    };
    timer = setTimeout(() => {
      timedOut = true;
      signalGroup(child, 'SIGTERM');
      escalate = setTimeout(() => signalGroup(child, 'SIGKILL'), killGraceMs);
    }, timeout);
    if (!ignore) {
      child.stdout.setEncoding(encoding);
      child.stderr.setEncoding(encoding);
      child.stdout.on('data', chunk => {
        stdout += chunk;
      });
      child.stderr.on('data', chunk => {
        stderr += chunk;
      });
    }
    child.on('error', error => finish(() => reject(error)));
    child.on('close', (code, signal) =>
      finish(() => {
        if (timedOut) {
          reject(
            new Error(
              `${command} timed out after ${Math.round(timeout / 1000)}s and was killed`
            )
          );
          return;
        }
        if (code === 0) {
          resolve(stdout);
          return;
        }
        const detail = stderr.trim().slice(0, 300);
        reject(
          new Error(
            `${command} failed with ${signal ?? code}${detail ? `: ${detail}` : ''}`
          )
        );
      })
    );
  });
}
