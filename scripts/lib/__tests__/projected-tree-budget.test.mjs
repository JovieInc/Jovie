import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseTrackedRegularTree } from '../merge-group-member-policy.mjs';
import {
  enforceProjectedTreeBudget,
  parseGitLsTree,
  runProjectedTreeBudget,
} from '../projected-tree-budget.mjs';
import {
  HYGIENE_LIMITS,
  logTrackedBytesBudgetWarnings,
  trackedBytesBudgetPlanWarning,
  trackedBytesBudgetWarning,
  trackedBytesBudgetWarnings,
} from '../repo-hygiene-limits.mjs';

const BASE = '1'.repeat(40);
const HEAD = '3'.repeat(40);
const MERGE_BASE = '5'.repeat(40);
const BASE_TREE = '6'.repeat(40);
const MERGE_BASE_TREE = '7'.repeat(40);
const HEAD_TREE = '8'.repeat(40);
const MERGED_TREE = '9'.repeat(40);
const MAX = HYGIENE_LIMITS.maxTrackedBytes;

function lsTree(entries) {
  return entries
    .map(
      ({ mode, path, size, type }) =>
        `${mode} ${type} ${'f'.repeat(40)} ${String(size ?? '-').padStart(7)}\t${path}\0`
    )
    .join('');
}

function fakeGit(trees, { conflict = false } = {}) {
  const treeFor = {
    [BASE]: BASE_TREE,
    [MERGE_BASE]: MERGE_BASE_TREE,
    [HEAD]: HEAD_TREE,
    [MERGED_TREE]: MERGED_TREE,
  };
  return args => {
    if (args[0] === 'rev-parse') {
      return `${treeFor[args[2].replace('^{tree}', '')]}\n`;
    }
    if (args[0] === 'merge-tree') {
      if (conflict) throw Object.assign(new Error('conflict'), { status: 1 });
      return `${MERGED_TREE}\n`;
    }
    if (args[0] === 'ls-tree') return lsTree(trees[args.at(-1)]);
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
}

function regular(size, path = 'payload.bin') {
  return { mode: '100644', path, size, type: 'blob' };
}

describe('source-PR projected combined-tree budget', () => {
  it('stops publication and qualification on a rejected tree budget', () => {
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const root = mkdtempSync(join(tmpdir(), 'pre-push-budget-'));
    try {
      for (const directory of ['scripts/hooks', 'scripts/lib', 'bin'])
        mkdirSync(join(root, directory), { recursive: true });
      for (const file of ['pre-push-gate.sh', 'resolve-repo-node.sh'])
        copyFileSync(
          join(repoRoot, 'scripts/hooks', file),
          join(root, 'scripts/hooks', file)
        );
      copyFileSync(join(repoRoot, '.nvmrc'), join(root, '.nvmrc'));
      writeFileSync(
        join(root, 'scripts/lib/projected-tree-budget.mjs'),
        `
import assert from 'node:assert/strict';
assert.deepEqual(process.argv.slice(2), ['--local']);
console.error('fixture tree exceeds byte budget');
process.exit(17);
`
      );
      writeFileSync(join(root, 'bin/pnpm'), '#!/usr/bin/env bash\nexit 0\n', {
        mode: 0o755,
      });
      for (const mode of ['affected', 'publication']) {
        const result = spawnSync(
          'bash',
          [join(root, 'scripts/hooks/pre-push-gate.sh'), mode],
          {
            cwd: repoRoot,
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: `${join(root, 'bin')}:${process.env.PATH}`,
              JOVIE_PREFLIGHT_DEPTH: undefined,
              JOVIE_SKIP_PRE_PUSH_GATE: '',
            },
          }
        );
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(17);
        expect(result.stderr).toMatch(/fixture tree exceeds byte budget/);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
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
      [MERGED_TREE]: [regular(MAX - 260), regular(261, 'new.txt')],
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
      `${MAX + 1} bytes of tracked regular files (merged tree; base ${MAX - 260} +261) exceeds the ${MAX}-byte combined-tree budget`
    );
  });

  it('requires merging base cleanup when only the stale PR head exceeds budget', () => {
    const logs = [];
    expect(() =>
      enforceProjectedTreeBudget({
        baseSha: BASE,
        git: fakeGit({
          [BASE_TREE]: [regular(80)],
          [HEAD_TREE]: [regular(120)],
          [MERGED_TREE]: [regular(90)],
        }),
        headSha: HEAD,
        log: line => logs.push(line),
        maxTrackedBytes: 100,
        mergeBaseSha: MERGE_BASE,
      })
    ).toThrow(
      'PR head has 120 tracked regular-file bytes, exceeding the 100-byte repository budget, while the merged tree fits at 90 bytes; merge the current base branch into the PR branch to incorporate its cleanup, then rerun the guard'
    );
    expect(logs).toEqual([]);
  });

  it('accepts the same PR after it incorporates base cleanup', () => {
    expect(
      enforceProjectedTreeBudget({
        baseSha: BASE,
        git: fakeGit({
          [BASE_TREE]: [regular(80)],
          [HEAD_TREE]: [regular(100)],
          [MERGED_TREE]: [regular(100)],
        }),
        headSha: HEAD,
        log: () => {},
        maxTrackedBytes: 100,
        mergeBaseSha: MERGE_BASE,
      })
    ).toEqual({ baseBytes: 80, bytes: 100, delta: 20 });
  });

  it('passes a shrinking PR near budget with a headroom warning', () => {
    const logs = [];
    const result = enforceProjectedTreeBudget({
      baseSha: BASE,
      git: fakeGit({
        [BASE_TREE]: [regular(MAX - 260)],
        [HEAD_TREE]: [regular(MAX - 1_260)],
        [MERGED_TREE]: [regular(MAX - 1_260)],
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
        [HEAD_TREE]: [regular(150)],
        [MERGED_TREE]: [regular(150)],
      }),
      log: line => logs.push(line),
    });
    expect(logs).toEqual([
      'Projected combined tree: PASS — 150 tracked regular-file bytes (merged tree; base 100 +50).',
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

  it('stays quiet at or below the 80% plan line', () => {
    expect(trackedBytesBudgetPlanWarning(80, 100)).toBeNull();
    expect(trackedBytesBudgetWarnings(80, 100)).toEqual([]);
  });

  it('plans the next prune in the 80-95% band without failing', () => {
    expect(trackedBytesBudgetWarning(81, 100)).toBeNull();
    const plan = trackedBytesBudgetPlanWarning(81, 100);
    expect(plan).toMatch(/81\.00% .*headroom/);
    expect(plan).toMatch(/80% plan line \(under 20% headroom\)/);
    expect(trackedBytesBudgetWarnings(81, 100)).toEqual([plan]);
  });

  it('keeps the shrink-now warning first and silent plan level above 95%', () => {
    expect(trackedBytesBudgetPlanWarning(MAX - 1)).toBeNull();
    const logs = [];
    logTrackedBytesBudgetWarnings(MAX - 1, line => logs.push(line), 'X: ');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatch(/^::warning::X: .*shrink tracked bytes/);
  });

  it('emits the plan warning from the projected combined-tree check', () => {
    const logs = [];
    const bytes = Math.floor(MAX * 0.92);
    const result = enforceProjectedTreeBudget({
      baseSha: BASE,
      git: fakeGit({
        [BASE_TREE]: [regular(bytes - 10)],
        [HEAD_TREE]: [regular(bytes)],
        [MERGED_TREE]: [regular(bytes)],
      }),
      headSha: HEAD,
      log: line => logs.push(line),
      mergeBaseSha: MERGE_BASE,
    });
    expect(result.bytes).toBe(bytes);
    expect(logs[0]).toMatch(
      /^::warning::Projected combined tree: .*80% plan line/
    );
    expect(logs.at(-1)).toMatch(/^Projected combined tree: PASS/);
  });

  it('selects the same lowest merge base as CI in a criss-cross history', () => {
    const lowest = '4'.repeat(40);
    const treeGit = fakeGit({
      [BASE_TREE]: [regular(100)],
      [HEAD_TREE]: [regular(150)],
      [MERGED_TREE]: [regular(150)],
    });
    const git = args => {
      if (
        args.join(' ') ===
        'rev-parse --verify refs/remotes/origin/main^{commit}'
      )
        return BASE;
      if (args.join(' ') === 'rev-parse --verify HEAD^{commit}') return HEAD;
      if (args[0] === 'merge-base') {
        expect(args).toEqual(['merge-base', '--all', BASE, HEAD]);
        return `${MERGE_BASE}\n${lowest}\n`;
      }
      if (args[0] === 'merge-tree')
        expect(args).toContain(`--merge-base=${lowest}`);
      return treeGit(args);
    };
    expect(runProjectedTreeBudget({ local: true, git, log: () => {} })).toEqual(
      { baseBytes: 100, bytes: 150, delta: 50 }
    );
  });
  it('skips with a warning when the PR head conflicts with the base', () => {
    const logs = [];
    expect(
      enforceProjectedTreeBudget({
        baseSha: BASE,
        git: fakeGit({ [BASE_TREE]: [regular(100)] }, { conflict: true }),
        headSha: HEAD,
        log: line => logs.push(line),
        mergeBaseSha: MERGE_BASE,
      })
    ).toBeNull();
    expect(logs[0]).toMatch(/^::warning::Projected combined tree: skipped/);
  });

  it('measures the real merged tree when base and PR touch the same path', () => {
    // Both sides delete the same 1000-byte file and the PR adds 800 bytes.
    // Scalar base + (head - mergeBase) arithmetic counts the deletion twice
    // and undercounts the merged tree by 1000 bytes.
    const dir = mkdtempSync(join(tmpdir(), 'projected-tree-'));
    const git = args =>
      execFileSync('git', ['-C', dir, ...args], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 't',
          GIT_AUTHOR_EMAIL: 't@example.com',
          GIT_COMMITTER_NAME: 't',
          GIT_COMMITTER_EMAIL: 't@example.com',
        },
      });
    try {
      git(['init', '-q', '-b', 'main']);
      writeFileSync(join(dir, 'shared.bin'), 'x'.repeat(1_000));
      writeFileSync(join(dir, 'keep.bin'), 'k'.repeat(500));
      git(['add', '.']);
      git(['commit', '-qm', 'root']);
      const mergeBase = git(['rev-parse', 'HEAD']).trim();
      git(['rm', '-q', 'shared.bin']);
      git(['commit', '-qm', 'base deletes shared']);
      const base = git(['rev-parse', 'HEAD']).trim();
      git(['checkout', '-q', '-b', 'pr', mergeBase]);
      git(['rm', '-q', 'shared.bin']);
      writeFileSync(join(dir, 'added.bin'), 'a'.repeat(800));
      git(['add', '.']);
      git(['commit', '-qm', 'pr deletes shared and adds 800']);
      const head = git(['rev-parse', 'HEAD']).trim();
      const result = enforceProjectedTreeBudget({
        baseSha: base,
        git,
        headSha: head,
        log: () => {},
        maxTrackedBytes: 10_000,
        mergeBaseSha: mergeBase,
      });
      expect(result).toEqual({ baseBytes: 500, bytes: 1_300, delta: 800 });
      // A local pre-push check must resolve real refs, ignoring stale CI env.
      expect(() =>
        runProjectedTreeBudget({ local: true, git, log: () => {} })
      ).toThrow();
      git(['update-ref', 'refs/remotes/origin/main', base]);
      expect(
        runProjectedTreeBudget({
          local: true,
          env: { PR_BASE_SHA: 'stale', PR_HEAD_SHA: 'stale' },
          git,
          log: () => {},
        })
      ).toEqual(result);
      const output = execFileSync(
        process.execPath,
        [
          new URL('../projected-tree-budget.mjs', import.meta.url).pathname,
          '--local',
        ],
        { cwd: dir, encoding: 'utf8' }
      );
      expect(output).toContain('PASS — 1300 tracked regular-file bytes');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
