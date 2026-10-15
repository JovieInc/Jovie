#!/usr/bin/env node
// Shared GitHub App installation quota classifier.
//
// Actions' GITHUB_TOKEN and the Jovie Bot installation share one REST bucket.
// When it is empty, GitHub answers 403 with
// "API rate limit exceeded for installation ID N" or, for GITHUB_TOKEN,
// "API rate limit already exceeded for site ID installation".
// A permission 403 ("Resource not accessible by integration") is not this.
// Soft-fail callers exit 0 only for the installation sentence. Every other
// error stays fatal. This file never mints a token and never skips a
// non-matching failure.

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// One hour, the lifetime of a GitHub App installation token. Scorecard's own
// retry sleeps until x-ratelimit-reset and then calls again; if that reset is
// past this lifetime the retry is a 401.
export const INSTALLATION_TOKEN_LIFETIME_SECONDS = 60 * 60;
// Stay far enough under the lifetime that the follow-up request still
// authenticates. A wait past this fails closed instead of sleeping into a 401.
export const SCORECARD_TOKEN_MARGIN_SECONDS = 15 * 60;

const INSTALLATION_QUOTA_403 =
  /\bAPI rate limit (?:already )?exceeded for (?:installation(?:\s+ID\s+\d+)?|site ID installation)\b/i;

/**
 * True only for GitHub's installation-quota 403 sentence.
 * A numeric status, when present, must be 403. An embedded `HTTP NNN` that is
 * not 403 is not this failure.
 * @param {unknown} text
 * @param {number | null} [status]
 */
export function isInstallationQuota403(text, status = null) {
  const message = String(text ?? '');
  if (!INSTALLATION_QUOTA_403.test(message)) return false;
  if (status != null && Number(status) !== 403) return false;
  const embedded = message.match(/\bHTTP\s+(\d{3})\b/i);
  if (status == null && embedded && embedded[1] !== '403') return false;
  return true;
}

/** @param {string} label */
export function installationQuotaLog(label) {
  return `::warning::installation-quota-403: ${label} is skipping this run because GitHub returned an installation 403 on the shared GITHUB_TOKEN quota. This is not a verdict on the change.`;
}

/** @param {unknown} error */
export function errorText(error) {
  const stderr =
    error && typeof error === 'object' && 'stderr' in error
      ? String(
          /** @type {{ stderr?: unknown }} */ (error).stderr ?? ''
        )
      : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  return `${stderr}\n${message}`.trim();
}

/**
 * @param {string} label
 * @param {unknown} error
 * @returns {{ code: number, log: string, softFailed: boolean }}
 */
export function failureDisposition(label, error) {
  const text = errorText(error);
  if (isInstallationQuota403(text)) {
    return { code: 0, log: installationQuotaLog(label), softFailed: true };
  }
  return {
    code: 1,
    log: text || 'unknown failure',
    softFailed: false,
  };
}

/**
 * How long Scorecard may sleep on a primary rate limit before the installation
 * token expires. `elapsedSeconds` is how long the job has already run.
 * @param {{
 *   nowSeconds: number,
 *   remaining: number | null,
 *   resetEpoch?: number | null,
 *   elapsedSeconds?: number,
 *   tokenLifetimeSeconds?: number,
 *   marginSeconds?: number,
 * }} input
 * @returns {{ action: 'proceed' | 'wait' | 'fail', waitSeconds: number, message: string }}
 */
export function planScorecardRateLimitWait({
  nowSeconds,
  remaining,
  resetEpoch = null,
  elapsedSeconds = 0,
  tokenLifetimeSeconds = INSTALLATION_TOKEN_LIFETIME_SECONDS,
  marginSeconds = SCORECARD_TOKEN_MARGIN_SECONDS,
}) {
  const lifeLeft = tokenLifetimeSeconds - elapsedSeconds - marginSeconds;
  if (remaining == null || !Number.isFinite(Number(remaining))) {
    return {
      action: 'fail',
      waitSeconds: 0,
      message:
        'OSSF Scorecard could not read the GitHub rate limit. Refusing to run into an unbounded wait that would fail with 401 after the token expires.',
    };
  }
  if (Number(remaining) > 0) {
    return { action: 'proceed', waitSeconds: 0, message: '' };
  }
  if (resetEpoch == null || !Number.isFinite(Number(resetEpoch))) {
    return {
      action: 'fail',
      waitSeconds: 0,
      message:
        'OSSF Scorecard hit a GitHub rate limit with no x-ratelimit-reset. Refusing to wait; a retry after the token expires fails with 401.',
    };
  }
  const waitSeconds = Math.max(0, Number(resetEpoch) - nowSeconds + 1);
  if (lifeLeft <= 0 || waitSeconds > lifeLeft) {
    return {
      action: 'fail',
      waitSeconds,
      message: `OSSF Scorecard rate-limit wait is ${waitSeconds}s, past the ${Math.max(0, lifeLeft)}s left under the GitHub token lifetime. Refusing to wait; the retry would fail with 401.`,
    };
  }
  return { action: 'wait', waitSeconds, message: '' };
}

/**
 * @param {string[]} command
 * @param {NodeJS.ProcessEnv} [env]
 */
function capture(command, env = process.env) {
  return new Promise(resolve => {
    const child = spawn(command[0], command.slice(1), {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
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

/**
 * @param {string[]} argv
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   log?: (message: string) => void,
 *   run?: typeof capture,
 * }} [options]
 */
export async function softFailCommand(
  argv,
  { env = process.env, log = message => console.error(message), run = capture } = {}
) {
  if (argv.length === 0) {
    log('soft-fail: command is required');
    return 2;
  }
  const outcome = await run(argv, env);
  process.stdout.write(outcome.stdout);
  process.stderr.write(outcome.stderr);
  if (outcome.code === 0) return 0;
  const disposition = failureDisposition(
    'Mutation Diff',
    `${outcome.stderr}\n${outcome.stdout}`
  );
  if (!disposition.softFailed) return outcome.code ?? 1;
  log(disposition.log);
  return 0;
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   log?: (message: string) => void,
 *   now?: () => number,
 *   run?: typeof capture,
 *   sleep?: (ms: number) => Promise<unknown>,
 * }} [options]
 */
export async function runScorecardRateLimitWait({
  env = process.env,
  log = message => console.error(message),
  now = Date.now,
  run = capture,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const outcome = await run(['gh', 'api', 'rate_limit'], env);
  if (outcome.code !== 0) {
    const text = `${outcome.stderr}\n${outcome.stdout}`;
    log(
      `::error::OSSF Scorecard could not read the GitHub rate limit (${text.trim() || 'no response'}). Refusing to run into an unbounded wait.`
    );
    return 1;
  }
  let remaining = null;
  let resetEpoch = null;
  try {
    const payload = JSON.parse(outcome.stdout);
    const core = payload?.resources?.core ?? {};
    remaining = Number(core.remaining);
    resetEpoch = Number(core.reset);
  } catch {
    remaining = null;
  }
  const plan = planScorecardRateLimitWait({
    nowSeconds: Math.floor(now() / 1000),
    remaining: Number.isFinite(remaining) ? remaining : null,
    resetEpoch: Number.isFinite(resetEpoch) ? resetEpoch : null,
  });
  if (plan.action === 'fail') {
    log(`::error::${plan.message}`);
    return 1;
  }
  if (plan.action === 'wait') {
    log(
      `::warning::Holding ${plan.waitSeconds}s for the GitHub rate limit reset before OSSF Scorecard. The wait stays under the token lifetime.`
    );
    await sleep(plan.waitSeconds * 1000);
  }
  return 0;
}

export async function main(argv = process.argv.slice(2)) {
  const [mode, ...rest] = argv;
  if (mode === 'soft-fail') {
    const split = rest[0] === '--' ? rest.slice(1) : rest;
    return softFailCommand(split);
  }
  if (mode === 'scorecard-wait') return runScorecardRateLimitWait();
  if (mode === 'classify') {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    process.stdout.write(
      `${isInstallationQuota403(text) ? 'installation-403' : 'other'}\n`
    );
    return isInstallationQuota403(text) ? 0 : 1;
  }
  process.stderr.write(
    'usage: github-installation-quota.mjs <soft-fail -- cmd|scorecard-wait|classify>\n'
  );
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
