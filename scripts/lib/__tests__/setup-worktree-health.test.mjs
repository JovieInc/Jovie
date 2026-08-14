import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const helperPath = resolve(repoRoot, 'scripts/lib/setup-worktree-health.sh');
const setupSh = readFileSync(resolve(repoRoot, 'scripts/setup.sh'), 'utf8');
const sessionStartSh = readFileSync(
  resolve(repoRoot, '.claude/hooks/session-start.sh'),
  'utf8'
);
const codexSetupSh = readFileSync(
  resolve(repoRoot, 'scripts/codex-setup.sh'),
  'utf8'
);

const tempRoots = [];
afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function makeTempDir(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeExecutable(filePath, contents) {
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

function makeToolStubs({
  nodeVersion = 'v22.23.1',
  pnpmVersion = '9.15.4',
} = {}) {
  const bin = makeTempDir('jovie-setup-health-bin-');
  writeExecutable(join(bin, 'node'), `#!/bin/sh\necho ${nodeVersion}\n`);
  writeExecutable(join(bin, 'pnpm'), `#!/bin/sh\necho ${pnpmVersion}\n`);
  return bin;
}

function makeWorktree() {
  const root = makeTempDir('jovie-setup-health-repo-');
  writeFileSync(join(root, 'package.json'), '{"name":"fixture"}\n');
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
    ['add', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'],
    {
      cwd: root,
      encoding: 'utf8',
    }
  );
  expect(add.status, add.stderr).toBe(0);
  return root;
}

/**
 * @param {string} script
 * @param {{
 *   cwd?: string,
 *   env?: Record<string, string | undefined>,
 *   pathPrefix?: string,
 * }} [options]
 */
function runHelper(script, { cwd = repoRoot, env = {}, pathPrefix } = {}) {
  return spawnSync('bash', ['-c', script], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      PATH: pathPrefix ? `${pathPrefix}:${process.env.PATH}` : process.env.PATH,
    },
  });
}

function hashDeps(worktree) {
  const result = runHelper(
    `set -euo pipefail
     . ${JSON.stringify(helperPath)}
     jovie_setup_hash_dependency_inputs ${JSON.stringify(worktree)}`
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function seedHealthyCache(worktree) {
  mkdirSync(join(worktree, 'node_modules/.cache/jovie-setup'), {
    recursive: true,
  });
  writeFileSync(
    join(worktree, 'node_modules/.modules.yaml'),
    'hoistPattern: []\n'
  );
  writeFileSync(
    join(worktree, 'node_modules/.cache/jovie-setup/deps.sha256'),
    `${hashDeps(worktree)}\n`
  );
}

/**
 * @param {string} worktree
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   pathPrefix?: string,
 * }} [options]
 */
function evaluateHealth(worktree, { env = {}, pathPrefix } = {}) {
  const result = runHelper(
    `set -euo pipefail
     REPO_ROOT=${JSON.stringify(worktree)}
     . ${JSON.stringify(helperPath)}
     if jovie_setup_worktree_healthy "$REPO_ROOT"; then
       echo skip
     else
       echo run
     fi`,
    { env, pathPrefix }
  );
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

describe('setup worktree health skip', () => {
  it('skips when fingerprint matches and Node/pnpm pins are ok', () => {
    const worktree = makeWorktree();
    seedHealthyCache(worktree);
    expect(evaluateHealth(worktree, { pathPrefix: makeToolStubs() })).toBe(
      'skip'
    );
  });

  it('runs full setup when the deps fingerprint misses', () => {
    const worktree = makeWorktree();
    seedHealthyCache(worktree);
    writeFileSync(
      join(worktree, 'node_modules/.cache/jovie-setup/deps.sha256'),
      '0'.repeat(64) + '\n'
    );
    expect(evaluateHealth(worktree, { pathPrefix: makeToolStubs() })).toBe(
      'run'
    );
  });

  it('runs full setup when node_modules is missing', () => {
    const worktree = makeWorktree();
    expect(evaluateHealth(worktree, { pathPrefix: makeToolStubs() })).toBe(
      'run'
    );
  });

  it('runs full setup when the pnpm pin is stale', () => {
    const worktree = makeWorktree();
    seedHealthyCache(worktree);
    expect(
      evaluateHealth(worktree, {
        pathPrefix: makeToolStubs({ pnpmVersion: '9.15.3' }),
      })
    ).toBe('run');
  });

  it('runs full setup when the Node pin is stale', () => {
    const worktree = makeWorktree();
    seedHealthyCache(worktree);
    expect(
      evaluateHealth(worktree, {
        pathPrefix: makeToolStubs({ nodeVersion: 'v22.14.0' }),
      })
    ).toBe('run');
  });

  it('runs full setup when JOVIE_SETUP_FORCE=1', () => {
    const worktree = makeWorktree();
    seedHealthyCache(worktree);
    expect(
      evaluateHealth(worktree, {
        pathPrefix: makeToolStubs(),
        env: { JOVIE_SETUP_FORCE: '1' },
      })
    ).toBe('run');
  });
});

describe('SessionStart still uses setup.sh for the skip', () => {
  it('setup.sh sources the helper and cheap-exits before Doppler/Clerk/migrations', () => {
    expect(setupSh).toContain('scripts/lib/setup-worktree-health.sh');
    expect(setupSh).toContain('jovie_setup_worktree_healthy');
    expect(setupSh).toContain('Worktree already healthy — skipped setup body');
    expect(setupSh.indexOf('jovie_setup_worktree_healthy')).toBeLessThan(
      setupSh.indexOf('── Doppler auth')
    );
    expect(setupSh.indexOf('jovie_setup_worktree_healthy')).toBeLessThan(
      setupSh.indexOf('── Dev Clerk ID sync')
    );
    expect(setupSh.indexOf('jovie_setup_worktree_healthy')).toBeLessThan(
      setupSh.indexOf('── Migration drift check')
    );
  });

  it('Claude SessionStart still calls setup.sh and documents the warm skip', () => {
    expect(sessionStartSh).toContain('scripts/setup.sh');
    expect(sessionStartSh).toContain(
      'cheap-exits when the worktree is already healthy'
    );
  });

  it('Codex SessionStart still runs gbrain sync after setup.sh', () => {
    expect(codexSetupSh).toContain('scripts/setup.sh');
    expect(codexSetupSh).toContain('codex-gbrain-sync.sh');
    expect(codexSetupSh.indexOf('scripts/setup.sh')).toBeLessThan(
      codexSetupSh.indexOf('codex-gbrain-sync.sh')
    );
    expect(codexSetupSh).toContain('GBrain sync');
    expect(codexSetupSh).toContain('independent and always runs');
  });
});
