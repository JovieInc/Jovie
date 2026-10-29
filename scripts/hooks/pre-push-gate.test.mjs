import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(hooksDir, '../..');
const gateScript = path.join(hooksDir, 'pre-push-gate.sh');

function runGate(args = [], env = {}) {
  return spawnSync('bash', [gateScript, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('pre-push-gate.sh is executable and documents escape hatch', () => {
  const source = readFileSync(gateScript, 'utf8');
  assert.match(source, /JOVIE_SKIP_PRE_PUSH_GATE/);
  chmodSync(gateScript, 0o755);
});

test('pre-push-gate.sh skips when JOVIE_SKIP_PRE_PUSH_GATE=1', () => {
  const result = runGate(['lint'], { JOVIE_SKIP_PRE_PUSH_GATE: '1' });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /skipped \(JOVIE_SKIP_PRE_PUSH_GATE=1\)/);
});

test('pre-push-gate.sh rejects unknown mode', () => {
  const result = runGate(['nope']);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 2, output);
  assert.match(output, /usage: scripts\/hooks\/pre-push-gate\.sh/);
});

test('.no-mistakes.yaml points lint/test/format at pre-push-gate.sh', () => {
  const config = readFileSync(path.join(repoRoot, '.no-mistakes.yaml'), 'utf8');
  assert.match(config, /lint: bash scripts\/hooks\/pre-push-gate\.sh lint/);
  assert.match(config, /test: bash scripts\/hooks\/pre-push-gate\.sh test/);
  assert.match(config, /format: bash scripts\/hooks\/pre-push-gate\.sh format/);
});

test('.husky/pre-push separates draft publication from qualification', () => {
  const hook = readFileSync(path.join(repoRoot, '.husky/pre-push'), 'utf8');
  assert.match(hook, /set -e/);
  assert.match(hook, /JOVIE_PUSH_PHASE:-publication/);
  assert.match(hook, /pre-push-gate\.sh publication/);
  assert.match(hook, /pre-push-gate\.sh affected/);
});

test('publication remains policy gated without running affected tests', () => {
  const source = readFileSync(gateScript, 'utf8');
  const publication = source
    .split('run_publication() {', 2)[1]
    .split('\n}', 1)[0];
  assert.match(publication, /ci-branching-guard\.mjs check/);
  assert.match(publication, /--mode warn/);
  assert.match(publication, /git diff --check/);
  assert.match(publication, /scan-secrets\.sh publication origin\/main/);
  assert.match(publication, /policy-gate-liveness\.mjs/);
  assert.doesNotMatch(publication, /automation-verify|run_affected/);
  assert.doesNotMatch(publication, /typecheck|biome|coverage/);
});

for (const linkedWorktree of [false, true]) {
  test(`child Git fixtures cannot mutate the ${linkedWorktree ? 'linked worktree' : 'main repository'} that invoked the hook`, () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'pre-push-git-env-'));
    const env = { ...process.env };
    const localNames = spawnSync('git', ['rev-parse', '--local-env-vars'], {
      encoding: 'utf8',
    });
    assert.equal(localNames.status, 0, localNames.stderr);
    for (const name of localNames.stdout.trim().split('\n')) delete env[name];
    delete env.JOVIE_SKIP_PRE_PUSH_GATE;
    env.GIT_CONFIG_GLOBAL = '/dev/null';
    env.GIT_CONFIG_NOSYSTEM = '1';

    const git = (cwd, ...args) => {
      const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    const initialize = directory => {
      mkdirSync(directory, { recursive: true });
      git(directory, 'init', '--initial-branch=fixture-base');
      git(directory, 'config', 'user.name', 'Hook Fixture');
      git(directory, 'config', 'user.email', 'hook-fixture@example.invalid');
      writeFileSync(path.join(directory, 'tracked.txt'), 'base\n');
      git(directory, 'add', 'tracked.txt');
      git(directory, 'commit', '-m', 'fixture baseline');
    };

    try {
      const main = path.join(root, 'main');
      initialize(main);
      const parent = linkedWorktree ? path.join(root, 'worktree') : main;
      if (linkedWorktree)
        git(main, 'worktree', 'add', '-b', 'hook-parent', parent);
      const fixture = path.join(root, 'child');
      initialize(fixture);
      writeFileSync(path.join(fixture, 'fixture.txt'), 'child-only data\n');

      const parentHooks = path.join(parent, 'scripts/hooks');
      mkdirSync(parentHooks, { recursive: true });
      copyFileSync(gateScript, path.join(parentHooks, 'pre-push-gate.sh'));
      copyFileSync(
        path.join(hooksDir, 'resolve-repo-node.sh'),
        path.join(parentHooks, 'resolve-repo-node.sh')
      );
      copyFileSync(path.join(repoRoot, '.nvmrc'), path.join(parent, '.nvmrc'));
      const bin = path.join(root, 'bin');
      mkdirSync(bin);
      writeFileSync(
        path.join(bin, 'pnpm'),
        `#!/usr/bin/env bash
set -euo pipefail
[[ "$*" == "run pre-push" ]]
[[ "$GIT_SSH_COMMAND" == "ssh -o BatchMode=yes" ]]
[[ "$HTTPS_PROXY" == "http://127.0.0.1:9" ]]
git -C "$JOVIE_CHILD_FIXTURE" config fixture.scope child
git -C "$JOVIE_CHILD_FIXTURE" checkout -b child-check
git -C "$JOVIE_CHILD_FIXTURE" add fixture.txt
git -C "$JOVIE_CHILD_FIXTURE" commit -m child-check
`,
        { mode: 0o755 }
      );

      const gitDir = git(parent, 'rev-parse', '--absolute-git-dir');
      const commonDir = path.resolve(
        parent,
        git(parent, 'rev-parse', '--git-common-dir')
      );
      const snapshot = () => ({
        head: readFileSync(path.join(gitDir, 'HEAD'), 'utf8'),
        index: readFileSync(path.join(gitDir, 'index')).toString('hex'),
        config: readFileSync(path.join(commonDir, 'config'), 'utf8'),
        branch: git(parent, 'branch', '--show-current'),
        refs: git(parent, 'show-ref'),
      });
      const before = snapshot();
      const result = spawnSync(
        'bash',
        [path.join(parentHooks, 'pre-push-gate.sh'), 'lint'],
        {
          cwd: parent,
          encoding: 'utf8',
          env: {
            ...env,
            PATH: `${bin}:${env.PATH}`,
            GIT_DIR: gitDir,
            GIT_INDEX_FILE: path.join(gitDir, 'index'),
            GIT_COMMON_DIR: commonDir,
            GIT_SSH_COMMAND: 'ssh -o BatchMode=yes',
            HTTPS_PROXY: 'http://127.0.0.1:9',
            JOVIE_CHILD_FIXTURE: fixture,
          },
        }
      );

      assert.deepEqual(
        snapshot(),
        before,
        'child fixture changed parent HEAD/index/config/branch/refs'
      );
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      assert.equal(git(fixture, 'branch', '--show-current'), 'child-check');
      assert.equal(git(fixture, 'config', '--local', 'fixture.scope'), 'child');
      assert.equal(git(fixture, 'show', 'HEAD:fixture.txt'), 'child-only data');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
