#!/usr/bin/env node
// One classifier for GitHub API failures that say nothing about the code under
// test: primary quota exhaustion, secondary/abuse limits (403/429) and transient
// 5xx/network errors. Every repo-wide GITHUB_TOKEN workflow shares ~1,000 REST
// calls per hour; when that bucket hit zero on 2026-10-11 20:07Z, PR Size Guard,
// Source Validation and PR Ready failed red, and Lane Fix Relay queued the PRs
// for repair. A quota failure is retried after the reset or deferred; it is
// never a final red verdict and never repair work. Everything else (403 without
// rate-limit evidence, 404, 422, malformed input) stays a real failure.
//
// Library:  classifyGitHubFailure({ status, message, headers, now })
// CLI:      github-rate-limit.mjs classify            < text   -> prints the kind
//           github-rate-limit.mjs run [--max-wait-seconds N] [--attempts N] -- cmd ...
//             runs cmd, waits out quota resets and transient errors; exits 75
//             (EX_TEMPFAIL) with a `github-quota-deferred` marker when the reset
//             is past the wait budget.

import { spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PRIMARY = 'primary-rate-limit';
export const SECONDARY = 'secondary-rate-limit';
export const TRANSIENT = 'transient-server';
export const NONE = 'none';
// Printed by a step that gave up on quota; the relay reads it as infrastructure.
export const QUOTA_DEFERRED_MARKER = 'github-quota-deferred';
export const EX_TEMPFAIL = 75;

const PRIMARY_TEXT = [
  /\bAPI rate limit (?:already )?exceeded for\b/i,
  /\bx-ratelimit-remaining:\s*0\b/i,
  /\bgithub-quota-deferred\b/,
  /\bGitHub rate-limit recovery does not fit\b/i,
];
const SECONDARY_TEXT = [
  /\bsecondary rate limit\b/i,
  /\babuse (?:detection|rate limit)\b/i,
  /\bHTTP 429\b/,
  /\b429 Too Many Requests\b/i,
];
const TRANSIENT_TEXT = [
  /\bHTTP 50[0234]\b/,
  /\bGitHub API 50[0234] for\b/,
  /\b(?:502 Bad Gateway|503 Service Unavailable|504 Gateway Time-?out)\b/i,
  /\bcouldn't respond to your request in time\b/i,
  // gh parsing GitHub's HTML error page as JSON.
  /invalid character '<' looking for beginning of value/,
  /\b(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED)\b/,
  /\bsocket hang up\b/i,
  /\bconnection reset by peer\b/i,
  /\b(?:TLS handshake|i\/o) timeout\b/i,
  /\bunexpected EOF\b/,
  /\bstream error: stream ID \d+; (?:CANCEL|INTERNAL_ERROR)\b/,
  /\bThe operation was aborted due to timeout\b/,
];

function header(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find(k => k.toLowerCase() === name);
  return key === undefined ? null : String(headers[key]);
}

function unsigned(value) {
  return value !== null && /^[0-9]+$/.test(String(value).trim())
    ? Number(value)
    : null;
}

/** Epoch ms after which a retry can succeed, from response headers, or null. */
export function retryAtFromHeaders(headers, nowMs = Date.now()) {
  const remaining = unsigned(header(headers, 'x-ratelimit-remaining'));
  const reset = unsigned(header(headers, 'x-ratelimit-reset'));
  const retryAfter = unsigned(header(headers, 'retry-after'));
  const bounds = [];
  if (remaining === 0 && reset !== null) bounds.push(reset * 1000);
  if (retryAfter !== null) bounds.push(nowMs + retryAfter * 1000);
  if (bounds.length === 0) return null;
  return Math.max(nowMs, ...bounds) + 1000;
}

/**
 * @param {{ status?: number | null, message?: string, headers?: any, now?: number }} failure
 * @returns {{ kind: string, retryable: boolean, retryAtMs: number | null }}
 */
export function classifyGitHubFailure({
  status = null,
  message = '',
  headers = null,
  now = Date.now(),
} = {}) {
  const text = String(message ?? '');
  const result = kind => ({
    kind,
    retryable: kind !== NONE,
    retryAtMs: kind === NONE ? null : retryAtFromHeaders(headers, now),
  });
  const remaining = unsigned(header(headers, 'x-ratelimit-remaining'));
  if (PRIMARY_TEXT.some(re => re.test(text))) return result(PRIMARY);
  if ((status === 403 || status === 429) && remaining === 0) {
    return result(PRIMARY);
  }
  if (SECONDARY_TEXT.some(re => re.test(text))) return result(SECONDARY);
  if (status === 429) return result(SECONDARY);
  // A bare 403 is a permission answer unless GitHub attached retry evidence.
  if (status === 403 && header(headers, 'retry-after') !== null) {
    return result(SECONDARY);
  }
  if ([500, 502, 503, 504].includes(Number(status))) return result(TRANSIENT);
  if (TRANSIENT_TEXT.some(re => re.test(text))) return result(TRANSIENT);
  return result(NONE);
}

export function isGitHubInfrastructureFailure(text) {
  return classifyGitHubFailure({ message: text }).kind !== NONE;
}

function defaultReadReset(resource) {
  // GET /rate_limit does not count against the quota it reports.
  const read = spawnSync(
    'gh',
    [
      'api',
      'rate_limit',
      '--jq',
      `.resources.${resource} | "\\(.remaining) \\(.reset)"`,
    ],
    { encoding: 'utf8', timeout: 15_000 }
  );
  if (read.status !== 0) return null;
  const [remaining, reset] = String(read.stdout)
    .trim()
    .split(/\s+/)
    .map(Number);
  if (!Number.isFinite(remaining) || !Number.isFinite(reset)) return null;
  return { remaining, resetMs: reset * 1000 };
}

function usesGraphql(command) {
  const [bin, verb, sub] = command;
  if (!/(^|\/)gh$/.test(bin ?? '')) return false;
  if (verb === 'api') return sub === 'graphql';
  return ['pr', 'issue', 'search', 'repo', 'project'].includes(verb);
}

/**
 * The wait before the next attempt, or null when the failure is real or the
 * reset is past the budget.
 */
export function planRetry({
  classification,
  attempt,
  attempts,
  nowMs,
  deadlineMs,
  quotaReset = null,
}) {
  if (classification.kind === NONE || attempt >= attempts) return null;
  let waitMs;
  if (classification.retryAtMs !== null) {
    waitMs = classification.retryAtMs - nowMs;
  } else if (classification.kind === PRIMARY) {
    if (!quotaReset) return null;
    waitMs =
      quotaReset.remaining > 0 ? 5_000 : quotaReset.resetMs + 1000 - nowMs;
  } else if (classification.kind === SECONDARY) {
    waitMs = 60_000 * attempt;
  } else {
    waitMs = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
  }
  waitMs = Math.max(1_000, waitMs);
  return nowMs + waitMs <= deadlineMs ? waitMs : null;
}

/** Artifact zip bodies are binary. gh refuses to write those to a pipe. */
export function commandWantsFileStdout(command) {
  return command.some(
    arg => typeof arg === 'string' && /\/zip$/.test(arg.split('?')[0])
  );
}

function capture(command, env) {
  if (commandWantsFileStdout(command)) return captureToFile(command, env);
  return capturePipe(command, env);
}

function capturePipe(command, env) {
  return new Promise(resolve => {
    const child = spawn(command[0], command.slice(1), {
      env,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    const out = [];
    const err = [];
    child.stdout.on('data', chunk => out.push(chunk));
    child.stderr.on('data', chunk => err.push(chunk));
    child.on('error', error =>
      resolve({ code: 127, stdout: '', stderr: String(error) })
    );
    child.on('close', code =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      })
    );
  });
}

function captureToFile(command, env) {
  return new Promise(resolve => {
    const file = join(
      tmpdir(),
      `gh-body-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.bin`
    );
    const fd = openSync(file, 'w');
    let child;
    try {
      child = spawn(command[0], command.slice(1), {
        env,
        stdio: ['inherit', fd, 'pipe'],
      });
    } catch (error) {
      closeSync(fd);
      unlinkSync(file);
      resolve({ code: 127, stdout: Buffer.alloc(0), stderr: String(error) });
      return;
    }
    closeSync(fd);
    const err = [];
    let settled = false;
    const finish = (code, stderr) => {
      if (settled) return;
      settled = true;
      let stdout = Buffer.alloc(0);
      try {
        stdout = readFileSync(file);
      } catch {
        stdout = Buffer.alloc(0);
      }
      try {
        unlinkSync(file);
      } catch {
        // The body was already read, or the file was never created.
      }
      resolve({ code, stdout, stderr });
    };
    child.stderr.on('data', chunk => err.push(chunk));
    child.on('error', error => finish(127, String(error)));
    child.on('close', code =>
      finish(code ?? 1, Buffer.concat(err).toString('utf8'))
    );
  });
}

/**
 * Run a command (usually `gh ...`) until it succeeds, fails for a real reason,
 * or a quota reset falls outside `maxWaitMs`.
 * @typedef {{ code: number, stdout: string, stderr: string }} CommandOutcome
 * @param {string[]} command
 * @param {{
 *   attempts?: number,
 *   env?: NodeJS.ProcessEnv,
 *   log?: (message: string) => unknown,
 *   maxWaitMs?: number,
 *   now?: () => number,
 *   readReset?: (resource: string) => { remaining: number, resetMs: number } | null,
 *   run?: (command: string[], env: NodeJS.ProcessEnv) => Promise<CommandOutcome>,
 *   sleep?: (ms: number) => Promise<unknown>,
 * }} [options]
 * @returns {Promise<CommandOutcome & { kind: string, deferred: boolean }>}
 */
export async function runWithGitHubRetry(
  command,
  {
    attempts = 4,
    env = process.env,
    log = message => process.stderr.write(`${message}\n`),
    maxWaitMs = 0,
    now = Date.now,
    readReset = defaultReadReset,
    run = capture,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  } = {}
) {
  const deadlineMs = now() + maxWaitMs;
  for (let attempt = 1; ; attempt += 1) {
    // gh 2.102 treats every GH_FORCE_TTY value, including 0, as a terminal
    // and then refuses application/zip. JSON calls still force tty off so
    // the body stays plain text. Zip calls must inherit a real file stdout.
    // Fresh object so a zip call can drop GH_FORCE_TTY. Dot access is
    // rejected: the spread collapses to `{ NO_COLOR: string }` under
    // checkJs, and ProcessEnv is an index signature.
    /** @type {NodeJS.ProcessEnv} */
    const childEnv = { ...env, NO_COLOR: '1' };
    if (commandWantsFileStdout(command)) delete childEnv['GH_FORCE_TTY'];
    else childEnv['GH_FORCE_TTY'] = '0';
    const outcome = await run(command, childEnv);
    if (outcome.code === 0) return { ...outcome, kind: NONE, deferred: false };
    // gh prints HTTP error bodies on stdout and the summary on stderr.
    // Zip captures keep a Buffer so a successful body is not decoded as text.
    const stdoutText = Buffer.isBuffer(outcome.stdout)
      ? outcome.stdout.toString('utf8')
      : outcome.stdout;
    const classification = classifyGitHubFailure({
      message: `${outcome.stderr}\n${stdoutText}`,
      now: now(),
    });
    const quotaReset =
      classification.kind === PRIMARY && classification.retryAtMs === null
        ? readReset(usesGraphql(command) ? 'graphql' : 'core')
        : null;
    const waitMs = planRetry({
      classification,
      attempt,
      attempts,
      nowMs: now(),
      deadlineMs,
      quotaReset,
    });
    if (waitMs === null) {
      const deferred = classification.kind !== NONE;
      if (deferred) {
        log(
          `::warning::${QUOTA_DEFERRED_MARKER}: GitHub ${classification.kind} on attempt ${attempt}; ` +
            'not a verdict on this change. Re-run after the quota resets.'
        );
      }
      return { ...outcome, kind: classification.kind, deferred };
    }
    log(
      `[github-rate-limit] ${classification.kind} on attempt ${attempt}/${attempts}; retrying in ${Math.ceil(
        waitMs / 1000
      )}s`
    );
    await sleep(waitMs);
  }
}

function parseRunArgs(argv) {
  const split = argv.indexOf('--');
  if (split < 0 || split === argv.length - 1) {
    throw new Error(
      'usage: github-rate-limit.mjs run [--max-wait-seconds N] [--attempts N] -- cmd ...'
    );
  }
  const options = { attempts: 4, maxWaitMs: 0 };
  const flags = argv.slice(0, split);
  for (let i = 0; i < flags.length; i += 2) {
    const value = Number(flags[i + 1]);
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`invalid value for ${flags[i]}`);
    }
    if (flags[i] === '--max-wait-seconds') options.maxWaitMs = value * 1000;
    else if (flags[i] === '--attempts' && value > 0) options.attempts = value;
    else throw new Error(`unknown flag ${flags[i]}`);
  }
  return { command: argv.slice(split + 1), options };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export async function main(argv = process.argv.slice(2)) {
  const [mode, ...rest] = argv;
  if (mode === 'classify') {
    process.stdout.write(
      `${classifyGitHubFailure({ message: await readStdin() }).kind}\n`
    );
    return 0;
  }
  if (mode === 'run') {
    const { command, options } = parseRunArgs(rest);
    const outcome = await runWithGitHubRetry(command, options);
    process.stdout.write(outcome.stdout ?? '');
    process.stderr.write(outcome.stderr ?? '');
    if (outcome.code === 0) return 0;
    return outcome.deferred ? EX_TEMPFAIL : outcome.code;
  }
  process.stderr.write('usage: github-rate-limit.mjs classify|run\n');
  return 2;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().then(
    code => {
      process.exitCode = code;
    },
    error => {
      process.stderr.write(
        `${error instanceof Error ? error.message : error}\n`
      );
      process.exitCode = 2;
    }
  );
}
