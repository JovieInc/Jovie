/**
 * One Linear cooldown per API key, shared by the lane runner and every JS client.
 *
 * Canonical records live in a private directory named by sha256(API_URL + NUL + key):
 *   $LINEAR_COOLDOWN_STATE_DIR/<hash>/<resetAt>-<id>.json
 *   else $LANES_STATE/linear-cooldown/<hash>/...
 *   else $LINEAR_BACKOFF_STATE_DIR/<hash>/...   (existing orchestrator override)
 *   else ~/.local/state/jovie-lanes/linear-cooldown/<hash>/...
 *
 * Each record is {"schema":1,"resetAt":<epoch ms>}. Writers add a record; readers
 * keep the latest deadline, so a later writer cannot shorten an earlier one.
 * The raw key is never written.
 *
 * Transition reads, never writes:
 *   ~/.local/state/jovie-linear-backoff/<same hash>/   (orchestrator before this PR)
 *   <root>/<sha256(key)>.json                          (lane runner single-file cooldown)
 */

import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const LINEAR_API_URL = 'https://api.linear.app/graphql';
export const COOLDOWN_FLOOR_MS = 60_000;
export const COOLDOWN_JITTER = 0.25;

const STATE_ERROR =
  'Linear credential backoff state is unavailable or malformed';

export function credentialHash(key, apiUrl = LINEAR_API_URL) {
  return createHash('sha256').update(`${apiUrl}\0${key}`).digest('hex');
}

export function legacyKeyHash(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}

export function canonicalCooldownRoot(env = process.env, home = homedir()) {
  if (env.LINEAR_COOLDOWN_STATE_DIR) return env.LINEAR_COOLDOWN_STATE_DIR;
  if (env.LANES_STATE) return join(env.LANES_STATE, 'linear-cooldown');
  if (env.LINEAR_BACKOFF_STATE_DIR) return env.LINEAR_BACKOFF_STATE_DIR;
  return join(home, '.local', 'state', 'jovie-lanes', 'linear-cooldown');
}

export function legacyCooldownRoots(
  canonical,
  env = process.env,
  home = homedir()
) {
  const roots = [join(home, '.local', 'state', 'jovie-linear-backoff')];
  if (env.LINEAR_BACKOFF_STATE_DIR) roots.push(env.LINEAR_BACKOFF_STATE_DIR);
  return [...new Set(roots)].filter(root => root && root !== canonical);
}

function stateError() {
  return Object.assign(new Error(STATE_ERROR), {
    code: 'BACKOFF_STATE_INVALID',
  });
}

function privateDirectory(path, repair = false) {
  fs.mkdirSync(path, { recursive: true, mode: 0o700 });
  if (repair) {
    try {
      const current = fs.lstatSync(path);
      if (current.isDirectory() && (current.mode & 0o077) !== 0)
        fs.chmodSync(path, 0o700);
    } catch {
      // the stat check below reports a directory this process cannot make private
    }
  }
  const stat = fs.lstatSync(path);
  if (
    !stat.isDirectory() ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw stateError();
}

/**
 * Latest future reset in one scope directory. Strict mode throws on a malformed
 * or non-private record. Loose mode ignores those records.
 * @param {string} directory @param {number} nowMs @param {boolean} strict
 */
function readScope(directory, nowMs, strict) {
  if (!fs.existsSync(directory)) return 0;
  try {
    if (strict) privateDirectory(directory);
    const names = fs.readdirSync(directory);
    if (names.length > 1000) {
      if (strict) throw stateError();
      names.length = 1000;
    }
    let resetAt = 0;
    for (const name of names) {
      if (name.startsWith('.pending-')) {
        if (strict) throw stateError();
        continue;
      }
      if (!/^\d+-[0-9a-f-]+\.json$/.test(name)) {
        if (strict) throw stateError();
        continue;
      }
      const path = join(directory, name);
      let record;
      try {
        const stat = fs.lstatSync(path);
        if (
          !stat.isFile() ||
          stat.size > 256 ||
          (strict && (stat.mode & 0o077) !== 0) ||
          (strict && process.getuid && stat.uid !== process.getuid())
        ) {
          if (strict) throw stateError();
          continue;
        }
        record = JSON.parse(fs.readFileSync(path, 'utf8'));
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        if (error?.code === 'BACKOFF_STATE_INVALID') throw error;
        if (strict) throw stateError();
        continue;
      }
      if (
        record?.schema !== 1 ||
        !Number.isSafeInteger(record.resetAt) ||
        record.resetAt <= 0 ||
        !name.startsWith(`${record.resetAt}-`)
      ) {
        if (strict) throw stateError();
        continue;
      }
      if (record.resetAt > nowMs) resetAt = Math.max(resetAt, record.resetAt);
      else if (strict) {
        try {
          fs.unlinkSync(path);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
    }
    return resetAt;
  } catch (error) {
    if (error?.code === 'BACKOFF_STATE_INVALID') throw error;
    if (strict) throw stateError();
    return 0;
  }
}

/** Lane-runner single file: `<root>/<sha256(key)>.json`. Malformed files are ignored. */
function readLegacyFile(root, keyHash, nowMs) {
  try {
    const record = JSON.parse(
      fs.readFileSync(join(root, `${keyHash}.json`), 'utf8')
    );
    if (
      record?.schema !== 1 ||
      !Number.isSafeInteger(record.resetAt) ||
      record.resetAt <= 0
    )
      return 0;
    return record.resetAt > nowMs ? record.resetAt : 0;
  } catch {
    return 0;
  }
}

/**
 * @param {string} key
 * @param {string} root
 * @param {{ legacyRoots?: string[], strict?: boolean }} [options]
 */
export function credentialBackoff(
  key,
  root,
  { legacyRoots = [], strict = true } = {}
) {
  const scope = credentialHash(key);
  const keyHash = legacyKeyHash(key);
  const directory = join(root, scope);

  function read(nowMs) {
    try {
      if (strict) {
        privateDirectory(root);
        privateDirectory(directory);
      }
      let resetAt = readScope(directory, nowMs, strict);
      resetAt = Math.max(resetAt, readLegacyFile(root, keyHash, nowMs));
      for (const legacy of legacyRoots) {
        const legacyScope = join(legacy, scope);
        if (!fs.existsSync(legacyScope)) {
          resetAt = Math.max(resetAt, readLegacyFile(legacy, keyHash, nowMs));
          continue;
        }
        if (strict) privateDirectory(legacy);
        resetAt = Math.max(resetAt, readScope(legacyScope, nowMs, strict));
        resetAt = Math.max(resetAt, readLegacyFile(legacy, keyHash, nowMs));
      }
      return resetAt;
    } catch (error) {
      if (!strict) return 0;
      if (error?.code === 'BACKOFF_STATE_INVALID') throw error;
      throw stateError();
    }
  }

  function publish(resetAt) {
    const id = randomUUID();
    const staging = join(directory, `.pending-${id}`);
    try {
      if (!Number.isSafeInteger(resetAt) || resetAt <= 0) throw stateError();
      // Loose writers tighten a directory they own. Strict readers never chmod, so a
      // group-readable scope still fails closed before any request.
      privateDirectory(root, !strict);
      privateDirectory(directory, !strict);
      const fd = fs.openSync(staging, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify({ schema: 1, resetAt }));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.chmodSync(staging, 0o600);
      fs.renameSync(staging, join(directory, `${resetAt}-${id}.json`));
      const dir = fs.openSync(directory, 'r');
      try {
        fs.fsyncSync(dir);
      } finally {
        fs.closeSync(dir);
      }
    } catch (error) {
      try {
        fs.unlinkSync(staging);
      } catch {
        // a crashed publication is removed when we can; strict readers still fail closed on leftovers
      }
      if (!strict) return;
      if (error?.code === 'BACKOFF_STATE_INVALID') throw error;
      throw stateError();
    }
  }

  return { read, publish, scope, directory };
}

export function isRateLimitedBody(status, data) {
  if (status === 429) return true;
  if (status !== 400 && status !== 200) return false;
  const errors = Array.isArray(data?.errors) ? data.errors : [];
  return (
    String(data?.code ?? '').toUpperCase() === 'RATELIMITED' ||
    errors.some(
      error =>
        String(error?.extensions?.code ?? '').toUpperCase() === 'RATELIMITED' ||
        error?.extensions?.statusCode === 429
    )
  );
}

function headerGet(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] ?? headers[name.toLowerCase()];
}

/** Lane deadline: at least 60s plus jitter, extended by Retry-After and reset headers. */
export function laneDeadlineMs(
  headers,
  nowMs = Date.now(),
  random = Math.random
) {
  const spread = Math.floor(COOLDOWN_FLOOR_MS * COOLDOWN_JITTER * random());
  let resetAt = nowMs + COOLDOWN_FLOOR_MS + spread;
  const retry = headerGet(headers, 'retry-after');
  if (typeof retry === 'string' && /^\d+(\.\d+)?$/.test(retry.trim())) {
    const hinted = nowMs + Number(retry) * 1000;
    if (hinted > resetAt) resetAt = hinted;
  }
  for (const name of [
    'x-ratelimit-requests-reset',
    'x-ratelimit-complexity-reset',
  ]) {
    const value = Number(headerGet(headers, name));
    if (!Number.isFinite(value) || value <= 0) continue;
    const epochMs = value < 1e11 ? value * 1000 : value;
    if (epochMs > resetAt) resetAt = epochMs;
  }
  return Math.ceil(resetAt);
}

export function activeResetAt(key, nowMs = Date.now(), env = process.env) {
  const root = canonicalCooldownRoot(env);
  const store = credentialBackoff(key, root, {
    legacyRoots: legacyCooldownRoots(root, env),
    strict: false,
  });
  const resetAt = store.read(nowMs);
  return resetAt > nowMs ? resetAt : null;
}

export function publishLaneCooldown(
  key,
  headers,
  nowMs = Date.now(),
  random = Math.random,
  env = process.env
) {
  const requested = laneDeadlineMs(headers, nowMs, random);
  const root = canonicalCooldownRoot(env);
  const store = credentialBackoff(key, root, {
    legacyRoots: legacyCooldownRoots(root, env),
    strict: false,
  });
  let resetAt = requested;
  try {
    const existing = store.read(nowMs);
    if (existing > resetAt) resetAt = existing;
  } catch {
    // fail open: still try to publish the deadline we computed
  }
  try {
    store.publish(resetAt);
  } catch {
    // an unwritable state dir must not raise; this process still treats the call as limited
  }
  return resetAt;
}

/**
 * Shared GraphQL POST. An active cooldown returns without calling the network.
 * HTTP 429, HTTP 400 RATELIMITED, and HTTP 200 whose errors carry that code
 * publish the lane deadline and return rateLimited.
 */
export async function linearRequest({
  key,
  query,
  variables,
  fetchImpl = fetch,
  timeoutMs = 15_000,
  nowMs = Date.now(),
  random = Math.random,
  env = process.env,
}) {
  if (!key) return { ok: false, reason: 'missing_linear_api_key' };
  const cooling = activeResetAt(key, nowMs, env);
  if (cooling)
    return {
      ok: false,
      rateLimited: true,
      reason: 'linear_rate_limited',
      resetAt: cooling,
    };
  let response;
  try {
    response = await fetchImpl(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        Authorization: key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return {
      ok: false,
      reason: 'transport',
      error: error instanceof Error ? error.message : String(error),
    };
  }
  const text =
    typeof response?.text === 'function' ? await response.text() : '';
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  const status = Number(response?.status ?? 0);
  if (status === 429 || isRateLimitedBody(status, data)) {
    const resetAt = publishLaneCooldown(
      key,
      response?.headers,
      nowMs,
      random,
      env
    );
    return {
      ok: false,
      rateLimited: true,
      reason: 'linear_rate_limited',
      resetAt,
      status,
      data,
    };
  }
  return { ok: response?.ok !== false && status < 400, status, data, text };
}
