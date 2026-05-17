/**
 * Mutex for "heavy" jobs on the Air (Ollama inference, whisper transcription).
 * Prevents memory pressure from concurrent ~700 MB workloads on a 16 GB box.
 *
 * File-based lock with PID + stale-detection. Not a true mutex but adequate
 * for two-process contention on a single Mac.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
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

export async function withHeavyJobLock<T>(
  caller: string,
  fn: () => Promise<T>,
  options: { readonly timeoutMs?: number } = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!existsSync(LOCK)) {
      mkdirSync(dirname(LOCK), { recursive: true });
      writeFileSync(
        LOCK,
        JSON.stringify({ caller, pid: process.pid, ts: Date.now() })
      );
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

    // Lock exists; check if stale.
    try {
      const data = JSON.parse(readFileSync(LOCK, 'utf8')) as {
        pid: number;
        ts: number;
      };
      const age = Date.now() - data.ts;
      if (age > STALE_MS || !isProcessAlive(data.pid)) {
        unlinkSync(LOCK);
        continue;
      }
    } catch {
      // Unreadable lock; treat as stale.
      try {
        unlinkSync(LOCK);
      } catch {
        // ignore
      }
      continue;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(`heavy-job-lock timeout after ${timeoutMs}ms for ${caller}`);
}
