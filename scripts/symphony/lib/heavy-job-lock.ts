/**
 * Mutex for "heavy" jobs on the Air (Ollama inference, whisper transcription).
 * Prevents memory pressure from concurrent ~700 MB workloads on a 16 GB box.
 *
 * File-based lock with PID + stale-detection. Not a true mutex but adequate
 * for two-process contention on a single Mac.
 */

import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname } from 'node:path';

import { HERMES_PATHS } from './hermes-paths';

const DEFAULT_LOCK = HERMES_PATHS.heavyJobLock;
const STALE_MS = 5 * 60 * 1000;

export interface HeavyJobLockOwner {
  readonly caller?: string;
  readonly pid?: number;
  readonly ts?: number;
}

export type HeavyJobLockResult<T> =
  | { readonly acquired: true; readonly value: T }
  | { readonly acquired: false; readonly owner: HeavyJobLockOwner | null };

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomically attempt to claim the lock. Returns true if we got it.
 *
 * Uses O_CREAT|O_EXCL ('wx') so two concurrent callers cannot both think
 * they won — the kernel makes the create-if-not-exists atomic. This
 * replaces the prior TOCTOU pattern (exists → write).
 */
function tryClaim(caller: string, lock: string): boolean {
  mkdirSync(dirname(lock), { recursive: true });
  let fd: number;
  try {
    fd = openSync(lock, 'wx');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return false;
    throw err;
  }
  try {
    writeSync(fd, JSON.stringify({ caller, pid: process.pid, ts: Date.now() }));
  } finally {
    closeSync(fd);
  }
  return true;
}

function readLockOwner(lock: string): HeavyJobLockOwner | null {
  try {
    return JSON.parse(readFileSync(lock, 'utf8')) as HeavyJobLockOwner;
  } catch {
    return null;
  }
}

/**
 * If the lock is genuinely stale (process gone or older than STALE_MS),
 * remove it so the next claim attempt can succeed. Returns true if we
 * removed it.
 */
function reapIfStale(lock: string, staleMs = STALE_MS): boolean {
  const data = readLockOwner(lock);
  if (!data) {
    // Unreadable lock — assume corrupt, try to remove.
    try {
      unlinkSync(lock);
      return true;
    } catch {
      return false;
    }
  }
  const age =
    typeof data.ts === 'number'
      ? Date.now() - data.ts
      : Number.POSITIVE_INFINITY;
  const dead = typeof data.pid === 'number' ? !isProcessAlive(data.pid) : true;
  if (dead || age > staleMs) {
    try {
      unlinkSync(lock);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function tryWithHeavyJobLock<T>(
  caller: string,
  fn: () => Promise<T>,
  options: { readonly staleMs?: number; readonly lockPath?: string } = {}
): Promise<HeavyJobLockResult<T>> {
  const lock = options.lockPath ?? DEFAULT_LOCK;
  if (
    !tryClaim(caller, lock) &&
    (!reapIfStale(lock, options.staleMs) || !tryClaim(caller, lock))
  ) {
    return { acquired: false, owner: readLockOwner(lock) };
  }

  try {
    return { acquired: true, value: await fn() };
  } finally {
    try {
      unlinkSync(lock);
    } catch {
      // best effort
    }
  }
}

export async function withHeavyJobLock<T>(
  caller: string,
  fn: () => Promise<T>,
  options: {
    readonly timeoutMs?: number;
    readonly staleMs?: number;
    readonly lockPath?: string;
  } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;
  const lock = options.lockPath ?? DEFAULT_LOCK;

  while (Date.now() < deadline) {
    if (tryClaim(caller, lock)) {
      try {
        return await fn();
      } finally {
        try {
          unlinkSync(lock);
        } catch {
          // best effort
        }
      }
    }
    // Couldn't claim; check for stale and retry.
    if (!reapIfStale(lock, options.staleMs)) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  throw new Error(`heavy-job-lock timeout after ${timeoutMs}ms for ${caller}`);
}
