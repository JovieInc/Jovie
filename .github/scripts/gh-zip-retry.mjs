// gh artifact-zip download with a bounded transient retry, extracted from
// production-marker-state.mjs so the size-500-pinned file never grows for it
// (JOV-6813: a transient gh HTTP 503 killed the Sentry recurrence dead-man on
// 2026-11-16 15:43Z with one attempt and no retry — run 43899436210, artifact
// 14239732099, reason verified_production_artifact_unavailable; the two prior
// hourly runs passed). After the last attempt the original error stands, so a
// real failure still fails closed: no threshold moves, nothing is skipped.
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TRANSIENT_GH_ATTEMPT_DELAYS_MS = [500, 1_500];

export function isTransientGhFailure(error) {
  return /gh: HTTP 5\d\d|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|connection reset/i.test(
    error?.message ?? ''
  );
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function spawnFailure(command, args, result) {
  const stderr = Buffer.isBuffer(result.stderr)
    ? result.stderr.toString('utf8')
    : result.stderr;
  throw new Error(
    `${command} ${args.join(' ')} failed: ${stderr || 'unknown error'}`
  );
}

function ghZip(args) {
  // gh 2.102 treats every GH_FORCE_TTY value, including 0, as a terminal and
  // refuses application/zip. A pipe is not a sufficient substitute: write the
  // body to a file and drop the variable.
  const env = { ...process.env };
  delete env.GH_FORCE_TTY;
  const file = join(
    tmpdir(),
    `jovie-gh-zip-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`
  );
  const fd = openSync(file, 'w');
  let result;
  try {
    result = spawnSync('gh', ['api', ...args], {
      env,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', fd, 'pipe'],
    });
  } finally {
    closeSync(fd);
  }
  let stdout = Buffer.alloc(0);
  try {
    stdout = readFileSync(file);
    // Reader doubles return the body on stdout and do not write the fd.
    if (
      stdout.length === 0 &&
      result?.stdout != null &&
      result.stdout.length > 0
    ) {
      stdout = Buffer.isBuffer(result.stdout)
        ? result.stdout
        : Buffer.from(String(result.stdout));
    }
  } finally {
    rmSync(file, { force: true });
  }
  if (!result || result.status !== 0) {
    spawnFailure(
      'gh',
      ['api', ...args],
      result ?? { status: 1, stderr: 'spawn failed' }
    );
  }
  return stdout;
}

/**
 * Download an artifact zip, retrying only transient failures.
 * @param {string[]} args gh api arguments naming the artifact zip endpoint
 * @param {number[]} [delaysMs] sleep before retry attempt N (attempts 2..N+1)
 * @returns {Buffer} the archive body
 */
export function ghZipWithRetry(
  args,
  delaysMs = TRANSIENT_GH_ATTEMPT_DELAYS_MS
) {
  let lastError;
  for (let attempt = 0; attempt <= delaysMs.length; attempt += 1) {
    if (attempt > 0) sleepSync(delaysMs[attempt - 1]);
    try {
      return ghZip(args);
    } catch (error) {
      lastError = error;
      // A deterministic error is an answer, not a transient failure.
      if (!isTransientGhFailure(error)) break;
    }
  }
  throw lastError;
}
