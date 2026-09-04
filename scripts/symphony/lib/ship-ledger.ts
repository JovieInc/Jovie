/**
 * Ship ledger — machine-global shipper ownership + durable in-flight job
 * journal, so a shipper restart (auto-update, crash, launchd kickstart)
 * never strands claimed issues, stale claim labels, or orphaned worktrees.
 *
 * Two pieces:
 *
 * 1. SHIP_OWNER_LOCK — a single lock path for "the machine's shipper".
 *    Deliberately anchored at ~/.hermes/state (NOT HERMES_HOME, which is
 *    env-overridable per Hermes profile). Two shipper instances running
 *    under different profiles (launchd vs. gateway/summer) previously
 *    resolved different lock files and raced the same GitHub issue queue
 *    (JovieInc/Jovie#12723). One fixed path = one owner per machine.
 *
 * 2. Journal — every dispatched job is recorded before the coding agent
 *    starts and removed when the dispatch reaches a terminal state. On
 *    startup, entries whose owner pid is dead are recovered: claim label
 *    released, worktree pruned, entry dropped. Work is requeued, not lost.
 *
 * The file formats are the cross-process contract: the Ovie Mac app reads
 * and writes the same lock + journal so app restarts and shipper restarts
 * share one recovery story. Keep both formats append-simple JSON.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Machine-global — see module doc for why this must not use HERMES_HOME. */
export const SHIP_OWNER_LOCK = join(
  homedir(),
  '.hermes',
  'state',
  'ship-owner.lock'
);

export const INFLIGHT_JOURNAL = join(
  homedir(),
  '.hermes',
  'state',
  'inflight-ship-jobs.json'
);

export interface InflightJob {
  readonly job: string;
  readonly repo: string;
  readonly issue: number;
  readonly branch: string;
  readonly worktree: string;
  readonly pid: number;
  readonly startedAt: string;
}

export interface RecoveryPlan {
  readonly stale: ReadonlyArray<InflightJob>;
  readonly live: ReadonlyArray<InflightJob>;
}

export function readJournal(path: string = INFLIGHT_JOURNAL): InflightJob[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is InflightJob =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as InflightJob).issue === 'number' &&
        typeof (e as InflightJob).pid === 'number'
    );
  } catch {
    // Corrupt journal: recovering nothing is safer than crashing the
    // shipper. Stale claims will self-surface as codex-in-progress churn.
    return [];
  }
}

function writeJournal(entries: ReadonlyArray<InflightJob>, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(entries, null, 2));
  renameSync(tmp, path); // atomic swap — a crash mid-write never corrupts
}

export function journalStart(
  entry: InflightJob,
  path: string = INFLIGHT_JOURNAL
): void {
  const entries = readJournal(path).filter(
    e => !(e.issue === entry.issue && e.repo === entry.repo)
  );
  entries.push(entry);
  writeJournal(entries, path);
}

export function journalEnd(
  issue: number,
  repo: string,
  path: string = INFLIGHT_JOURNAL
): void {
  const entries = readJournal(path);
  const kept = entries.filter(e => !(e.issue === issue && e.repo === repo));
  if (kept.length !== entries.length) writeJournal(kept, path);
}

export function defaultIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pure planner: split journal entries into live (owner pid still running —
 * leave alone) and stale (owner dead — release claim, prune worktree).
 * The caller executes the side effects and drops recovered entries.
 */
export function planRecovery(
  entries: ReadonlyArray<InflightJob>,
  isAlive: (pid: number) => boolean = defaultIsAlive
): RecoveryPlan {
  const stale: InflightJob[] = [];
  const live: InflightJob[] = [];
  for (const entry of entries) {
    (isAlive(entry.pid) ? live : stale).push(entry);
  }
  return { stale, live };
}
