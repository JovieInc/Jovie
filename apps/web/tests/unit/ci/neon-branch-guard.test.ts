import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  evaluateBranchDeletion,
  evaluateBranchNameAgainstInventory,
  isReservedBranchName,
} from '../../../../../scripts/ci/neon-branch-guard.mjs';
import {
  assertBranchDeletable,
  listAllBranches,
  reapCompletedWorkflowBranches,
} from '../../../../../scripts/ci/neon-orphan-reaper.mjs';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const RUN = '29202024696';
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

const branch = (name: string, extra: Record<string, unknown> = {}) => ({
  id: `br-${name}`,
  name,
  default: false,
  protected: false,
  ...extra,
});

describe('Neon branch deletion guard', () => {
  it('never allows default, protected, reserved or backup branches', () => {
    expect(evaluateBranchDeletion(branch('x', { default: true }))).toEqual({
      deletable: false,
      reason: 'default-branch',
    });
    expect(evaluateBranchDeletion(branch('x', { protected: true }))).toEqual({
      deletable: false,
      reason: 'protected-branch',
    });
    for (const name of [
      'production',
      'Production',
      'prod',
      'main',
      'MAIN',
      'master',
      'br-main',
      'br-production',
      'backup',
      'backup-2026-10-24',
      'Backup-pre-migration',
      'backup_manual',
      'backup.1',
    ]) {
      expect(evaluateBranchDeletion(branch(name))).toMatchObject({
        deletable: false,
        reason: 'reserved-name',
      });
    }
  });

  it('keeps ephemeral CI shapes deletable, including main-<run>-<attempt>', () => {
    for (const name of [
      `main-${RUN}-1`,
      `pr-12-${RUN}`,
      `e2e-smoke-${RUN}-1`,
      'backups-are-not-a-prefix-match',
    ]) {
      expect(isReservedBranchName(name)).toBe(name === '');
      expect(evaluateBranchDeletion(branch(name)).deletable).toBe(true);
    }
  });

  it('fails closed when flags or the record are unreadable', () => {
    expect(evaluateBranchDeletion(null).deletable).toBe(false);
    expect(evaluateBranchDeletion({ id: 'br-1', name: 'a' })).toEqual({
      deletable: false,
      reason: 'protection-flags-unreadable',
    });
    expect(
      evaluateBranchDeletion({
        id: 'br-1',
        name: 'a',
        default: 'false',
        protected: false,
      }).deletable
    ).toBe(false);
    expect(
      evaluateBranchDeletion({
        id: 'br-1',
        name: '',
        default: false,
        protected: false,
      }).deletable
    ).toBe(false);
  });

  it('resolves names against the inventory and rejects unknown or ambiguous names', () => {
    const inventory = [
      branch('a'),
      branch('dup'),
      branch('dup'),
      branch('p', { protected: true }),
    ];
    expect(evaluateBranchNameAgainstInventory(inventory, 'a').deletable).toBe(
      true
    );
    expect(evaluateBranchNameAgainstInventory(inventory, 'p').reason).toBe(
      'protected-branch'
    );
    expect(evaluateBranchNameAgainstInventory(inventory, 'dup').reason).toBe(
      'ambiguous-name'
    );
    expect(evaluateBranchNameAgainstInventory(inventory, 'gone').reason).toBe(
      'not-in-inventory'
    );
    expect(evaluateBranchNameAgainstInventory(undefined, 'a').reason).toBe(
      'inventory-unreadable'
    );
  });
});

describe('Neon branch inventory reader', () => {
  it('follows pagination cursors', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        branches: [branch('a')],
        pagination: { next: 'c1' },
      })
      .mockResolvedValueOnce({ branches: [branch('b')] });
    const all = await listAllBranches({
      neonApiKey: 'k',
      neonProjectId: 'p',
      request,
    });
    expect(all.map(b => b.name)).toEqual(['a', 'b']);
    expect(request.mock.calls[1][0]).toContain('cursor=c1');
  });

  it('assertBranchDeletable fails closed on API errors, malformed payloads and missing config', async () => {
    const boom = vi.fn().mockRejectedValue(new Error('500'));
    expect(
      await assertBranchDeletable({
        branchName: 'x',
        neonApiKey: 'k',
        neonProjectId: 'p',
        request: boom,
      })
    ).toEqual({ deletable: false, reason: 'inventory-unreadable' });
    const malformed = vi.fn().mockResolvedValue({ nope: true });
    expect(
      (
        await assertBranchDeletable({
          branchName: 'x',
          neonApiKey: 'k',
          neonProjectId: 'p',
          request: malformed,
        })
      ).deletable
    ).toBe(false);
    expect(
      (
        await assertBranchDeletable({
          branchName: 'x',
          neonApiKey: '',
          neonProjectId: 'p',
        })
      ).reason
    ).toBe('missing-configuration');
  });

  it('CLI exits non-zero for production, a protected branch, and an unreadable inventory', () => {
    const stub = (body: string) =>
      `data:text/javascript,${encodeURIComponent(body)}`;
    const run = (name: string, fetchBody: string) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          stub(fetchBody),
          resolve(repoRoot, 'scripts/ci/neon-orphan-reaper.mjs'),
          '--assert-deletable',
          name,
        ],
        {
          env: { ...process.env, NEON_API_KEY: 'k', NEON_PROJECT_ID: 'p' },
          encoding: 'utf8',
        }
      );
    const ok = (branches: unknown[]) =>
      `globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ branches: ${JSON.stringify(branches)} }) });`;
    const down = 'globalThis.fetch = async () => ({ ok: false, status: 503 });';

    expect(
      run('production', ok([branch('production', { default: true })])).status
    ).toBe(1);
    expect(
      run('keep-me', ok([branch('keep-me', { protected: true })])).status
    ).toBe(1);
    expect(run('pr-1-' + RUN, down).status).toBe(1);
    expect(run('pr-1-' + RUN, ok([branch('pr-1-' + RUN)])).status).toBe(0);
  });
});

describe('Deliberate-red: legacy reaper would delete these, the guarded one must not', () => {
  const completed = { id: Number(RUN), status: 'completed' };

  async function reap(
    branches: unknown[],
    protectedBranches = new Set<string>()
  ) {
    const deletes: string[] = [];
    const request = vi.fn(
      async (url: string, options: { method?: string } = {}) => {
        if (url.includes('/branches?')) {
          return {
            branches: branches as Array<{
              id?: string;
              name?: string;
              default?: boolean;
              protected?: boolean;
            }>,
          };
        }
        if (url.includes('/endpoints?')) return { endpoints: [] };
        if (url.includes('/actions/runs/'))
          return { ...completed, head_branch: 'release' };
        if (options.method === 'DELETE') {
          deletes.push(decodeURIComponent(url.split('/branches/')[1]));
          return null;
        }
        throw new Error(`unexpected ${url}`);
      }
    );
    await reapCompletedWorkflowBranches({
      neonApiKey: 'k',
      neonProjectId: 'p',
      githubToken: 't',
      repository: 'o/r',
      currentRunId: '1',
      protectedBranches,
      request,
      log: () => {},
    });
    return deletes;
  }

  it('keeps a default branch whose name looks like a completed-run branch', async () => {
    // Old code: name matches the legacy owner-prefix shape, run is completed,
    // callers omit it from protectedBranches => DELETE of the default branch.
    const prodLike = branch(`release-${RUN}-1`, { default: true });
    expect(await reap([prodLike])).toEqual([]);
  });

  it('keeps a Neon-protected branch regardless of caller lists', async () => {
    const protectedBranch = branch(`release-${RUN}-1`, { protected: true });
    expect(await reap([protectedBranch])).toEqual([]);
  });

  it('keeps backup-* branches even when the name carries a completed run id', async () => {
    const backup = branch(`backup-${RUN}-1`);
    expect(await reap([backup])).toEqual([]);
  });

  it('keeps production/main/prod when callers omit them from the skip list', async () => {
    const reserved = ['production', 'prod', 'main'].map(n => branch(n));
    expect(await reap(reserved, new Set(['development']))).toEqual([]);
  });

  it('keeps branches whose flags are missing from the payload', async () => {
    const noFlags = { id: 'br-x', name: `release-${RUN}-1` };
    expect(await reap([noFlags])).toEqual([]);
  });

  it('still deletes a genuinely ephemeral completed-run branch', async () => {
    const ephemeral = branch(`release-${RUN}-1`);
    expect(await reap([ephemeral])).toEqual([`br-release-${RUN}-1`]);
  });
});

describe('Neon deleters are wired through the guard', () => {
  it('cleanup action asserts deletable before every delete and hard-codes the floor', () => {
    const action = read('.github/actions/neon-branch-cleanup/action.yml');
    const assertAt = action.indexOf('--assert-deletable');
    const deleteAt = action.indexOf('neonctl branches delete');
    expect(assertAt).toBeGreaterThan(0);
    expect(assertAt).toBeLessThan(deleteAt);
    expect(action).toContain('production|prod|main|master');
    expect(action).toContain('backup-*');
  });

  it('every protected-branch list in CI names main, production and prod', () => {
    const grep = spawnSync(
      'grep',
      [
        '-rnE',
        '(protected_branches|PROTECTED_BRANCHES):',
        '.github',
        '--include=*.yml',
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .stdout.split('\n')
      .filter(Boolean);
    expect(grep.length).toBeGreaterThanOrEqual(8);
    for (const line of grep) {
      if (/_branches:$|inputs.protected_branches/i.test(line.trim())) continue; // declaration or passthrough
      expect(line, line).toMatch(/\bmain\b/);
      expect(line, line).toMatch(/\bproduction\b/);
      expect(line, line).toMatch(/[:, \x27]prod[,\x27 ]/);
    }
  });

  it('PR-close cleanup checks the guard for prefix and exact matches', () => {
    const wf = read('.github/workflows/neon-ephemeral-branch-cleanup.yml');
    expect(wf.match(/--assert-deletable/g)?.length).toBe(2);
    expect(wf).toContain('production|prod|br-main');
  });

  it('no workflow deletes a Neon branch without a run-id-derived name or the guard', () => {
    // The run-scoped deleters build BRANCH_NAME from github.run_id only; they
    // cannot name production/backup. Any new deleter must be listed here.
    const allowed = new Map([
      ['.github/actions/neon-branch-cleanup/action.yml', 'guard'],
      ['.github/workflows/neon-ephemeral-branch-cleanup.yml', 'guard'],
      ['.github/workflows/visual-regression.yml', 'run-id'],
      ['.github/workflows/e2e-full-matrix.yml', 'run-id'],
      ['.github/workflows/nightly-tests.yml', 'run-id'],
    ]);
    const out = spawnSync(
      'grep',
      [
        '-rl',
        'neonctl branches delete',
        '.github',
        '--include=*.yml',
        '--include=*.sh',
      ],
      { cwd: repoRoot, encoding: 'utf8' }
    )
      .stdout.split('\n')
      .filter(Boolean);
    for (const file of out) expect(allowed.has(file), file).toBe(true);
    for (const [file, kind] of allowed) {
      if (kind !== 'run-id') continue;
      const line = read(file)
        .split('\n')
        .find(l => /^\s*BRANCH_NAME:/.test(l));
      expect(line, file).toMatch(/(visual-regression|nightly-e2e|e2e-full)-/);
      expect(line, file).toContain('github.run_id');
    }
  });
});
