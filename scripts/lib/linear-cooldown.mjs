/**
 * Per-credential Linear cooldown shared by Python lanes and JS clients.
 * Private records use <root>/<sha256(API_URL + NUL + key)>/<resetAt>-<id>.json
 * with {schema:1,resetAt:<epoch ms>}; additive writes keep the latest reset.
 * Raw credentials are never written; both legacy forms are read only.
 */

import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

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

/** Per-uid tmp fallback used when the shared state dir rejects a write. */
export function fallbackCooldownRoot() {
  const uid = process.getuid ? process.getuid() : 'shared';
  return join(tmpdir(), `jovie-linear-cooldown-${uid}`);
}

// Cooldowns this process failed to persist, keyed by credential scope hash.
// Raw keys never reach the map or the fallback files (JOV-7577).
const processCooldowns = new Map();
let unwritableEventFired = false;

async function fallbackPublish(scope, resetAt) {
  try {
    const directory = join(fallbackCooldownRoot(), scope);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const record = join(directory, `${resetAt}-${randomUUID()}.json`);
    const fd = await fs.open(record, 'wx', 0o600);
    try {
      await fd.writeFile(JSON.stringify({ schema: 1, resetAt }));
      await fd.sync();
    } finally {
      await fd.close();
    }
  } catch {
    // the tmp fallback is best-effort; the in-process record still applies
  }
}

async function reportUnwritableCooldown(root, cause) {
  console.error(
    JSON.stringify({
      schema: 'jovie.linear-cooldown-write-failure/v1',
      fingerprint: 'linear-cooldown-unwritable',
      root,
      error:
        cause instanceof Error
          ? `${cause.name}: ${cause.message}`
          : String(cause),
    })
  );
  if (unwritableEventFired) return;
  unwritableEventFired = true;
  try {
    const { upsertLinearIssueByTitleFingerprint } = await import(
      './linear-issue-intake.mjs'
    );
    await upsertLinearIssueByTitleFingerprint({
      fingerprint: 'linear-cooldown-unwritable',
      labelKey: 'linear-cooldown-unwritable',
      title:
        'Linear cooldown state dir unwritable (linear-cooldown-unwritable)',
      description:
        'A lane could not persist the shared Linear cooldown. Until a write ' +
        'succeeds, sibling processes rely on the tmp and in-process fallback. ' +
        'Check ownership and permissions of the LINEAR_COOLDOWN_STATE_DIR root.',
      priority: 2,
      createStateName: 'Todo',
      reopenTerminal: true,
    });
  } catch {
    // remediation reporting must never break the rate-limit path
  }
}

function stateError() {
  return Object.assign(new Error(STATE_ERROR), {
    code: 'BACKOFF_STATE_INVALID',
  });
}

async function privateDirectory(path, repair = false) {
  await fs.mkdir(path, { recursive: true, mode: 0o700 });
  if (repair) {
    try {
      const current = await fs.lstat(path);
      if (current.isDirectory() && (current.mode & 0o077) !== 0)
        await fs.chmod(path, 0o700);
    } catch {
      // the stat check below reports a directory this process cannot make private
    }
  }
  const stat = await fs.lstat(path);
  if (
    !stat.isDirectory() ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw stateError();
}

/** @param {string} directory @param {number} nowMs @param {boolean} strict */
async function readScope(directory, nowMs, strict) {
  try {
    if (strict) {
      await fs.lstat(directory);
      await privateDirectory(dirname(directory));
      await privateDirectory(directory);
    }
    const names = await fs.readdir(directory);
    if (names.length > 1000) {
      if (strict) throw stateError();
      names.length = 1000;
    }
    let resetAt = 0;
    for (const name of names) {
      if (!/^\d+-[0-9a-f-]+\.json$/.test(name)) {
        if (strict) throw stateError();
        continue;
      }
      const path = join(directory, name);
      let record;
      try {
        const stat = await fs.lstat(path);
        if (
          !stat.isFile() ||
          stat.size > 256 ||
          (strict && (stat.mode & 0o077) !== 0) ||
          (strict && process.getuid && stat.uid !== process.getuid())
        ) {
          if (strict) throw stateError();
          continue;
        }
        record = JSON.parse(await fs.readFile(path, 'utf8'));
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
          await fs.unlink(path);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
    }
    return resetAt;
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    if (error?.code === 'BACKOFF_STATE_INVALID') throw error;
    if (strict) throw stateError();
    return 0;
  }
}

/** Lane-runner single file: `<root>/<sha256(key)>.json`. Malformed files are ignored. */
async function readLegacyFile(root, keyHash, nowMs) {
  try {
    const record = JSON.parse(
      await fs.readFile(join(root, `${keyHash}.json`), 'utf8')
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
 * @param {string} key @param {string} root
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
  async function read(nowMs) {
    try {
      if (strict) {
        await privateDirectory(root);
        await privateDirectory(directory);
      }
      let resetAt = await readScope(directory, nowMs, strict);
      resetAt = Math.max(resetAt, await readLegacyFile(root, keyHash, nowMs));
      for (const legacy of legacyRoots) {
        const legacyScope = join(legacy, scope);
        const scopeReset = await readScope(legacyScope, nowMs, strict);
        const fileReset = await readLegacyFile(legacy, keyHash, nowMs);
        resetAt = Math.max(resetAt, scopeReset, fileReset);
      }
      // Fallbacks written when the shared dir rejected a publish (JOV-7577).
      resetAt = Math.max(
        resetAt,
        await readScope(join(fallbackCooldownRoot(), scope), nowMs, false)
      );
      const local = processCooldowns.get(scope);
      if (local !== undefined) {
        if (local > nowMs) resetAt = Math.max(resetAt, local);
        else processCooldowns.delete(scope);
      }
      return resetAt;
    } catch (error) {
      if (!strict) return 0;
      if (error?.code === 'BACKOFF_STATE_INVALID') throw error;
      throw stateError();
    }
  }
  async function publish(resetAt) {
    const id = randomUUID();
    const staging = join(directory, `.pending-${id}`);
    try {
      if (!Number.isSafeInteger(resetAt) || resetAt <= 0) throw stateError();
      // Only loose writers repair permissions; strict readers fail closed.
      await privateDirectory(root, !strict);
      await privateDirectory(directory, !strict);
      const fd = await fs.open(staging, 'wx', 0o600);
      try {
        await fd.writeFile(JSON.stringify({ schema: 1, resetAt }));
        await fd.sync();
      } finally {
        await fd.close();
      }
      await fs.chmod(staging, 0o600);
      await fs.rename(staging, join(directory, `${resetAt}-${id}.json`));
      const dir = await fs.open(directory, 'r');
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    } catch (error) {
      try {
        await fs.unlink(staging);
      } catch {
        // a crashed publication is removed when we can; strict readers still fail closed on leftovers
      }
      // Never swallow a write failure silently: log, report once, and keep the
      // deadline alive in-process and under tmp so siblings still back off.
      if (Number.isSafeInteger(resetAt) && resetAt > 0) {
        processCooldowns.set(
          scope,
          Math.max(resetAt, processCooldowns.get(scope) ?? 0)
        );
        await fallbackPublish(scope, resetAt);
      }
      await reportUnwritableCooldown(root, error);
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

export async function activeResetAt(key, now = Date.now(), env = process.env) {
  const root = canonicalCooldownRoot(env);
  const store = credentialBackoff(key, root, {
    legacyRoots: legacyCooldownRoots(root, env),
    strict: false,
  });
  const resetAt = await store.read(now);
  return resetAt > now ? resetAt : null;
}

export async function publishLaneCooldown(
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
  // Loose stores handle inaccessible state; this call still reports rate limiting.
  const resetAt = Math.max(requested, await store.read(nowMs));
  await store.publish(resetAt);
  return resetAt;
}

/** Shared GraphQL POST: skip active cooldowns; publish deadlines on rate limits. */
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
  const cooling = await activeResetAt(key, nowMs, env);
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
    const resetAt = await publishLaneCooldown(
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
