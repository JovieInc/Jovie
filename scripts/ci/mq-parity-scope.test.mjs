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

test('CLI git diff uses --no-renames so rename-out of the graph still selects twins', () => {
  const source = readFileSync(
    new URL('./mq-parity-scope.mjs', import.meta.url),
    'utf8'
  );
  assert.match(source, /\['diff', '--no-renames', '--name-only', '-z'/);
});

test('docs-only changes allocate no MQ parity work', () => {
  assert.deepEqual(selectMqParityScope(['docs/guide.md']), {
    typecheck: false,
    remaining: false,
  });
  assert.deepEqual(selectMqParityScope([]), {
    typecheck: false,
    remaining: false,
  });
});

test('iOS sources skip typecheck but select remaining (ios-fast)', () => {
  const scope = selectMqParityScope(['apps/ios/Jovie/App.swift']);
  assert.equal(scope.typecheck, false);
  assert.equal(scope.remaining, true);
});

test('TypeScript and typecheck graph inputs select the typecheck twin', () => {
  assert.equal(selectMqParityScope(['apps/web/lib/foo.ts']).typecheck, true);
  assert.equal(selectMqParityScope(['tsconfig.json']).typecheck, true);
  assert.equal(selectMqParityScope(['pnpm-lock.yaml']).typecheck, true);
  assert.equal(
    selectMqParityScope(['scripts/ci-fast-lanes.mjs']).typecheck,
    true
  );
});

test('remaining lane inputs select the remaining twin', () => {
  assert.equal(selectMqParityScope(['apps/web/lib/foo.ts']).remaining, true);
  assert.equal(
    selectMqParityScope(['.github/workflows/ci.yml']).remaining,
    true
  );
  assert.equal(selectMqParityScope(['DESIGN.md']).remaining, true);
  assert.equal(selectMqParityScope(['docs/guide.md']).remaining, false);
  assert.equal(
    selectMqParityScope(['scripts/ci-fast-lanes.mjs']).remaining,
    true
  );
});

test('source-validation wires typecheck and remaining twins onto Affected Unit Tests', () => {
  const root = resolve(import.meta.dirname, '../..');
  const workflow = load(
    readFileSync(join(root, '.github/workflows/source-validation.yml'), 'utf8')
  );
  const steps = workflow.jobs.unit.steps;
  const typecheck = steps.find(
    step => step.name === 'Run typecheck lane parity'
  );
  assert.ok(typecheck, 'typecheck lane parity step missing');
  assert.equal(typecheck.run, 'node scripts/ci-fast-lanes.mjs');
  assert.equal(typecheck.env.CI_FAST_LANE_GROUP, 'typecheck');
  assert.match(String(typecheck.if), /mq-parity\.outputs\.typecheck == 'true'/);

  const remaining = steps.find(
    step => step.name === 'Run remaining lane parity'
  );
  assert.ok(remaining, 'remaining lane parity step missing');
  assert.equal(remaining.run, 'node scripts/ci-fast-lanes.mjs');
  assert.equal(remaining.env.CI_FAST_LANE_GROUP, 'remaining');
  assert.equal(remaining.env.CI_FAST_SKIP_STRUCTURAL, 'true');
  assert.match(String(remaining.if), /mq-parity\.outputs\.remaining == 'true'/);
  assert.match(String(remaining.if), /matrix\.shard == '1\/4'/);
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
    assert.ok(existsSync(join(toolRoot, 'scripts/ci/mq-parity-scope.mjs')));
    assert.equal(git('status', '--porcelain'), '');
    const scope = spawnSync(
      process.execPath,
      [join(toolRoot, 'scripts/ci/mq-parity-scope.mjs'), old],
      { cwd: repo, encoding: 'utf8', timeout: 5_000 }
    );
    assert.equal(scope.status, 0, scope.stdout + scope.stderr);
    assert.match(scope.stdout, /typecheck=false/);
    assert.match(scope.stdout, /remaining=false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('older PR heads skip the twin when base also lacks MQ parity tools', () => {
  const root = resolve(import.meta.dirname, '../..');
  const workflow = load(
    readFileSync(join(root, '.github/workflows/source-validation.yml'), 'utf8')
  );
  const command = workflow.jobs.unit.steps.find(
    step => step.name === 'Resolve MQ parity tools for older source heads'
  ).run;
  const dir = mkdtempSync(join(tmpdir(), 'mq-parity-missing-base-'));
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
    git('update-ref', 'refs/remotes/origin/main', old);
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
    assert.match(result.stderr + result.stdout, /MQ parity tools absent/);
    const toolRoot = readFileSync(output, 'utf8').trim().slice('root='.length);
    const scope = spawnSync(
      process.execPath,
      [join(toolRoot, 'scripts/ci/mq-parity-scope.mjs'), old],
      { cwd: repo, encoding: 'utf8', timeout: 5_000 }
    );
    assert.equal(scope.status, 0, scope.stdout + scope.stderr);
    assert.match(scope.stdout, /typecheck=false/);
    assert.match(scope.stdout, /remaining=false/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('queue parity policy maps ci-fast typecheck and remaining shards to the source twin', () => {
  const policy = JSON.parse(
    readFileSync(
      new URL('../../.github/merge-queue-parity.json', import.meta.url),
      'utf8'
    )
  );
  assert.deepEqual(policy.parity['ci.yml#ci-fast-typecheck'], {
    pr: 'source-validation.yml#unit',
    command: 'node scripts/ci-fast-lanes.mjs',
  });
  assert.deepEqual(policy.parity['ci.yml#ci-fast-remaining-shards'], {
    pr: 'source-validation.yml#unit',
    command: 'node scripts/ci-fast-lanes.mjs',
  });
  assert.equal(
    policy.exemptions.some(e => e.job === 'ci.yml#ci-fast-typecheck'),
    false
  );
  assert.equal(
    policy.exemptions.some(e => e.job === 'ci.yml#ci-fast-remaining-shards'),
    false
  );
  const remainingFanIn = policy.exemptions.find(
    e => e.job === 'ci.yml#ci-fast-remaining'
  );
  assert.equal(remainingFanIn?.kind, 'combined-head');
});
