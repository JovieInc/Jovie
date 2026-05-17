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

const LOCK = HERMES_PATHS.heavyJobLock;
const STALE_MS = 5 * 60 * 1000;

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
function tryClaim(caller: string): boolean {
  mkdirSync(dirname(LOCK), { recursive: true });
  let fd: number;
  try {
    fd = openSync(LOCK, 'wx');
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

/**
 * If the lock is genuinely stale (process gone or older than STALE_MS),
 * remove it so the next claim attempt can succeed. Returns true if we
 * removed it.
 */
function reapIfStale(): boolean {
  let data: { pid?: number; ts?: number };
  try {
    data = JSON.parse(readFileSync(LOCK, 'utf8')) as {
      pid?: number;
      ts?: number;
    };
  } catch {
    // Unreadable lock — assume corrupt, try to remove.
    try {
      unlinkSync(LOCK);
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
  if (age > STALE_MS || dead) {
    try {
      unlinkSync(LOCK);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function withHeavyJobLock<T>(
  caller: string,
  fn: () => Promise<T>,
  options: { readonly timeoutMs?: number } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (tryClaim(caller)) {
      try {
        return await fn();
      } finally {
        try {
          unlinkSync(LOCK);
        } catch {
          // best effort
        }
      }
    }
    // Couldn't claim; check for stale and retry.
    if (!reapIfStale()) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  throw new Error(`heavy-job-lock timeout after ${timeoutMs}ms for ${caller}`);
}
