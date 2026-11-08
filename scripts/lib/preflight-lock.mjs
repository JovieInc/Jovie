/**
 * Host-wide preflight slot: only N (default 1) heavy preflights per host at a
 * time. 2026-11-07: 3-4 concurrent preflights drove the Mac to load 34-74 and
 * every one took 10-35 minutes. Waiters print who holds the slot; a dead
 * holder (pid gone) is reclaimed. Gem has its own semaphore, so callers skip
 * this there (GEM_TYPECHECK_SLOTS set).
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const defaultLockDir = (env = process.env) =>
  path.join(
    env.JOVIE_PREFLIGHT_LOCK_DIR ||
      path.join(homedir(), '.local', 'state', 'jovie-lanes'),
    'preflight-slots'
  );

const alive = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

const read = file => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};

/** Live holders, dropping (and removing) stale slots. */
export function holders(dir, isAlive = alive) {
  let names = [];
  try {
    names = readdirSync(dir).filter(n => n.endsWith('.json'));
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    const file = path.join(dir, n);
    const info = read(file);
    if (info && isAlive(info.pid)) out.push({ ...info, file });
    else rmSync(file, { force: true });
  }
  return out;
}

/** Non-blocking: true when no slot is free (a hook should prefer Gem). */
export function slotsBusy({ dir = defaultLockDir(), slots = 1 } = {}) {
  return holders(dir).length >= slots;
}

/**
 * Wait for a slot. Returns {release, waitedMs}. `timeoutMs` elapsed returns
 * {timedOut:true} so the caller can fall back (never deadlock the push).
 */
export async function acquireSlot({
  dir = defaultLockDir(),
  slots = 1,
  label = '',
  log = console.error,
  timeoutMs = 20 * 60_000,
  pollMs = 2000,
  pid = process.pid,
  sleep = ms => new Promise(r => setTimeout(r, ms)),
} = {}) {
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  let announced = false;
  for (;;) {
    const live = holders(dir);
    if (live.length < slots) {
      // Claim a slot index atomically (wx fails if another process won it).
      for (let i = 0; i < slots; i += 1) {
        const file = path.join(dir, `slot-${i}.json`);
        try {
          writeFileSync(
            file,
            JSON.stringify({ pid, label, at: new Date().toISOString() }),
            { flag: 'wx' }
          );
          const release = () => rmSync(file, { force: true });
          process.once('exit', release);
          return { release, waitedMs: Date.now() - t0, timedOut: false };
        } catch {
          // taken; try the next index
        }
      }
    }
    if (Date.now() - t0 > timeoutMs)
      return { release() {}, waitedMs: Date.now() - t0, timedOut: true };
    if (!announced) {
      const h = live[0];
      log(
        `[preflight] waiting for preflight slot (${live.length}/${slots} busy${h ? `; held by pid ${h.pid}${h.label ? ` ${h.label}` : ''} since ${h.at}` : ''}); one heavy preflight per host`
      );
      announced = true;
    }
    await sleep(pollMs);
  }
}
