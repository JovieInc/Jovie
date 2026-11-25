import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const verify = resolve(here, 'verify-git-hooks.sh');
const configure = resolve(here, 'configure-git-hooks.sh');

function gitRepo(t) {
  const root = mkdtempSync(join(tmpdir(), 'jovie-verify-hooks-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const run = args =>
    execFileSync('git', args, { cwd: root, env, encoding: 'utf8' }).trim();
  run(['init', '-q', '-b', 'main']);
  run(['config', 'user.email', 't@example.com']);
  run(['config', 'user.name', 't']);
  return { root, env, run };
}

function writeHook(root, name) {
  mkdirSync(join(root, '.husky'), { recursive: true });
  writeFileSync(join(root, `.husky/${name}`), '#!/bin/sh\nexit 0\n');
  chmodSync(join(root, `.husky/${name}`), 0o755);
}

function writeInstaller(root) {
  mkdirSync(join(root, 'scripts/hooks'), { recursive: true });
  execFileSync('cp', [configure, verify, join(root, 'scripts/hooks/')]);
  chmodSync(join(root, 'scripts/hooks/configure-git-hooks.sh'), 0o755);
  chmodSync(join(root, 'scripts/hooks/verify-git-hooks.sh'), 0o755);
}

test('verify fails outside a git worktree', () => {
  const result = spawnSync('bash', [verify], {
    cwd: tmpdir(),
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_DIR: '/dev/null',
      GIT_WORK_TREE: '/dev/null',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not inside a Git worktree/);
});

test('verify fails when core.hooksPath is unset', t => {
  const { root, env } = gitRepo(t);
  writeHook(root, 'pre-commit');
  writeHook(root, 'pre-push');
  const result = spawnSync('bash', [verify], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /core\.hooksPath is 'unset'/);
});

test('verify fails when pre-push is missing', t => {
  const { root, env, run } = gitRepo(t);
  writeHook(root, 'pre-commit');
  run(['config', 'core.hooksPath', '.husky']);
  const result = spawnSync('bash', [verify], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pre-push is missing/);
});

test('verify fails when pre-commit is missing', t => {
  const { root, env, run } = gitRepo(t);
  writeHook(root, 'pre-push');
  run(['config', 'core.hooksPath', '.husky']);
  const result = spawnSync('bash', [verify], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /pre-commit is missing/);
});

test('configure-git-hooks arms hooksPath and verify passes for both hooks', t => {
  const { root, env, run } = gitRepo(t);
  writeHook(root, 'pre-commit');
  writeHook(root, 'pre-push');
  writeInstaller(root);
  const configured = spawnSync(
    'bash',
    [join(root, 'scripts/hooks/configure-git-hooks.sh')],
    {
      cwd: root,
      env,
      encoding: 'utf8',
    }
  );
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(run(['config', '--get', 'core.hooksPath']), '.husky');
  assert.match(
    configured.stderr,
    /ok: core\.hooksPath=\.husky and pre-commit \+ pre-push are executable/
  );
});
