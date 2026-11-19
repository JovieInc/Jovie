import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { selectMqParityScope } from './mq-parity-scope.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');

const source = readFileSync(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf8'
);
test('docs and unrelated native changes allocate no extra parity work', () => {
  assert.deepEqual(
    selectMqParityScope(['docs/guide.md', 'apps/ios/Jovie/App.swift'], source),
    { typecheck: false, structural: false, storybook: false, evals: false }
  );
  assert.deepEqual(selectMqParityScope([], source), {
    typecheck: false,
    structural: false,
    storybook: false,
    evals: false,
  });
});

test('older PR heads load new parity tools from trusted base without dirtying the source checkout', () => {
  const root = resolve(import.meta.dirname, '../..');
  const workflow = load(
    readFileSync(join(root, '.github/workflows/source-validation.yml'), 'utf8')
  );
  const command = workflow.jobs.unit.steps.find(
    step => step.name === 'Resolve MQ parity tools for older source heads'
  ).run;
  const dir = mkdtempSync(join(tmpdir(), 'mq-parity-old-head-'));
  const repo = join(dir, 'source');
  mkdirSync(repo);
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    git('config', 'user.name', 'CI Fixture');
    git('config', 'user.email', 'ci@example.invalid');
    writeFileSync(join(repo, 'old.txt'), 'old source');
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'old source');
    const old = git('rev-parse', 'HEAD');
    for (const path of [
      'scripts/ci/mq-parity-scope.mjs',
      'scripts/lib/ci-repo-lanes.mjs',
      '.github/scripts/run-storybook-surfaces.sh',
      '.github/workflows/ci.yml',
    ]) {
      mkdirSync(join(repo, path, '..'), { recursive: true });
      writeFileSync(join(repo, path), readFileSync(join(root, path)));
    }
    git('add', '.');
    git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'protected tooling');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('checkout', '-q', '--detach', old);
    const output = join(dir, 'outputs');
    const result = spawnSync('/bin/bash', ['-c', command], {
      cwd: repo,
      encoding: 'utf8',
      timeout: 5_000,
      env: {
        ...process.env,
        GITHUB_WORKSPACE: repo,
        RUNNER_TEMP: dir,
        GITHUB_OUTPUT: output,
        GITHUB_ENV: join(dir, 'env'),
        BASE_REF: 'main',
      },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const toolRoot = readFileSync(output, 'utf8').trim().slice('root='.length);
    assert.notEqual(toolRoot, repo);
    assert.ok(
      existsSync(join(toolRoot, '.github/scripts/run-storybook-surfaces.sh'))
    );
    assert.equal(git('status', '--porcelain'), '');
    const scope = spawnSync(
      process.execPath,
      [join(toolRoot, 'scripts/ci/mq-parity-scope.mjs'), old],
      { cwd: repo, encoding: 'utf8', timeout: 5_000 }
    );
    assert.equal(scope.status, 0, scope.stdout + scope.stderr);
    assert.match(scope.stdout, /typecheck=false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('policy edits select structural parity and component edits select Storybook', () => {
  assert.equal(
    selectMqParityScope(['scripts/lanes/runner.py'], source).structural,
    true
  );
  assert.equal(
    selectMqParityScope(['scripts/lib/policy.mjs'], source).structural,
    true
  );
  assert.equal(
    selectMqParityScope(['apps/web/components/Input.tsx'], source).storybook,
    true
  );
  assert.deepEqual(selectMqParityScope(['pnpm-lock.yaml'], source), {
    typecheck: true,
    structural: true,
    storybook: true,
    evals: true,
  });
});
test('the actual MQ eval selector also selects PR evals for model, prompt and fixture changes', () => {
  for (const path of [
    'apps/web/tests/eval/promptfoo/prompt.yml',
    'apps/web/tests/eval/golden/fixture.json',
    'apps/web/lib/chat/agent.ts',
    'apps/web/app/api/chat/route.ts',
    '.github/workflows/ci.yml',
    '.github/workflows/source-validation.yml',
  ]) {
    assert.equal(selectMqParityScope([path], source).evals, true, path);
  }
  assert.throws(
    () => selectMqParityScope(['package.json'], ''),
    /selector is missing/
  );
});

test('TypeScript graph inputs select the actual MQ typecheck lane', () => {
  for (const path of [
    'apps/web/components/Input.tsx',
    'pnpm-lock.yaml',
    'tsconfig.json',
    'scripts/ci-fast-lanes.mjs',
    '.github/workflows/source-validation.yml',
  ]) {
    assert.equal(selectMqParityScope([path], source).typecheck, true, path);
  }
  assert.equal(selectMqParityScope(['docs/guide.md'], source).typecheck, false);
});

test('root graph changes hydrate source runners before the path-selected typecheck twin', () => {
  const root = resolve(import.meta.dirname, '../..');
  const workflow = load(
    readFileSync(join(root, '.github/workflows/source-validation.yml'), 'utf8')
  );
  const command = workflow.jobs.unit.steps
    .find(step => step.name === 'Select unit-affecting diff')
    .run.replaceAll('${{ github.base_ref }}', 'main');
  for (const [path, expected] of [
    ['tsconfig.json', true],
    ['docs/guide.md', false],
  ]) {
    const dir = mkdtempSync(join(tmpdir(), 'mq-parity-hydration-'));
    try {
      mkdirSync(join(dir, 'bin'));
      writeFileSync(
        join(dir, 'bin/git'),
        `#!/bin/bash
case "$1" in
  rev-parse) echo "$EXPECTED_HEAD" ;;
  merge-base) echo "$EXPECTED_HEAD" ;;
  fetch) exit 0 ;;
  diff) if [[ "$2" == --quiet ]]; then exit 0; fi; printf '%s\\0' "$CHANGED_PATH" ;;
  *) exit 9 ;;
esac
`,
        { mode: 0o755 }
      );
      const output = join(dir, 'outputs');
      const result = spawnSync('/bin/bash', ['-c', command], {
        cwd: root,
        encoding: 'utf8',
        timeout: 5_000,
        env: {
          ...process.env,
          PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
          MQ_PARITY_TOOLS_ROOT: root,
          EXPECTED_HEAD: '1'.repeat(40),
          GITHUB_OUTPUT: output,
          CHANGED_PATH: path,
        },
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(
        readFileSync(output, 'utf8'),
        new RegExp(`web=${expected}\\n`)
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});
