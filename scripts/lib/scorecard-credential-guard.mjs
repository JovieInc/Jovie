#!/usr/bin/env node
// OSSF Scorecard credential guard.
//
// Scorecard and this preflight use the same job token. repo_token and
// internal_default_token both default to github.token, and publish_results
// is false, so the scan sends that token as one Bearer credential.
//
// When X-RateLimit-Remaining hits 0, scorecard v5.6.0 logs
// "Rate limit exceeded. Waiting <duration> to retry..." and sleeps until
// x-ratelimit-reset. The retry reuses the same *http.Request. Its transport
// adds Authorization with Header.Add, so the retry carries two Bearer
// headers. GitHub answers 401 Bad credentials even though the token is
// still valid. This is not a one-hour expiry and not a second token.
//
// The guard waits on the buckets Scorecard actually spends (core, graphql,
// search, code_search) using the existing lifetime planner, then runs the
// pinned image. If Scorecard arms that wait anyway, the container is killed
// before the retry and a new process starts after the reset. A wait that
// would pass the token margin fails closed. No threshold, token, or
// permission change.

import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { planScorecardRateLimitWait } from './github-installation-quota.mjs';

export const SCORECARD_ACTION_SHA =
  'fa7117db83c52d787ae5a89f350999701505d78e';
export const SCORECARD_IMAGE =
  'ghcr.io/ossf/scorecard-action@sha256:1e1481c65fc2407d3fd6ab18a23c741eb4d1c0d9359ebafc4b3ab13aa61d8627';
export const SCORECARD_RESULTS_FILE = 'scorecard-results.sarif';
// One exhaustion window, plus a short bucket (code search is per-minute)
// that the preflight can miss if another job spends it mid-run. A second
// ~31 minute wait fails the token-lifetime planner before this cap matters.
export const MAX_SCORECARD_RESTARTS = 2;
export const SCORECARD_RATE_LIMIT_BUCKETS = Object.freeze([
  'core',
  'graphql',
  'search',
  'code_search',
]);

const WAIT_LINE =
  /(?:Rate limit exceeded|Retry-After header set)\. Waiting (.+?) to retry/;
const RETRY_STARTED_LINE =
  /(?:Rate limit exceeded|Retry-After header set)\. Retrying\b/;
const GO_DURATION =
  /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?(?:(\d+(?:\.\d+)?)(?:us|µs|μs))?(?:(\d+(?:\.\d+)?)ns)?$/;

const PASSTHROUGH_ENV = [
  'GITHUB_EVENT_PATH',
  'GITHUB_EVENT_NAME',
  'GITHUB_REPOSITORY',
  'GITHUB_REF',
  'GITHUB_WORKSPACE',
  'GITHUB_API_URL',
  'GITHUB_SHA',
  'INPUT_RESULTS_FILE',
  'INPUT_RESULTS_FORMAT',
  'INPUT_PUBLISH_RESULTS',
  'INPUT_FILE_MODE',
  'INPUT_INTERNAL_PUBLISH_BASE_URL',
  'INPUT_REPO_TOKEN',
  'INPUT_INTERNAL_DEFAULT_TOKEN',
  'HOME',
];

/**
 * @param {string} text
 * @returns {number | null}
 */
export function parseGoDurationSeconds(text) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.startsWith('-')) return null;
  const match = GO_DURATION.exec(raw);
  if (!match) return null;
  const [, hours, minutes, seconds, millis, micros, nanos] = match;
  if (!hours && !minutes && !seconds && !millis && !micros && !nanos) {
    return null;
  }
  const value =
    Number(hours || 0) * 3600 +
    Number(minutes || 0) * 60 +
    Number(seconds || 0) +
    Number(millis || 0) / 1000 +
    Number(micros || 0) / 1e6 +
    Number(nanos || 0) / 1e9;
  return Number.isFinite(value) ? value : null;
}

/**
 * @param {string} line
 * @returns {{ kind: 'wait' | 'retry-started', waitSeconds: number | null } | null}
 */
export function scorecardWaitFromLine(line) {
  const waiting = WAIT_LINE.exec(line);
  if (waiting) {
    return {
      kind: 'wait',
      waitSeconds: parseGoDurationSeconds(waiting[1]),
    };
  }
  if (RETRY_STARTED_LINE.test(line)) {
    return { kind: 'retry-started', waitSeconds: null };
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param {{
 *   nowSeconds: number,
 *   resources: Record<string, { remaining?: unknown, reset?: unknown }> | null,
 *   elapsedSeconds?: number,
 * }} input
 */
export function planScorecardBuckets({
  nowSeconds,
  resources,
  elapsedSeconds = 0,
}) {
  /** @type {{ action: 'wait', waitSeconds: number, message: string, bucket: string } | null} */
  let longest = null;
  for (const bucket of SCORECARD_RATE_LIMIT_BUCKETS) {
    const sample = resources?.[bucket] ?? {};
    const plan = planScorecardRateLimitWait({
      nowSeconds,
      remaining: finiteNumber(sample.remaining),
      resetEpoch: finiteNumber(sample.reset),
      elapsedSeconds,
    });
    if (plan.action === 'fail') {
      return {
        action: 'fail',
        waitSeconds: plan.waitSeconds,
        bucket,
        message: `GitHub ${bucket} rate limit: ${plan.message}`,
      };
    }
    if (
      plan.action === 'wait' &&
      (!longest || plan.waitSeconds > longest.waitSeconds)
    ) {
      longest = {
        action: 'wait',
        waitSeconds: plan.waitSeconds,
        bucket,
        message: '',
      };
    }
  }
  if (longest) return longest;
  return { action: 'proceed', waitSeconds: 0, bucket: '', message: '' };
}

/**
 * Scorecard is about to sleep until the reset and then retry the same
 * request. Plan that sleep with the shared token-lifetime rule.
 * @param {{ nowSeconds: number, waitSeconds: number, elapsedSeconds?: number }} input
 */
export function planPoisonedScorecardRetry({
  nowSeconds,
  waitSeconds,
  elapsedSeconds = 0,
}) {
  const seconds = Number(waitSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return {
      action: 'fail',
      waitSeconds: 0,
      message:
        'OSSF Scorecard logged a rate-limit wait with an unreadable duration. Stopped the process before it retried the same request. That retry adds a second Authorization header and GitHub answers 401.',
    };
  }
  return planScorecardRateLimitWait({
    nowSeconds,
    remaining: 0,
    resetEpoch: nowSeconds + Math.ceil(seconds),
    elapsedSeconds,
  });
}

/**
 * @param {string} workspace
 * @param {string} dir
 */
function volumeOutsideWorkspace(workspace, dir) {
  const root = resolve(workspace);
  const target = resolve(dir);
  if (target === root || target.startsWith(`${root}${sep}`)) return null;
  return `${dir}:${dir}`;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {number} attempt
 */
export function scorecardContainerName(env, attempt) {
  const clean = value =>
    String(value ?? '').replace(/[^A-Za-z0-9_.-]/g, '') || 'local';
  return `jovie-scorecard-${clean(env.GITHUB_RUN_ID)}-${clean(env.GITHUB_RUN_ATTEMPT)}-${attempt}`;
}

/**
 * Docker argv. The token is never placed here; docker copies
 * INPUT_REPO_TOKEN from the child environment.
 * @param {{
 *   env: NodeJS.ProcessEnv,
 *   attempt: number,
 *   home: string,
 * }} input
 */
export function scorecardDockerArgs({ env, attempt, home }) {
  const workspace = String(env.GITHUB_WORKSPACE ?? '');
  const eventPath = String(env.GITHUB_EVENT_PATH ?? '');
  const args = [
    'run',
    '--name',
    scorecardContainerName(env, attempt),
    '--rm',
    '--workdir',
    workspace,
    '-v',
    `${workspace}:${workspace}`,
  ];
  const eventVolume = volumeOutsideWorkspace(workspace, dirname(eventPath));
  if (eventVolume) args.push('-v', eventVolume);
  const homeVolume = volumeOutsideWorkspace(workspace, home);
  if (homeVolume) args.push('-v', homeVolume);
  args.push('-e', `HOME=${home}`);
  for (const name of PASSTHROUGH_ENV) {
    if (name === 'HOME') continue;
    args.push('-e', name);
  }
  args.push(SCORECARD_IMAGE);
  return args;
}

/**
 * @param {string} name
 */
export function scorecardKillArgs(name) {
  return ['kill', '--signal', 'KILL', name];
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} home
 */
export function scorecardContainerEnv(env, home) {
  const token = String(env.GH_TOKEN ?? '');
  return {
    ...env,
    HOME: home,
    INPUT_RESULTS_FILE: SCORECARD_RESULTS_FILE,
    INPUT_RESULTS_FORMAT: 'sarif',
    INPUT_PUBLISH_RESULTS: 'false',
    INPUT_FILE_MODE: 'archive',
    INPUT_INTERNAL_PUBLISH_BASE_URL: 'https://api.scorecard.dev',
    INPUT_REPO_TOKEN: token,
    INPUT_INTERNAL_DEFAULT_TOKEN: token,
  };
}

/**
 * @param {string[]} command
 * @param {NodeJS.ProcessEnv} [env]
 */
function capture(command, env = process.env) {
  return new Promise(resolveExit => {
    const child = spawn(command[0], command.slice(1), {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out = [];
    const err = [];
    child.stdout.on('data', chunk => out.push(chunk));
    child.stderr.on('data', chunk => err.push(chunk));
    child.on('error', error =>
      resolveExit({ code: 127, stdout: '', stderr: String(error) })
    );
    child.on('close', code =>
      resolveExit({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      })
    );
  });
}

/**
 * @param {string} text
 * @param {string} token
 */
function redact(text, token) {
  if (!token) return text;
  return text.split(token).join('[redacted]');
}

/**
 * @param {string} workspace
 */
export async function removePartialScorecardResults(workspace) {
  if (!workspace) return;
  await rm(join(workspace, SCORECARD_RESULTS_FILE), { force: true });
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   log?: (message: string) => void,
 *   now?: () => number,
 *   startedAt?: number,
 *   run?: typeof capture,
 *   sleep?: (ms: number) => Promise<unknown>,
 * }} [options]
 */
export async function waitForScorecardBuckets({
  env = process.env,
  log = message => console.error(message),
  now = Date.now,
  startedAt = now(),
  run = capture,
  sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms)),
} = {}) {
  for (;;) {
    const outcome = await run(['gh', 'api', 'rate_limit'], env);
    if (outcome.code !== 0) {
      const text = `${outcome.stderr}\n${outcome.stdout}`;
      log(
        `::error::OSSF Scorecard could not read the GitHub rate limit (${text.trim() || 'no response'}). Refusing to run into an unbounded wait.`
      );
      return 1;
    }
    let resources = null;
    try {
      resources = JSON.parse(outcome.stdout)?.resources ?? null;
    } catch {
      resources = null;
    }
    const elapsedSeconds = Math.max(
      0,
      Math.floor((now() - startedAt) / 1000)
    );
    const plan = planScorecardBuckets({
      nowSeconds: Math.floor(now() / 1000),
      resources,
      elapsedSeconds,
    });
    if (plan.action === 'fail') {
      log(`::error::${plan.message}`);
      return 1;
    }
    if (plan.action === 'proceed') return 0;
    if (plan.waitSeconds <= 0) {
      log(
        `::error::GitHub ${plan.bucket} rate limit is already reset but still empty. Refusing to busy-loop before OSSF Scorecard.`
      );
      return 1;
    }
    log(
      `::warning::Holding ${plan.waitSeconds}s for the GitHub ${plan.bucket} rate limit reset before OSSF Scorecard. The wait stays under the token lifetime.`
    );
    await sleep(plan.waitSeconds * 1000);
  }
}

/**
 * @param {{
 *   runAttempt: (attempt: number) => Promise<{
 *     poisoned: boolean,
 *     killed?: boolean,
 *     kind?: 'wait' | 'retry-started',
 *     waitSeconds?: number | null,
 *     code?: number,
 *     sawBadCredentials?: boolean,
 *   }>,
 *   sleep: (ms: number) => Promise<unknown>,
 *   now: () => number,
 *   startedAt: number,
 *   log?: (message: string) => void,
 *   removeResults?: () => Promise<unknown>,
 *   maxRestarts?: number,
 * }} options
 */
export async function superviseScorecardRun({
  runAttempt,
  sleep,
  now,
  startedAt,
  log = message => console.error(message),
  removeResults = async () => {},
  maxRestarts = MAX_SCORECARD_RESTARTS,
}) {
  let unobservedWait = 0;
  let restarts = 0;
  for (let attempt = 1; ; attempt += 1) {
    const outcome = await runAttempt(attempt);
    if (!outcome.poisoned) return outcome.code ?? 1;
    if (outcome.sawBadCredentials) {
      log(
        '::error::OSSF Scorecard already retried with a second Authorization header and GitHub answered 401 Bad credentials. Failing this run instead of hiding that retry.'
      );
      return 1;
    }
    if (!outcome.killed) {
      log(
        '::error::Could not stop OSSF Scorecard before its rate-limit retry. That retry adds a second Authorization header and GitHub answers 401.'
      );
      return 1;
    }
    if (outcome.kind === 'retry-started') {
      log(
        '::error::OSSF Scorecard started its rate-limit retry before it could be stopped. That retry adds a second Authorization header and GitHub answers 401.'
      );
      return 1;
    }
    const elapsedSeconds =
      Math.max(0, Math.floor((now() - startedAt) / 1000)) + unobservedWait;
    const plan = planPoisonedScorecardRetry({
      nowSeconds: Math.floor(now() / 1000),
      waitSeconds: outcome.waitSeconds ?? Number.NaN,
      elapsedSeconds,
    });
    if (plan.action !== 'wait') {
      log(`::error::${plan.message}`);
      return 1;
    }
    if (restarts >= maxRestarts) {
      log(
        `::error::OSSF Scorecard hit another GitHub rate limit after ${restarts} fresh starts. Refusing another in-process retry; that retry adds a second Authorization header and GitHub answers 401.`
      );
      return 1;
    }
    log(
      `::warning::Holding ${plan.waitSeconds}s for the GitHub rate limit before a fresh OSSF Scorecard process. Stopped the current process before it retried the same request; that retry adds a second Authorization header and GitHub answers 401.`
    );
    await removeResults();
    const before = now();
    await sleep(plan.waitSeconds * 1000);
    const observed = Math.max(0, Math.floor((now() - before) / 1000));
    unobservedWait += Math.max(0, plan.waitSeconds - observed);
    restarts += 1;
  }
}

/**
 * @param {{
 *   env: NodeJS.ProcessEnv,
 *   attempt: number,
 *   run?: typeof capture,
 *   spawnChild?: typeof spawn,
 * }} input
 */
export async function runScorecardContainer({
  env,
  attempt,
  run = capture,
  spawnChild = spawn,
}) {
  const workspace = String(env.GITHUB_WORKSPACE ?? '');
  const home = join(
    String(env.RUNNER_TEMP || '/tmp'),
    'scorecard-credential-guard-home'
  );
  await mkdir(home, { recursive: true });
  const name = scorecardContainerName(env, attempt);
  const args = scorecardDockerArgs({ env, attempt, home });
  const childEnv = scorecardContainerEnv(env, home);
  const token = String(env.GH_TOKEN ?? '');
  const child = spawnChild('docker', args, {
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  /** @type {{ kind: 'wait' | 'retry-started', waitSeconds: number | null } | null} */
  let poison = null;
  let sawBadCredentials = false;
  /** @type {Promise<boolean> | null} */
  let killPromise = null;
  const requestKill = () => {
    if (!killPromise) {
      killPromise = run(['docker', ...scorecardKillArgs(name)], childEnv).then(
        outcome => {
          if (outcome.code === 0) return true;
          const text = `${outcome.stderr}\n${outcome.stdout}`;
          return /No such container|is not running|already stopped/i.test(
            text
          );
        },
        () => false
      );
    }
    return killPromise;
  };
  const closed = new Promise(resolveExit => {
    child.on('error', () => resolveExit(127));
    child.on('close', code => resolveExit(code ?? 1));
  });
  const feed = (stream, write) => {
    let buffer = '';
    stream.on('data', chunk => {
      const text = redact(chunk.toString('utf8'), token);
      write(text);
      buffer += text;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line.includes('Bad credentials')) sawBadCredentials = true;
        if (!poison) {
          const found = scorecardWaitFromLine(line);
          if (found) {
            poison = found;
            void requestKill();
          }
        }
        newline = buffer.indexOf('\n');
      }
    });
  };
  if (child.stdout) feed(child.stdout, text => process.stdout.write(text));
  if (child.stderr) feed(child.stderr, text => process.stderr.write(text));
  const code = await closed;
  if (!poison) {
    return {
      poisoned: false,
      killed: false,
      code,
      sawBadCredentials,
      waitSeconds: null,
    };
  }
  return {
    poisoned: true,
    killed: await requestKill(),
    kind: poison.kind,
    waitSeconds: poison.waitSeconds,
    code,
    sawBadCredentials,
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   log?: (message: string) => void,
 *   now?: () => number,
 *   run?: typeof capture,
 *   sleep?: (ms: number) => Promise<unknown>,
 *   runAttempt?: (attempt: number) => Promise<{ poisoned: boolean, code?: number }>,
 *   removeResults?: () => Promise<unknown>,
 * }} [options]
 */
export async function runScorecardCredentialGuard({
  env = process.env,
  log = message => console.error(message),
  now = Date.now,
  run = capture,
  sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms)),
  runAttempt,
  removeResults,
} = {}) {
  if (!env.GH_TOKEN) {
    log(
      '::error::OSSF Scorecard requires GH_TOKEN (the job github.token). Refusing to run without the same credential the action uses.'
    );
    return 1;
  }
  if (!env.GITHUB_WORKSPACE || !env.GITHUB_EVENT_PATH) {
    log(
      '::error::OSSF Scorecard requires GITHUB_WORKSPACE and GITHUB_EVENT_PATH. Refusing to start the container without the event file mounted.'
    );
    return 1;
  }
  const startedAt = now();
  const preflight = await waitForScorecardBuckets({
    env,
    log,
    now,
    startedAt,
    run,
    sleep,
  });
  if (preflight !== 0) return preflight;
  log(
    `Running OSSF Scorecard from ossf/scorecard-action@${SCORECARD_ACTION_SHA} (${SCORECARD_IMAGE}).`
  );
  const workspace = String(env.GITHUB_WORKSPACE);
  return superviseScorecardRun({
    now,
    startedAt,
    log,
    sleep,
    removeResults:
      removeResults ?? (() => removePartialScorecardResults(workspace)),
    runAttempt:
      runAttempt ??
      (attempt => runScorecardContainer({ env, attempt, run })),
  });
}

export async function main() {
  return runScorecardCredentialGuard();
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
