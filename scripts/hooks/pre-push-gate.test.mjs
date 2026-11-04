import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  assert.match(publication, /bash scripts\/hooks\/biome-pre-push\.sh/);
  assert.doesNotMatch(publication, /typecheck|coverage|biome check \./);
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

test('publication rejects committed formatter drift and accepts the formatted repair', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'pre-push-format-'));
  const env = { ...process.env };
  const localNames = spawnSync('git', ['rev-parse', '--local-env-vars'], {
    encoding: 'utf8',
  });
  assert.equal(localNames.status, 0, localNames.stderr);
  for (const name of localNames.stdout.trim().split('\n')) delete env[name];
  delete env.JOVIE_SKIP_PRE_PUSH_GATE;
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_CONFIG_NOSYSTEM = '1';
  const run = (command, args) =>
    spawnSync(command, args, { cwd: root, env, encoding: 'utf8' });
  const git = (...args) => {
    const result = run('git', args);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  };
  const write = (file, content) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  };
  const publish = () =>
    run('bash', ['scripts/hooks/pre-push-gate.sh', 'publication']);

  try {
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Hook Fixture');
    git('config', 'user.email', 'hook-fixture@example.invalid');
    write('scripts/hooks/pre-push-gate.sh', readFileSync(gateScript));
    for (const file of ['resolve-repo-node.sh', 'biome-pre-push.sh']) {
      write(`scripts/hooks/${file}`, readFileSync(path.join(hooksDir, file)));
    }
    for (const file of ['.nvmrc', 'biome.json']) {
      write(file, readFileSync(path.join(repoRoot, file)));
    }
    // Other publication checks are outside this formatting contract. Real Git,
    // the publication dispatcher and the installed Biome run without mocks.
    write('scripts/ci-branching-guard.mjs', 'export {};\n');
    write('scripts/component-ship-gate.mjs', 'export {};\n');
    write('scripts/lib/policy-gate-liveness.mjs', 'export {};\n');
    write('scripts/preflight-changed.mjs', 'export {};\n');
    write('scripts/security/scan-secrets.sh', 'exit 0\n');
    write('scripts/hooks/pre-push-gate.test.mjs', 'export {};\n');
    write('.gitignore', 'node_modules/\n');
    write('legacy.ts', 'export const legacy={old:true};\n');
    git('add', '.');
    git('commit', '-m', 'fixture baseline with unrelated formatter debt');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('checkout', '-b', 'fixture/format-repair');
    mkdirSync(path.join(root, 'node_modules/.bin'), { recursive: true });
    symlinkSync(
      path.join(repoRoot, 'node_modules/@biomejs'),
      path.join(root, 'node_modules/@biomejs')
    );
    symlinkSync(
      path.join(repoRoot, 'node_modules/.bin/biome'),
      path.join(root, 'node_modules/.bin/biome')
    );
    write('changed.ts', 'export const changed={value:1};\n');
    git('add', 'changed.ts');
    git('commit', '-m', 'introduce formatter drift');

    const rejected = publish();
    const redOutput = `${rejected.stdout}\n${rejected.stderr}`;
    assert.notEqual(rejected.status, 0, redOutput);
    assert.match(redOutput, /changed\.ts format/);
    assert.match(redOutput, /Formatter would have printed/);
    assert.doesNotMatch(redOutput, /legacy\.ts format/);
    assert.equal(
      readFileSync(path.join(root, 'changed.ts'), 'utf8'),
      'export const changed={value:1};\n',
      'publication must not rewrite source'
    );

    const formatted = run(path.join(root, 'node_modules/.bin/biome'), [
      'format',
      '--write',
      'changed.ts',
    ]);
    assert.equal(formatted.status, 0, formatted.stderr);
    git('add', 'changed.ts');
    git('commit', '-m', 'format the repair');
    const accepted = publish();
    assert.equal(accepted.status, 0, `${accepted.stdout}\n${accepted.stderr}`);
    assert.match(accepted.stdout, /Checked 1 file/);

    rmSync(path.join(root, 'node_modules/.bin/biome'));
    const missingTool = publish();
    assert.notEqual(missingTool.status, 0, 'missing Biome must fail closed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publication blocks missing component stories and tests before publishing', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'publication-component-'));
  const source = 'apps/web/components/atoms/PublishAction.tsx';
  const testFile = source.replace('.tsx', '.test.tsx');
  const story = source.replace('.tsx', '.stories.tsx');
  const marker = path.join(root, 'publication-completed');
  const write = (file, body, executable = false) => {
    const absolute = path.join(root, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, body, { mode: executable ? 0o755 : 0o644 });
  };
  try {
    write('scripts/hooks/pre-push-gate.sh', readFileSync(gateScript, 'utf8'));
    write('scripts/hooks/resolve-repo-node.sh', 'exit 0\n');
    write('scripts/hooks/biome-pre-push.sh', 'exit 0\n');
    write(
      'bin/git',
      '#!/bin/sh\nif [ "$*" != "rev-parse --local-env-vars" ]; then echo fixture-base; fi\n',
      true
    );
    write('scripts/ci-branching-guard.mjs', '');
    write('scripts/security/scan-secrets.sh', 'exit 0\n');
    write(
      'scripts/lib/policy-gate-liveness.mjs',
      `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'done');\n`
    );
    write('scripts/hooks/pre-push-gate.test.mjs', 'export {};\n');
    write('scripts/preflight-changed.mjs', 'export {};\n');
    const checker = pathToFileURL(
      path.join(repoRoot, 'scripts/component-ship-gate.mjs')
    ).href;
    // Exercise the real artifact checker; isolate network/scanners and git range discovery.
    write(
      'scripts/component-ship-gate.mjs',
      `
import assert from 'node:assert/strict';
import { checkChangedComponents } from ${JSON.stringify(checker)};
assert.deepEqual(process.argv.slice(2), ['--check-artifacts', '--diff-base=fixture-base']);
const report = checkChangedComponents(${JSON.stringify([source, testFile])}, { repoRoot: process.cwd() });
console.log(report.issues.map(issue => issue.rule).join('\\n'));
process.exit(report.ok ? 0 : 1);
`
    );
    write(
      source,
      'export function PublishAction() { return <button>Publish</button>; }'
    );
    write(testFile, "import { PublishAction } from './PublishAction';");
    const run = () =>
      spawnSync(
        'bash',
        [path.join(root, 'scripts/hooks/pre-push-gate.sh'), 'publication'],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${path.join(root, 'bin')}:${process.env.PATH}`,
            JOVIE_SKIP_PRE_PUSH_GATE: '',
          },
        }
      );
    const missingStory = run();
    assert.equal(
      missingStory.status,
      1,
      missingStory.stdout + missingStory.stderr
    );
    assert.match(missingStory.stdout, /missing-story/);
    assert.equal(existsSync(marker), false);

    write(
      story,
      "import { PublishAction } from './PublishAction';\nexport default { component: PublishAction };\nexport const Default = {};\n"
    );
    rmSync(path.join(root, testFile));
    const missingTest = run();
    assert.equal(
      missingTest.status,
      1,
      missingTest.stdout + missingTest.stderr
    );
    assert.match(missingTest.stdout, /missing-test/);
    assert.equal(existsSync(marker), false);

    write(testFile, "import { PublishAction } from './PublishAction';");
    const complete = run();
    assert.equal(complete.status, 0, complete.stdout + complete.stderr);
    assert.equal(existsSync(marker), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
