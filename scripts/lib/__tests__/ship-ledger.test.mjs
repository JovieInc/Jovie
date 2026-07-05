import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { tryWithHeavyJobLock } from '../../hermes/lib/heavy-job-lock.ts';
import {
  journalEnd,
  journalStart,
  planRecovery,
  readJournal,
} from '../../hermes/lib/ship-ledger.ts';

const cleanups = [];
afterEach(() => {
  while (cleanups.length)
    rmSync(cleanups.pop(), { recursive: true, force: true });
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'ship-ledger-'));
  cleanups.push(dir);
  return dir;
}

function entry(overrides = {}) {
  return {
    job: 'codex-issue-shipper',
    repo: 'JovieInc/Jovie',
    issue: 101,
    branch: 'codex/gh-101',
    worktree: '/tmp/wt-101',
    pid: process.pid,
    startedAt: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('ship-ledger journal', () => {
  it('returns [] for a missing journal', () => {
    expect(readJournal(join(tmp(), 'nope.json'))).toEqual([]);
  });

  it('returns [] for a corrupt journal instead of throwing', () => {
    const path = join(tmp(), 'journal.json');
    writeFileSync(path, '{not json');
    expect(readJournal(path)).toEqual([]);
    writeFileSync(path, '{"an":"object, not an array"}');
    expect(readJournal(path)).toEqual([]);
  });

  it('drops malformed entries but keeps valid ones', () => {
    const path = join(tmp(), 'journal.json');
    writeFileSync(path, JSON.stringify([entry(), { junk: true }, null]));
    const read = readJournal(path);
    expect(read).toHaveLength(1);
    expect(read[0].issue).toBe(101);
  });

  it('round-trips start/end and only removes the matching issue+repo', () => {
    const path = join(tmp(), 'journal.json');
    journalStart(entry({ issue: 1 }), path);
    journalStart(entry({ issue: 2 }), path);
    journalStart(entry({ issue: 1, repo: 'JovieInc/Ops' }), path);
    expect(readJournal(path)).toHaveLength(3);

    journalEnd(1, 'JovieInc/Jovie', path);
    const after = readJournal(path);
    expect(after).toHaveLength(2);
    expect(after.map(e => `${e.repo}#${e.issue}`).sort()).toEqual([
      'JovieInc/Jovie#2',
      'JovieInc/Ops#1',
    ]);
  });

  it('re-journaling the same issue+repo replaces the prior entry', () => {
    const path = join(tmp(), 'journal.json');
    journalStart(entry({ branch: 'first' }), path);
    journalStart(entry({ branch: 'second' }), path);
    const read = readJournal(path);
    expect(read).toHaveLength(1);
    expect(read[0].branch).toBe('second');
  });

  it('writes are atomic (no partial tmp file left behind)', () => {
    const path = join(tmp(), 'journal.json');
    journalStart(entry(), path);
    expect(() => readFileSync(`${path}.tmp`)).toThrow();
    expect(readJournal(path)).toHaveLength(1);
  });
});

describe('ship-ledger recovery planning', () => {
  it('splits entries by owner liveness', () => {
    const dead = entry({ issue: 1, pid: 99_999_999 });
    const alive = entry({ issue: 2, pid: process.pid });
    const plan = planRecovery([dead, alive], pid => pid === process.pid);
    expect(plan.stale.map(e => e.issue)).toEqual([1]);
    expect(plan.live.map(e => e.issue)).toEqual([2]);
  });

  it('handles an empty journal', () => {
    expect(planRecovery([])).toEqual({ stale: [], live: [] });
  });
});

describe('heavy-job-lock lockPath option', () => {
  it('locks at different paths are independent; same path excludes', async () => {
    const dir = tmp();
    const lockA = join(dir, 'a.lock');
    const lockB = join(dir, 'b.lock');

    const outer = await tryWithHeavyJobLock(
      'test-outer',
      async () => {
        // A held: same path must be refused…
        const samePathResult = await tryWithHeavyJobLock(
          'test-inner-same',
          async () => 'won',
          { lockPath: lockA, staleMs: 60_000 }
        );
        // …but a different path is a different lock.
        const otherPathResult = await tryWithHeavyJobLock(
          'test-inner-other',
          async () => 'won',
          { lockPath: lockB, staleMs: 60_000 }
        );
        return { samePathResult, otherPathResult };
      },
      { lockPath: lockA, staleMs: 60_000 }
    );

    expect(outer.acquired).toBe(true);
    expect(outer.value.samePathResult.acquired).toBe(false);
    expect(outer.value.samePathResult.owner?.caller).toBe('test-outer');
    expect(outer.value.otherPathResult.acquired).toBe(true);
  });

  it('breaks a lock whose owner pid is dead', async () => {
    const lock = join(tmp(), 'stale.lock');
    writeFileSync(
      lock,
      JSON.stringify({ caller: 'ghost', pid: 99_999_999, ts: Date.now() })
    );
    const result = await tryWithHeavyJobLock('test-reaper', async () => 'won', {
      lockPath: lock,
      staleMs: 60_000,
    });
    expect(result.acquired).toBe(true);
    expect(result.value).toBe('won');
  });
});
