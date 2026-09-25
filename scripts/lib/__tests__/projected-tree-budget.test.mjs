import { describe, expect, it } from 'vitest';
import { parseTrackedRegularTree } from '../merge-group-member-policy.mjs';
import {
  enforceProjectedTreeBudget,
  parseGitLsTree,
  runProjectedTreeBudget,
} from '../projected-tree-budget.mjs';
import {
  HYGIENE_LIMITS,
  trackedBytesBudgetWarning,
} from '../repo-hygiene-limits.mjs';

const BASE = '1'.repeat(40);
const HEAD = '3'.repeat(40);
const MERGE_BASE = '5'.repeat(40);
const BASE_TREE = '6'.repeat(40);
const MERGE_BASE_TREE = '7'.repeat(40);
const HEAD_TREE = '8'.repeat(40);
const MAX = HYGIENE_LIMITS.maxTrackedBytes;

function lsTree(entries) {
  return entries
    .map(
      ({ mode, path, size, type }) =>
        `${mode} ${type} ${'f'.repeat(40)} ${String(size ?? '-').padStart(7)}\t${path}\0`
    )
    .join('');
}

function fakeGit(trees) {
  const treeFor = {
    [BASE]: BASE_TREE,
    [MERGE_BASE]: MERGE_BASE_TREE,
    [HEAD]: HEAD_TREE,
  };
  return args => {
    if (args[0] === 'rev-parse') {
      return `${treeFor[args[2].replace('^{tree}', '')]}\n`;
    }
    if (args[0] === 'ls-tree') return lsTree(trees[args.at(-1)]);
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

function regular(size, path = 'payload.bin') {
  return { mode: '100644', path, size, type: 'blob' };
}

describe('source-PR projected combined-tree budget', () => {
  it('parses local ls-tree evidence through the shared merge_group byte counter', () => {
    const output = lsTree([
      { mode: '040000', path: 'scripts', type: 'tree' },
      regular(7, 'README.md'),
      { mode: '100755', path: 'scripts/a b.sh', size: 11, type: 'blob' },
      { mode: '120000', path: 'linked-doc', size: 9, type: 'blob' },
      { mode: '160000', path: 'vendor/example', type: 'commit' },
    ]);
    expect(parseTrackedRegularTree(parseGitLsTree(output, BASE_TREE))).toEqual({
      bytes: 18,
      files: 2,
    });
    expect(() => parseGitLsTree('garbage\0', BASE_TREE)).toThrow(
      /malformed evidence/
    );
  });

  it('fails an over-budget PR at source stage when base sits just under budget', () => {
    // Regression for the Sep 23-24 queue outage: main sat 260 bytes under the
    // budget and every queued PR was ejected by the merge_group check.
    const git = fakeGit({
      [BASE_TREE]: [regular(MAX - 260)],
      [MERGE_BASE_TREE]: [regular(1_000)],
      [HEAD_TREE]: [regular(1_000), regular(261, 'new.txt')],
    });
    expect(() =>
      enforceProjectedTreeBudget({
        baseSha: BASE,
        git,
        headSha: HEAD,
        log: () => {},
        mergeBaseSha: MERGE_BASE,
      })
    ).toThrow(
      `${MAX + 1} bytes of tracked regular files (base ${MAX - 260} + PR delta +261) exceeds the ${MAX}-byte combined-tree budget`
    );
  });

  it('passes a shrinking PR near budget with a headroom warning', () => {
    const logs = [];
    const result = enforceProjectedTreeBudget({
      baseSha: BASE,
      git: fakeGit({
        [BASE_TREE]: [regular(MAX - 260)],
        [MERGE_BASE_TREE]: [regular(5_000)],
        [HEAD_TREE]: [regular(4_000)],
      }),
      headSha: HEAD,
      log: line => logs.push(line),
      mergeBaseSha: MERGE_BASE,
    });
    expect(result).toEqual({
      baseBytes: MAX - 260,
      bytes: MAX - 1_260,
      delta: -1_000,
    });
    expect(logs[0]).toMatch(
      /^::warning::Projected combined tree: .*0\.00 MB headroom/
    );
  });

  it('stays quiet below 95% and reads SHAs from the workflow environment', () => {
    const logs = [];
    runProjectedTreeBudget({
      env: { PR_BASE_SHA: BASE, PR_HEAD_SHA: HEAD, PR_MERGE_BASE: MERGE_BASE },
      git: fakeGit({
        [BASE_TREE]: [regular(100)],
        [MERGE_BASE_TREE]: [regular(100)],
        [HEAD_TREE]: [regular(150)],
      }),
      log: line => logs.push(line),
    });
    expect(logs).toEqual([
      'Projected combined tree: PASS — 150 tracked regular-file bytes (base 100 + PR delta +50).',
    ]);
    expect(() =>
      runProjectedTreeBudget({
        env: { PR_BASE_SHA: BASE, PR_HEAD_SHA: HEAD },
        git: fakeGit({}),
        log: () => {},
      })
    ).toThrow(/PR_MERGE_BASE is not a full SHA/);
  });

  it('formats the 95% early-warning threshold and over-budget headroom', () => {
    expect(trackedBytesBudgetWarning(95, 100)).toBeNull();
    expect(trackedBytesBudgetWarning(96, 100)).toMatch(/96\.00% .*headroom/);
    expect(trackedBytesBudgetWarning(2_100_000, 1_000_000)).toMatch(
      /1\.10 MB over budget/
    );
  });
});
