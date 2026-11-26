import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';

export function createWorktreeFixtures(makeTempDir, writeExecutable) {
  function makeToolStubs({
    nodeVersion = 'v24.21.0',
    pnpmVersion = '9.15.9',
  } = {}) {
    const bin = makeTempDir('jovie-setup-health-bin-');
    writeExecutable(join(bin, 'node'), `#!/bin/sh\necho ${nodeVersion}\n`);
    writeExecutable(join(bin, 'pnpm'), `#!/bin/sh\necho ${pnpmVersion}\n`);
    return bin;
  }

  function makeWorktree() {
    const root = makeTempDir('jovie-setup-health-repo-');
    writeFileSync(
      join(root, 'package.json'),
      '{"name":"fixture","packageManager":"pnpm@9.15.9"}\n'
    );
    writeFileSync(join(root, '.nvmrc'), '24.21.0\n');
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n');
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    const git = spawnSync('git', ['-c', 'init.defaultBranch=main', 'init'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(git.status, git.stderr).toBe(0);
    spawnSync('git', ['config', 'user.email', 'setup-health@example.com'], {
      cwd: root,
    });
    spawnSync('git', ['config', 'user.name', 'Setup Health'], { cwd: root });
    const add = spawnSync(
      'git',
      [
        'add',
        '.nvmrc',
        'package.json',
        'pnpm-lock.yaml',
        'pnpm-workspace.yaml',
      ],
      {
        cwd: root,
        encoding: 'utf8',
      }
    );
    expect(add.status, add.stderr).toBe(0);
    return root;
  }

  function makeLinkedWorktreeWithBarePrimary() {
    const primary = makeWorktree();
    const commit = spawnSync('git', ['commit', '-m', 'fixture'], {
      cwd: primary,
      encoding: 'utf8',
    });
    expect(commit.status, commit.stderr).toBe(0);

    const linked = join(primary, 'linked-worktree');
    const add = spawnSync(
      'git',
      ['worktree', 'add', '-b', 'linked-fixture', linked],
      {
        cwd: primary,
        encoding: 'utf8',
      }
    );
    expect(add.status, add.stderr).toBe(0);

    const makeBare = spawnSync('git', ['config', 'core.bare', 'true'], {
      cwd: primary,
      encoding: 'utf8',
    });
    expect(makeBare.status, makeBare.stderr).toBe(0);
    return { linked, primary };
  }

  return { makeWorktree, makeLinkedWorktreeWithBarePrimary, makeToolStubs };
}
