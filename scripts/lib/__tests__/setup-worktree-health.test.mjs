import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorktreeFixtures } from './setup-worktree-health-fixtures.mjs';

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
const { makeWorktree, makeLinkedWorktreeWithBarePrimary } =
  createWorktreeFixtures(makeTempDir);
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
  nodeVersion = 'v24.21.0',
  pnpmVersion = '9.15.9',
} = {}) {
  const bin = makeTempDir('jovie-setup-health-bin-');
  writeExecutable(join(bin, 'node'), `#!/bin/sh\necho ${nodeVersion}\n`);
  writeExecutable(join(bin, 'pnpm'), `#!/bin/sh\necho ${pnpmVersion}\n`);
  return bin;
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

describe('GitHub CLI api --slurp capability', () => {
  it.each([
    ['plain flag row', '      --slurp  Return all pages in an array\n', 0, 0],
    ['plain flag at end of line', '      --slurp\n', 0, 0],
    [
      'optional boolean flag row',
      '      --slurp[=true|false]  Return all pages in an array\n',
      0,
      0,
    ],
    ['optional boolean at end of line', '      --slurp[=true|false]\n', 0, 0],
    ['unsupported CLI', '      --paginate  Make additional requests\n', 0, 1],
    ['examples only', '  gh api repos/example --paginate --slurp\n', 0, 1],
    ['similarly named flag', '      --slurped  Not the required flag\n', 0, 1],
    ['annotated flag suffix', '      --slurp[=true|false]extra\n', 0, 1],
    ['malformed annotation', '      --slurp[=false|true]\n', 0, 1],
    ['failed plain help process', '      --slurp\n', 1, 1],
    ['failed annotated help process', '      --slurp[=true|false]\n', 1, 1],
  ])('%s', (_name, help, helpStatus, expectedStatus) => {
    const bin = makeTempDir('jovie-setup-gh-bin-');
    writeExecutable(
      join(bin, 'gh'),
      '#!/bin/sh\n' +
        '[ "$#" = 2 ] && [ "$1" = api ] && [ "$2" = --help ] || exit 97\n' +
        'printf "%s" "$GH_HELP_FIXTURE"\n' +
        'exit "$GH_HELP_STATUS"\n'
    );
    const result = runHelper('. "$HELPER_PATH"\njovie_setup_gh_api_slurp_ok', {
      pathPrefix: bin,
      env: {
        HELPER_PATH: helperPath,
        GH_HELP_FIXTURE: help,
        GH_HELP_STATUS: String(helpStatus),
      },
    });
    expect(result.status, result.stderr).toBe(expectedStatus);
    if (expectedStatus === 0) expect(result.stderr).toBe('');
    else expect(result.stderr).toContain('must support --slurp');
  });
});

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

describe('linked worktree Git repair', () => {
  it('pins only the linked worktree to non-bare before normal Git commands', () => {
    const { linked, primary } = makeLinkedWorktreeWithBarePrimary();
    const result = runHelper(
      `set -euo pipefail
       . ${JSON.stringify(helperPath)}
       jovie_setup_repair_linked_worktree_git_config ${JSON.stringify(linked)}
       git -C ${JSON.stringify(linked)} rev-parse --is-inside-work-tree
       git -C ${JSON.stringify(linked)} config --worktree --get core.bare
       git -C ${JSON.stringify(primary)} config --get core.bare
       git -C ${JSON.stringify(primary)} config --get extensions.worktreeConfig`
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual([
      'true',
      'false',
      'true',
      'true',
    ]);
  });
});

describe('SessionStart still uses setup.sh for the skip', () => {
  it('setup.sh sources the helper and cheap-exits before Doppler/Clerk/migrations', () => {
    expect(setupSh).toContain('scripts/lib/setup-worktree-health.sh');
    expect(setupSh).toContain('jovie_setup_worktree_healthy');
    expect(setupSh).toContain('jovie_setup_repair_linked_worktree_git_config');
    expect(setupSh).toContain('Worktree already healthy — skipped setup body');
    expect(setupSh.indexOf('jovie_setup_gh_api_slurp_ok')).toBeLessThan(
      setupSh.indexOf('jovie_setup_worktree_healthy')
    );
    expect(
      setupSh.indexOf('jovie_setup_repair_linked_worktree_git_config')
    ).toBeLessThan(setupSh.indexOf('git rev-parse --is-inside-work-tree'));
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

describe('one frozen dependency install for every agent session start (JOV-12623)', () => {
  const pin = JSON.parse(
    readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
  ).packageManager.replace(/^pnpm@/u, '');
  const helperSh = readFileSync(helperPath, 'utf8');
  const readPin = worktree =>
    runHelper(`. ${JSON.stringify(helperPath)}
      jovie_setup_required_pnpm ${JSON.stringify(worktree)}`);
  const setPin = (worktree, packageManager) =>
    writeFileSync(
      join(worktree, 'package.json'),
      `${JSON.stringify({ name: 'fixture', packageManager }, null, 2)}\n`
    );

  it('setup.sh and SessionStart call the shared frozen install; nothing hardcodes pnpm', () => {
    for (const script of [setupSh, sessionStartSh]) {
      expect(script).toContain('scripts/codex-cloud-setup.mjs" install');
      expect(script).not.toMatch(/^\s*pnpm install\b/mu);
    }
    expect(pin).toMatch(/^\d+\.\d+\.\d+$/u);
    for (const script of [setupSh, sessionStartSh, helperSh]) {
      expect(script).not.toContain(pin);
      expect(script).not.toMatch(/pnpm@\d+\.\d+\.\d+/u);
    }
  });

  it('reads the pnpm pin from packageManager and the warm skip follows it', () => {
    const worktree = makeWorktree();
    expect(readPin(worktree).stdout.trim()).toBe('9.15.9');
    for (const packageManager of [undefined, 'pnpm@latest']) {
      setPin(worktree, packageManager);
      expect(readPin(worktree)).toMatchObject({ status: 1, stdout: '' });
    }
    setPin(worktree, 'pnpm@10.2.1');
    expect(readPin(worktree).stdout.trim()).toBe('10.2.1');
    seedHealthyCache(worktree);
    const health = pnpmVersion =>
      evaluateHealth(worktree, { pathPrefix: makeToolStubs({ pnpmVersion }) });
    expect(health('9.15.9')).toBe('run');
    expect(health('10.2.1')).toBe('skip');
  });
});

describe('package prepare hook lifecycle', () => {
  const rootPackage = JSON.parse(
    readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
  );
  const prepare = rootPackage.scripts.prepare;
  const configurator = readFileSync(
    resolve(repoRoot, 'scripts/hooks/configure-git-hooks.sh'),
    'utf8'
  );

  function fixture() {
    const root = makeTempDir('jovie-prepare-hooks-');
    mkdirSync(join(root, 'scripts/hooks'), { recursive: true });
    mkdirSync(join(root, '.husky'));
    writeFileSync(
      join(root, 'scripts/hooks/configure-git-hooks.sh'),
      configurator
    );
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'prepare-fixture',
        private: true,
        scripts: { prepare },
      })
    );
    writeExecutable(
      join(root, '.husky/pre-push'),
      '#!/bin/sh\nprintf "gate executed\\n" > "$HOOK_MARKER"\nexit 17\n'
    );
    symlinkSync(
      resolve(repoRoot, 'node_modules'),
      join(root, 'node_modules'),
      'dir'
    );
    const env = {
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_COUNT: '0',
      GIT_AUTHOR_NAME: 'Hook Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Hook Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      NPM_CONFIG_USERCONFIG: '/dev/null',
      COREPACK_ENABLE_NETWORK: '0',
      HOOK_MARKER: join(root, 'hook-marker'),
    };
    const run = (command, args, cwd = root) =>
      spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 10000 });
    return { root, env, run };
  }

  it('keeps tracked hook setup independent of Husky wrappers', () => {
    expect(rootPackage.devDependencies).not.toHaveProperty('husky');
    expect(rootPackage.devDependencies).toHaveProperty('@commitlint/cli');
    expect(rootPackage.devDependencies).toHaveProperty('lint-staged');
    expect(prepare).toContain('scripts/hooks/configure-git-hooks.sh');
    expect(prepare).toContain('[ -f scripts/hooks/configure-git-hooks.sh ]');
    expect(prepare).toContain('${VERCEL:-}');
    expect(prepare).toContain('${CI:-}');
  });

  it('keeps tracked push gates active in another linked worktree after package prepare', () => {
    const { root, env, run } = fixture();
    const git = (args, cwd = root) => {
      const result = run('git', args, cwd);
      expect(result.status, result.stderr).toBe(0);
      return result.stdout.trim();
    };
    git(['init', '--initial-branch=main']);
    git(['config', 'core.hooksPath', '.husky/_']);
    git([
      'add',
      'package.json',
      'scripts/hooks/configure-git-hooks.sh',
      '.husky/pre-push',
    ]);
    git(['commit', '-m', 'seed fixture']);
    const linked = join(root, 'linked');
    git(['worktree', 'add', '-b', 'linked-fixture', linked]);
    const remote = join(root, 'remote.git');
    git(['init', '--bare', remote]);
    const result = run('pnpm', ['run', 'prepare']);
    expect(result.status, result.stderr).toBe(0);
    const push = run('git', ['push', remote, 'HEAD:refs/heads/proof'], linked);
    expect(push.status, push.stdout + push.stderr).not.toBe(0);
    expect(readFileSync(env.HOOK_MARKER, 'utf8')).toBe('gate executed\n');
    expect(git(['config', '--get', 'core.hooksPath'], linked)).toBe('.husky');
    expect(
      run('git', [
        '--git-dir',
        remote,
        'show-ref',
        '--verify',
        'refs/heads/proof',
      ]).status
    ).not.toBe(0);
  });

  it('keeps manifest-only package preparation working without Git or helper files', () => {
    const { root, run } = fixture();
    rmSync(join(root, 'scripts'), { recursive: true });
    rmSync(join(root, '.husky'), { recursive: true });
    const result = run('pnpm', ['run', 'prepare']);
    expect(result.status, result.stderr).toBe(0);
  });

  it('skips hook setup when Git metadata exists but the helper was excluded', () => {
    const { root, run } = fixture();
    expect(run('git', ['init', '--initial-branch=main']).status).toBe(0);
    rmSync(join(root, 'scripts'), { recursive: true });
    const result = run('pnpm', ['run', 'prepare']);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status, output).toBe(0);
    expect(output).not.toContain('No such file or directory');
    expect(
      run('git', ['config', '--get', 'core.hooksPath']).stdout.trim()
    ).toBe('');
  });

  it('skips hook setup on Vercel and CI even when the helper is present', () => {
    const { root, env, run } = fixture();
    expect(run('git', ['init', '--initial-branch=main']).status).toBe(0);
    expect(run('git', ['config', 'core.hooksPath', '.husky/_']).status).toBe(0);
    for (const [key, value] of [
      ['VERCEL', '1'],
      ['CI', 'true'],
    ]) {
      const result = spawnSync('pnpm', ['run', 'prepare'], {
        cwd: root,
        env: { ...env, [key]: value },
        encoding: 'utf8',
        timeout: 10000,
      });
      const output = `${result.stdout}\n${result.stderr}`;
      expect(result.status, output).toBe(0);
      expect(output).not.toContain('core.hooksPath=.husky');
      expect(
        run('git', ['config', '--get', 'core.hooksPath']).stdout.trim()
      ).toBe('.husky/_');
    }
  });

  it('propagates a broken tracked-hook configuration inside Git', () => {
    const { root, run } = fixture();
    expect(run('git', ['init']).status).toBe(0);
    chmodSync(join(root, '.husky/pre-push'), 0o644);
    const result = run('pnpm', ['run', 'prepare']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('expected tracked hook missing');
  });
});
