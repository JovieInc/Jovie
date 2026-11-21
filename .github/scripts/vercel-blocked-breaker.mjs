#!/usr/bin/env node
// Cross-run "Vercel blocked" breaker for staging deploys.
//
// Nov 14 2026: twelve staging deploys came back readyState=BLOCKED between
// 02:12–05:34Z and each run sat ~8 minutes (the archive upload wait budget)
// before noticing. Detect BLOCKED immediately after upload, trip this
// breaker, and have the next staging job skip `vercel build` until the TTL
// expires (half-open probe). Never changes Vercel spend settings.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SCHEMA = 'jovie-vercel-blocked-breaker/v1';
export const DEFAULT_BREAKER_PATH = '.vercel-blocked-breaker.json';
export const DEFAULT_TTL_SECONDS = 30 * 60;

const TERMINAL_FAIL = new Set(['BLOCKED', 'ERROR', 'CANCELED', 'DELETED']);

export function defaultTtlSeconds(
  env = process.env,
  fallback = DEFAULT_TTL_SECONDS
) {
  const raw = env.VERCEL_BLOCKED_BREAKER_TTL_SECONDS;
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      'VERCEL_BLOCKED_BREAKER_TTL_SECONDS must be a positive number'
    );
  }
  return Math.floor(parsed);
}

/** Pull readyState + a short human reason from a vercel inspect JSON payload. */
export function deploymentState(payload) {
  const state = String(
    payload?.readyState ?? payload?.state ?? payload?.status ?? 'UNKNOWN'
  ).toUpperCase();
  const reasonCandidates = [
    payload?.readyStateReason,
    payload?.errorMessage,
    payload?.errorCode,
    payload?.statusContext,
    payload?.aliasError?.message,
    payload?.aliasError,
  ];
  const reason =
    reasonCandidates
      .map(value => (typeof value === 'string' ? value.trim() : ''))
      .find(value => value.length > 0) || null;
  return {
    state,
    reason,
    id: typeof payload?.id === 'string' ? payload.id : null,
    url: typeof payload?.url === 'string' ? payload.url : null,
  };
}

export function isBlockedState(state) {
  return String(state ?? '').toUpperCase() === 'BLOCKED';
}

export function isTerminalFailureState(state) {
  return TERMINAL_FAIL.has(String(state ?? '').toUpperCase());
}

export function tripBreaker({
  reason,
  deploymentUrl = null,
  deploymentId = null,
  now = Date.now(),
  ttlSeconds = DEFAULT_TTL_SECONDS,
}) {
  const openUntil =
    now + Math.max(1, Number(ttlSeconds) || DEFAULT_TTL_SECONDS) * 1000;
  return {
    schema: SCHEMA,
    state: 'open',
    reason: String(reason || 'Vercel deployment BLOCKED').slice(0, 500),
    deploymentUrl: deploymentUrl || null,
    deploymentId: deploymentId || null,
    trippedAt: new Date(now).toISOString(),
    openUntil,
  };
}

export function readBreaker(path = DEFAULT_BREAKER_PATH) {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || parsed.schema !== SCHEMA) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeBreaker(state, path = DEFAULT_BREAKER_PATH) {
  writeFileSync(path, `${JSON.stringify(state)}\n`, 'utf8');
  return path;
}

export function isBreakerOpen(state, now = Date.now()) {
  if (!state || state.schema !== SCHEMA || state.state !== 'open') return false;
  const until = Number(state.openUntil);
  return Number.isFinite(until) && until > now;
}

export function checkBreaker(path = DEFAULT_BREAKER_PATH, now = Date.now()) {
  const state = readBreaker(path);
  if (!isBreakerOpen(state, now)) {
    return { open: false, state };
  }
  return { open: true, state };
}

export function resolveVercelArgv(env = process.env) {
  if (env.VERCEL_CLI_JSON) {
    const parsed = JSON.parse(env.VERCEL_CLI_JSON);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('VERCEL_CLI_JSON must be a non-empty JSON array');
    }
    return parsed.map(String);
  }
  if (env.VERCEL_CLI) return [String(env.VERCEL_CLI)];
  return ['vercel'];
}

function scopeArgs(env = process.env) {
  return env.VERCEL_ORG_ID ? ['--scope', env.VERCEL_ORG_ID] : [];
}

function settleBudgetSeconds(env = process.env) {
  const raw =
    env.VERCEL_DEPLOY_SETTLE_SECONDS ?? env.VERCEL_BLOCKED_POLL_TIMEOUT_SECONDS;
  if (raw === undefined || raw === '') return 120;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      'VERCEL_DEPLOY_SETTLE_SECONDS must be a non-negative number'
    );
  }
  return Math.floor(parsed);
}

function settleIntervalMs(env = process.env) {
  const raw = env.VERCEL_DEPLOY_SETTLE_INTERVAL_MS;
  if (raw === undefined || raw === '') return 2_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      'VERCEL_DEPLOY_SETTLE_INTERVAL_MS must be a non-negative number'
    );
  }
  return Math.floor(parsed);
}

function defaultSleep(ms) {
  if (!(ms > 0)) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * After `--no-wait`, settle via inspect until READY / terminal failure /
 * settle budget. BLOCKED trips the breaker (75). ERROR/CANCELED return 1 so
 * try_mode can fall back to plain/source. Inspect noise hands off (0).
 */
export function pollDeployment({
  deploymentUrl,
  env = process.env,
  spawn = spawnSync,
  now = Date.now(),
  sleep = defaultSleep,
}) {
  if (!deploymentUrl) {
    process.stderr.write(
      'vercel-blocked-breaker poll requires a deployment URL\n'
    );
    return 2;
  }
  const inspectTimeoutSeconds = Number(
    env.VERCEL_BLOCKED_POLL_TIMEOUT_SECONDS || 20
  );
  const inspectTimeoutMs =
    Number.isFinite(inspectTimeoutSeconds) && inspectTimeoutSeconds > 0
      ? Math.floor(inspectTimeoutSeconds * 1000)
      : 20_000;
  const deadline = now + settleBudgetSeconds(env) * 1000;
  const intervalMs = settleIntervalMs(env);
  let clock = now;
  const tempRoot = mkdtempSync(join(tmpdir(), 'jovie-vercel-blocked-'));
  try {
    const argv = [
      ...resolveVercelArgv(env),
      'inspect',
      deploymentUrl,
      '--format=json',
      ...scopeArgs(env),
    ];
    for (;;) {
      const inspect = spawn(argv[0], argv.slice(1), {
        encoding: 'utf8',
        timeout: inspectTimeoutMs,
        env,
      });
      if (inspect.status !== 0) {
        process.stderr.write(
          `Vercel inspect for post-upload settle exited ${inspect.status ?? 'null'}; continuing\n`
        );
        return 0;
      }
      let payload;
      try {
        payload = JSON.parse(inspect.stdout || '');
      } catch {
        process.stderr.write(
          'vercel-blocked-breaker: inspect JSON was malformed; continuing\n'
        );
        return 0;
      }
      const { state, reason, id, url } = deploymentState(payload);
      if (isBlockedState(state)) {
        const blockedReason = reason || 'Vercel deployment BLOCKED';
        const normalizedUrl = url
          ? url.includes('://')
            ? url
            : `https://${url}`
          : deploymentUrl;
        const breaker = tripBreaker({
          reason: blockedReason,
          deploymentUrl: normalizedUrl,
          deploymentId: id,
          now: clock,
          ttlSeconds: defaultTtlSeconds(env),
        });
        writeBreaker(
          breaker,
          env.VERCEL_BLOCKED_BREAKER_PATH || DEFAULT_BREAKER_PATH
        );
        process.stdout.write(
          `::error title=Vercel deployment BLOCKED::${blockedReason}\n`
        );
        process.stderr.write(
          `Deploy failed: Vercel reported BLOCKED immediately after upload (${blockedReason})\n`
        );
        return 75;
      }
      if (isTerminalFailureState(state)) {
        process.stderr.write(
          `Deploy failed: Vercel deployment entered terminal state ${state}${reason ? `: ${reason}` : ''}\n`
        );
        return 1;
      }
      if (state === 'READY') return 0;
      if (clock >= deadline) {
        process.stderr.write(
          `Vercel deployment still ${state} after settle budget; handing off to readiness\n`
        );
        return 0;
      }
      const waitMs = Math.min(intervalMs, Math.max(0, deadline - clock));
      sleep(waitMs);
      clock += waitMs > 0 ? waitMs : intervalMs || 1;
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function usage() {
  process.stderr.write(
    'Usage: node vercel-blocked-breaker.mjs <check|trip|inspect-json|poll> [args...]\n'
  );
  process.exit(2);
}

function main(argv = process.argv.slice(2), env = process.env) {
  const cmd = argv[0];
  const path = env.VERCEL_BLOCKED_BREAKER_PATH || DEFAULT_BREAKER_PATH;
  if (cmd === 'check') {
    const now = Number(env.VERCEL_BLOCKED_BREAKER_NOW_MS) || Date.now();
    const result = checkBreaker(path, now);
    if (!result.open) {
      process.stdout.write('vercel-blocked-breaker: closed\n');
      return 0;
    }
    const reason = result.state.reason || 'Vercel blocked';
    const until = new Date(result.state.openUntil).toISOString();
    process.stderr.write(
      `Vercel blocked breaker is open until ${until}: ${reason}\n`
    );
    process.stderr.write(
      'Skipping vercel build until the breaker TTL expires (JOV-12620).\n'
    );
    return 1;
  }

  if (cmd === 'trip') {
    const reason = argv[1] || 'Vercel deployment BLOCKED';
    const deploymentUrl = argv[2] || null;
    const deploymentId = argv[3] || null;
    const now = Number(env.VERCEL_BLOCKED_BREAKER_NOW_MS) || Date.now();
    const state = tripBreaker({
      reason,
      deploymentUrl,
      deploymentId,
      now,
      ttlSeconds: defaultTtlSeconds(env),
    });
    writeBreaker(state, path);
    process.stdout.write(`${JSON.stringify(state)}\n`);
    return 0;
  }

  if (cmd === 'inspect-json') {
    const source = argv[1];
    const raw = source ? readFileSync(source, 'utf8') : readFileSync(0, 'utf8');
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      process.stderr.write(
        'vercel-blocked-breaker: inspect JSON was malformed\n'
      );
      return 2;
    }
    const { state, reason, id, url } = deploymentState(payload);
    process.stdout.write(`${JSON.stringify({ state, reason, id, url })}\n`);
    if (isBlockedState(state)) {
      process.stderr.write(
        `Vercel deployment is BLOCKED${reason ? `: ${reason}` : ''}\n`
      );
      return 75;
    }
    if (isTerminalFailureState(state)) {
      process.stderr.write(
        `Vercel deployment entered terminal state ${state}${reason ? `: ${reason}` : ''}\n`
      );
      return 1;
    }
    return 0;
  }

  if (cmd === 'poll') {
    const now = Number(env.VERCEL_BLOCKED_BREAKER_NOW_MS) || Date.now();
    return pollDeployment({ deploymentUrl: argv[1], env, now });
  }

  usage();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
