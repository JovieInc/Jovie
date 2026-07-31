import { spawn } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const TRANSIENT_PROTOCOL_PATTERNS = [
  /\bPROTOCOL_TIMEOUT\b/i,
  /Waiting for DevTools protocol response has exceeded the allotted time/i,
  /\bCHROME_INTERSTITIAL\b/i,
  /chrome-error:\/\/chromewebdata\//i,
  /\bERR_(?:CONNECTION_(?:REFUSED|RESET|CLOSED)|EMPTY_RESPONSE)\b/i,
];

const DETERMINISTIC_ASSERTION_PATTERNS = [
  /\bassertion failure for\b/i,
  /\bassertion failed\b/i,
  /expected (?:audit )?score[^\n]*(?:but got|found|received|actual)/i,
  /expected[^\n]*(?:>=|<=)[^\n]*(?:found|received|actual)/i,
];

const MAX_CAPTURE_BYTES = 256 * 1024;

/** Conservative per-run budget for production Lighthouse on hosted runners. */
export const DEFAULT_ESTIMATED_RUN_MS = 120_000;
/** Chrome launch / LHCI process overhead outside individual audit runs. */
export const DEFAULT_ATTEMPT_OVERHEAD_MS = 30_000;
/** Kill grace after SIGTERM when an attempt hits the hard attempt budget. */
export const DEFAULT_KILL_GRACE_MS = 5_000;

export function classifyLighthouseFailure(output) {
  const normalized = String(output).replace(/\u001b\[[0-9;]*m/g, '');

  if (
    DETERMINISTIC_ASSERTION_PATTERNS.some(pattern => pattern.test(normalized))
  ) {
    return 'deterministic_assertion';
  }

  if (TRANSIENT_PROTOCOL_PATTERNS.some(pattern => pattern.test(normalized))) {
    return 'transient_protocol';
  }

  if (
    /\bLighthouse job deadline\b/i.test(normalized) ||
    /\bLIGHTHOUSE_FAILURE_CLASS=job_deadline\b/i.test(normalized) ||
    /\battempt timed out against the job deadline\b/i.test(normalized)
  ) {
    return 'job_deadline';
  }

  return 'unknown';
}

/**
 * Resolve an absolute wall-clock deadline for collect work.
 * Prefers an explicit epoch deadline; otherwise derives one from a relative budget.
 */
export function resolveCollectDeadlineMs({
  deadlineEpochMs = null,
  jobBudgetMs = null,
  nowMs = Date.now(),
} = {}) {
  if (deadlineEpochMs != null) {
    const parsed = Number(deadlineEpochMs);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `LIGHTHOUSE_JOB_DEADLINE_EPOCH_MS must be a finite number; got "${deadlineEpochMs}"`
      );
    }
    return parsed;
  }
  if (jobBudgetMs != null) {
    const parsed = Number(jobBudgetMs);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error(
        `LIGHTHOUSE_JOB_BUDGET_MS must be a positive number; got "${jobBudgetMs}"`
      );
    }
    return nowMs + parsed;
  }
  return null;
}

/**
 * Minimum wall-clock budget required to start one collect attempt for a route
 * (or multi-route collect) without knowingly overrunning the job deadline.
 */
export function resolveMinAttemptBudgetMs({
  routeCount = 1,
  numberOfRuns = 1,
  estimatedRunMs = DEFAULT_ESTIMATED_RUN_MS,
  overheadMs = DEFAULT_ATTEMPT_OVERHEAD_MS,
} = {}) {
  const routes = Number(routeCount);
  const runs = Number(numberOfRuns);
  const perRun = Number(estimatedRunMs);
  const overhead = Number(overheadMs);
  if (
    !Number.isInteger(routes) ||
    routes < 1 ||
    !Number.isInteger(runs) ||
    runs < 1 ||
    !Number.isFinite(perRun) ||
    perRun < 1 ||
    !Number.isFinite(overhead) ||
    overhead < 0
  ) {
    throw new Error(
      'routeCount, numberOfRuns, estimatedRunMs, and overheadMs must be positive integers (overhead may be 0)'
    );
  }
  return routes * runs * perRun + overhead;
}

export function remainingBudgetMs(deadlineMs, nowMs = Date.now()) {
  if (deadlineMs == null) return Number.POSITIVE_INFINITY;
  return Math.max(0, Number(deadlineMs) - Number(nowMs));
}

function appendBounded(current, chunk) {
  const next = current + String(chunk);
  return next.length > MAX_CAPTURE_BYTES
    ? next.slice(next.length - MAX_CAPTURE_BYTES)
    : next;
}

function terminateChild(child, graceMs, killImpl) {
  if (!child || child.killed || child.exitCode != null) return;
  try {
    child.kill('SIGTERM');
  } catch {
    // Process may already be gone.
  }
  killImpl(() => {
    if (!child || child.killed || child.exitCode != null) return;
    try {
      child.kill('SIGKILL');
    } catch {
      // Process may already be gone.
    }
  }, graceMs);
}

export function runStreamingAttempt(command, args, options = {}) {
  const spawnCommand = options.spawnCommand ?? spawn;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const timeoutMs = options.timeoutMs;
  const killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
  const setTimer = options.setTimeoutFn ?? setTimeout;
  const clearTimer = options.clearTimeoutFn ?? clearTimeout;

  return new Promise(resolve => {
    let output = '';
    let settled = false;
    let timedOut = false;
    let killTimer = null;
    let timeoutTimer = null;

    const finish = result => {
      if (settled) return;
      settled = true;
      if (timeoutTimer) clearTimer(timeoutTimer);
      if (killTimer) clearTimer(killTimer);
      resolve(result);
    };

    const child = spawnCommand(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', chunk => {
      stdout.write(chunk);
      output = appendBounded(output, chunk);
    });
    child.stderr?.on('data', chunk => {
      stderr.write(chunk);
      output = appendBounded(output, chunk);
    });
    child.on('error', error => {
      const message = `Failed to launch Lighthouse: ${error.message}\n`;
      stderr.write(message);
      output = appendBounded(output, message);
      finish({ code: 1, output, timedOut: false });
    });
    child.on('exit', code => {
      if (timedOut) {
        const message =
          'Lighthouse attempt timed out against the job deadline\n';
        stderr.write(message);
        output = appendBounded(output, message);
        finish({ code: 1, output, timedOut: true });
        return;
      }
      finish({ code: code ?? 1, output, timedOut: false });
    });

    if (timeoutMs != null && Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timeoutTimer = setTimer(() => {
        timedOut = true;
        terminateChild(child, killGraceMs, (fn, ms) => {
          killTimer = setTimer(fn, ms);
        });
      }, timeoutMs);
    }
  });
}

function formatDeadlineReceipt({
  failureClass,
  attempt,
  maxAttempts,
  remainingMs,
  minAttemptBudgetMs,
  routeLabel = null,
}) {
  const parts = [
    `LIGHTHOUSE_FAILURE_CLASS=${failureClass}`,
    `LIGHTHOUSE_ATTEMPT=${attempt}/${maxAttempts}`,
    `LIGHTHOUSE_REMAINING_MS=${Math.max(0, Math.floor(remainingMs))}`,
    `LIGHTHOUSE_MIN_ATTEMPT_BUDGET_MS=${Math.floor(minAttemptBudgetMs)}`,
  ];
  if (routeLabel) {
    parts.push(`LIGHTHOUSE_ROUTE=${routeLabel}`);
  }
  return parts.join(' ');
}

export async function runWithClassifiedRetries({
  executeAttempt,
  maxAttempts = 3,
  cooldownMs = 10_000,
  deadlineMs = null,
  minAttemptBudgetMs = null,
  routeLabel = null,
  sleep = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds)),
  now = Date.now,
  report = message => process.stderr.write(`${message}\n`),
}) {
  const requiredBudget =
    minAttemptBudgetMs == null ? 0 : Number(minAttemptBudgetMs);
  if (!Number.isFinite(requiredBudget) || requiredBudget < 0) {
    throw new Error('minAttemptBudgetMs must be a non-negative finite number');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remainingBeforeAttempt = remainingBudgetMs(deadlineMs, now());
    if (
      deadlineMs != null &&
      requiredBudget > 0 &&
      remainingBeforeAttempt < requiredBudget
    ) {
      const receipt = formatDeadlineReceipt({
        failureClass: 'job_deadline',
        attempt,
        maxAttempts,
        remainingMs: remainingBeforeAttempt,
        minAttemptBudgetMs: requiredBudget,
        routeLabel,
      });
      report(receipt);
      return {
        code: 1,
        output: `${receipt}\nLighthouse job deadline exhausted before attempt ${attempt}${routeLabel ? ` for ${routeLabel}` : ''}: remaining ${Math.floor(remainingBeforeAttempt)}ms < min attempt budget ${Math.floor(requiredBudget)}ms\n`,
        attempts: Math.max(0, attempt - 1),
        failureClass: 'job_deadline',
        timedOut: false,
      };
    }

    const attemptTimeoutMs =
      deadlineMs == null
        ? null
        : Math.max(1, Math.floor(remainingBudgetMs(deadlineMs, now())));
    const result = await executeAttempt(attempt, {
      timeoutMs: attemptTimeoutMs,
      remainingMs: remainingBeforeAttempt,
      minAttemptBudgetMs: requiredBudget,
    });

    if (result.code === 0) {
      return {
        ...result,
        attempts: attempt,
        failureClass: null,
        timedOut: Boolean(result.timedOut),
      };
    }

    if (result.timedOut) {
      const remaining = remainingBudgetMs(deadlineMs, now());
      const receipt = formatDeadlineReceipt({
        failureClass: 'job_deadline',
        attempt,
        maxAttempts,
        remainingMs: remaining,
        minAttemptBudgetMs: requiredBudget,
        routeLabel,
      });
      report(receipt);
      return {
        ...result,
        code: 1,
        output: `${result.output ?? ''}${receipt}\n`,
        attempts: attempt,
        failureClass: 'job_deadline',
        timedOut: true,
      };
    }

    const failureClass = classifyLighthouseFailure(result.output);
    report(
      [
        `LIGHTHOUSE_FAILURE_CLASS=${failureClass}`,
        `LIGHTHOUSE_ATTEMPT=${attempt}/${maxAttempts}`,
        routeLabel ? `LIGHTHOUSE_ROUTE=${routeLabel}` : null,
      ]
        .filter(Boolean)
        .join(' ')
    );

    if (failureClass !== 'transient_protocol' || attempt === maxAttempts) {
      return {
        ...result,
        attempts: attempt,
        failureClass,
        timedOut: false,
      };
    }

    const remainingAfterFailure = remainingBudgetMs(deadlineMs, now());
    const remainingAfterCooldown = Math.max(
      0,
      remainingAfterFailure - cooldownMs
    );
    if (
      deadlineMs != null &&
      requiredBudget > 0 &&
      remainingAfterCooldown < requiredBudget
    ) {
      const receipt = formatDeadlineReceipt({
        failureClass: 'job_deadline',
        attempt: attempt + 1,
        maxAttempts,
        remainingMs: remainingAfterCooldown,
        minAttemptBudgetMs: requiredBudget,
        routeLabel,
      });
      report(
        `Transient Chrome DevTools protocol failure; skipping further retries because the job deadline cannot fit another attempt.`
      );
      report(receipt);
      return {
        ...result,
        code: 1,
        output: `${result.output ?? ''}${receipt}\n`,
        attempts: attempt,
        failureClass: 'job_deadline',
        timedOut: false,
      };
    }

    report(
      `Transient Chrome DevTools protocol failure; cooling down for ${cooldownMs}ms before bounded retry.`
    );
    await sleep(cooldownMs);
  }

  throw new Error('Lighthouse retry loop exhausted without a result');
}

function parsePositiveInteger(value, fallback, name) {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer; got "${value}"`);
  }
  return parsed;
}

function parseNonNegativeInteger(value, fallback, name) {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer; got "${value}"`);
  }
  return parsed;
}

function parseOptionalNumber(value, name) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number; got "${value}"`);
  }
  return parsed;
}

export async function main(argv = process.argv.slice(2)) {
  const separator = argv.indexOf('--');
  const commandArgs = separator >= 0 ? argv.slice(separator + 1) : [];
  const [command, ...args] = commandArgs;
  if (!command) {
    throw new Error(
      'Usage: node scripts/lighthouse-retry.mjs -- <lighthouse command> [args...]'
    );
  }

  const maxAttempts = parsePositiveInteger(
    process.env.LIGHTHOUSE_MAX_ATTEMPTS,
    3,
    'LIGHTHOUSE_MAX_ATTEMPTS'
  );
  const cooldownMs = parseNonNegativeInteger(
    process.env.LIGHTHOUSE_RETRY_COOLDOWN_MS,
    10_000,
    'LIGHTHOUSE_RETRY_COOLDOWN_MS'
  );
  const routeCount = parsePositiveInteger(
    process.env.LIGHTHOUSE_ROUTE_COUNT,
    1,
    'LIGHTHOUSE_ROUTE_COUNT'
  );
  const numberOfRuns = parsePositiveInteger(
    process.env.LIGHTHOUSE_NUMBER_OF_RUNS,
    1,
    'LIGHTHOUSE_NUMBER_OF_RUNS'
  );
  const estimatedRunMs = parsePositiveInteger(
    process.env.LIGHTHOUSE_ESTIMATED_RUN_MS,
    DEFAULT_ESTIMATED_RUN_MS,
    'LIGHTHOUSE_ESTIMATED_RUN_MS'
  );
  const overheadMs = parseNonNegativeInteger(
    process.env.LIGHTHOUSE_ATTEMPT_OVERHEAD_MS,
    DEFAULT_ATTEMPT_OVERHEAD_MS,
    'LIGHTHOUSE_ATTEMPT_OVERHEAD_MS'
  );
  const explicitMinBudget = parseOptionalNumber(
    process.env.LIGHTHOUSE_MIN_ATTEMPT_BUDGET_MS,
    'LIGHTHOUSE_MIN_ATTEMPT_BUDGET_MS'
  );
  const deadlineMs = resolveCollectDeadlineMs({
    deadlineEpochMs: parseOptionalNumber(
      process.env.LIGHTHOUSE_JOB_DEADLINE_EPOCH_MS,
      'LIGHTHOUSE_JOB_DEADLINE_EPOCH_MS'
    ),
    jobBudgetMs: parseOptionalNumber(
      process.env.LIGHTHOUSE_JOB_BUDGET_MS,
      'LIGHTHOUSE_JOB_BUDGET_MS'
    ),
  });
  const minAttemptBudgetMs =
    explicitMinBudget ??
    (deadlineMs == null
      ? null
      : resolveMinAttemptBudgetMs({
          routeCount,
          numberOfRuns,
          estimatedRunMs,
          overheadMs,
        }));
  const routeLabel = process.env.LIGHTHOUSE_ROUTE_LABEL?.trim() || null;

  const result = await runWithClassifiedRetries({
    executeAttempt: (_attempt, meta = {}) =>
      runStreamingAttempt(command, args, {
        timeoutMs: meta.timeoutMs,
      }),
    maxAttempts,
    cooldownMs,
    deadlineMs,
    minAttemptBudgetMs,
    routeLabel,
  });
  process.exitCode = result.code;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
