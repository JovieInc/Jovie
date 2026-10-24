import { describe, expect, it } from 'vitest';
import {
  chunk,
  isProtectedBranch,
  planBranchSweep,
  verifiedDeletions,
} from '../stale-branch-sweep.mjs';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-20T00:00:00Z');
const branch = (name, sha, ageDays) => ({
  name,
  sha,
  committedAtMs: NOW - ageDays * DAY,
});

function plan(branches, extra = {}) {
  return planBranchSweep({
    branches,
    mainAncestors: new Set(['m1', 'm2']),
    pullHeads: new Map([['p1', '123']]),
    openPullRequests: [{ headRefName: 'codex/open', headRefOid: 'o1' }],
    nowMs: NOW,
    ...extra,
  });
}
const byName = result =>
  Object.fromEntries(result.items.map(item => [item.name, item]));

describe('stale branch sweep policy', () => {
  it('never sweeps protected classes, open PRs, or caller-kept branches', () => {
    const items = byName(
      plan(
        [
          branch('main', 'm2', 400),
          branch('gh-readonly-queue/main/pr-1', 'x1', 90),
          branch('backup/mac/wt-1', 'x2', 90),
          branch('release/2026-10', 'x3', 90),
          branch('dependabot/npm/x', 'x4', 90),
          branch('codex/open', 'z9', 90),
          branch('codex/renamed-open-head', 'o1', 90),
          branch('codex/in-worktree', 'x5', 90),
        ],
        { keepBranches: ['codex/in-worktree'] }
      )
    );
    for (const item of Object.values(items)) expect(item.action).toBe('keep');
    expect(items['codex/open'].reason).toBe('open-pull-request');
    expect(items['codex/renamed-open-head'].reason).toBe('open-pull-request');
    expect(items['codex/in-worktree'].reason).toBe('caller-keep');
    expect(isProtectedBranch('backup/gem/foo')).toBe(true);
  });

  it('deletes contained branches only after the contained grace period', () => {
    const items = byName(
      plan([branch('codex/merged', 'm1', 5), branch('codex/fresh', 'm1', 1)])
    );
    expect(items['codex/merged'].action).toBe('delete');
    expect(items['codex/merged'].archiveRef).toBeUndefined();
    expect(items['codex/fresh'].reason).toBe('contained-but-recent');
  });

  it('archives idle unique work before deletion and keeps recent work', () => {
    const items = byName(
      plan([
        branch('codex/pr-head', 'p1', 20),
        branch('ovie/hud-idea', 'u1', 30),
        branch('ovie/active', 'u2', 3),
      ])
    );
    expect(items['codex/pr-head']).toMatchObject({
      action: 'archive-delete',
      pullRequest: '123',
      reason: 'pull-head-preserved',
    });
    expect(items['ovie/hud-idea']).toMatchObject({
      archiveRef: 'refs/archive/ovie/hud-idea',
      reason: 'unique-no-pull',
    });
    expect(items['ovie/active'].reason).toBe('unique-recent');
  });

  it('deletes archived work only when the archive ref reads back the planned SHA', () => {
    const { items } = plan([
      branch('codex/merged', 'm1', 5),
      branch('a', 'u1', 30),
      branch('b', 'u2', 30),
      branch('c', 'u3', 30),
    ]);
    const archived = new Map([
      ['refs/archive/a', 'u1'],
      ['refs/archive/b', 'moved'],
    ]);
    expect(verifiedDeletions(items, archived).map(item => item.name)).toEqual([
      'codex/merged',
      'a',
    ]);
  });

  it('counts every decision and chunks pushes', () => {
    const result = plan([branch('a', 'u1', 30), branch('b', 'm1', 5)]);
    expect(result.counts).toEqual({
      'archive-delete:unique-no-pull': 1,
      'delete:contained-in-main': 1,
    });
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
