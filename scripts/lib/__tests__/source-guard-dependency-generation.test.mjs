import assert from 'node:assert/strict';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import {
  dependencyInputDigest,
  validateDependencyWorkspace,
} from '../ci-dependency-workspace.mjs';
import {
  expression,
  runInstallAndStamp,
} from './source-guard-composite.test-support.mjs';
import {
  fixture,
  guardName,
  restored,
  transaction,
} from './source-guard-dependency-generation.test-support.mjs';

const { load } = createRequire(import.meta.url)('js-yaml');
const workflow = load(
  readFileSync('.github/workflows/source-validation.yml', 'utf8')
);

test('merged guards occupy only the existing fourth unit shard after exact-head tests', () => {
  const steps = workflow.jobs.unit.steps;
  const prepare = steps.findIndex(step => step.id === 'source_guard_merge');
  const unit = steps.findIndex(
    step => step.name === 'Run web unit tests related to the exact PR diff'
  );
  assert.ok(
    prepare > unit,
    'merged qualification must follow exact-head unit tests in their runner'
  );
  assert.equal(
    workflow.jobs.deterministic.steps.some(
      step => step.id === 'source_guard_merge'
    ),
    false
  );
  assert.equal(workflow.jobs.unit.permissions['pull-requests'], 'read');
  assert.deepEqual(workflow.jobs.unit.strategy.matrix.shard, [
    '1/4',
    '2/4',
    '3/4',
    '4/4',
  ]);
  for (const step of steps.slice(prepare)) {
    assert.match(step.if, /matrix\.shard == '4\/4'/, step.name);
  }
  assert.equal(
    steps[prepare].if,
    "matrix.shard == '4/4' && steps.reuse.outputs.reuse != 'true'"
  );
  assert.equal(
    steps.find(
      step =>
        step.name === 'Validate disk-read source contracts from trusted base'
    ).if,
    "matrix.shard == '4/4' && steps.reuse.outputs.reuse != 'true'"
  );
  assert.ok(workflow.jobs.ready.needs.includes('unit'));
});

/** @param {{ name: string, shard: string, reuse: string, web: string, typecheck: string, remaining: string }} input */
function unitStepEnabledOnReuse({
  name,
  shard,
  reuse,
  web,
  typecheck,
  remaining,
}) {
  if (reuse === 'true') return false;
  if (name === guardName || name === 'Prepare merged source guard generation')
    return shard === '4/4';
  if (name === 'Setup Node.js and pnpm')
    return (
      shard === '4/4' ||
      web === 'true' ||
      typecheck === 'true' ||
      remaining === 'true'
    );
  if (name === 'Setup Playwright warm path')
    return shard === '4/4' || web === 'true';
  return true;
}

test('metadata reuse skips every unit shard including merged guards on 4/4', () => {
  const steps = workflow.jobs.unit.steps;
  const names = [
    'Checkout exact source head for unit and merged guard proofs',
    'Fetch head and base history only',
    'Setup Node.js and pnpm',
    'Setup Playwright warm path',
    'Prepare merged source guard generation',
    guardName,
  ];
  for (const shard of workflow.jobs.unit.strategy.matrix.shard) {
    for (const reuse of ['true', 'false']) {
      for (const web of ['true', 'false']) {
        for (const typecheck of ['true', 'false']) {
          for (const remaining of ['true', 'false']) {
            const context = {
              matrix: { shard },
              steps: {
                reuse: { outputs: { reuse } },
                scope: { outputs: { web, ui: 'false', ovie: 'false' } },
                'mq-parity': { outputs: { typecheck, remaining } },
              },
            };
            for (const name of names) {
              const step = steps.find(item => item.name === name);
              assert.ok(step, name);
              assert.equal(
                expression(step.if, context),
                unitStepEnabledOnReuse({
                  name,
                  shard,
                  reuse,
                  web,
                  typecheck,
                  remaining,
                }),
                `${name}: ${shard}/${reuse}/${web}/${typecheck}/${remaining}`
              );
            }
            const unit = steps.find(
              item =>
                item.name === 'Run web unit tests related to the exact PR diff'
            );
            assert.equal(
              expression(unit.if, context),
              reuse !== 'true' && web === 'true'
            );
            const twin = steps.find(
              item => item.name === 'Run typecheck lane parity'
            );
            assert.equal(
              expression(twin.if, context),
              reuse !== 'true' && typecheck === 'true' && shard === '2/4',
              `typecheck twin: ${shard}/${reuse}/${typecheck}`
            );
            const remainingTwin = steps.find(
              item => item.name === 'Run remaining lane parity'
            );
            assert.equal(
              expression(remainingTwin.if, context),
              reuse !== 'true' && remaining === 'true' && shard === '1/4',
              `remaining twin: ${shard}/${reuse}/${remaining}`
            );
          }
        }
      }
    }
  }
});

test('other unit shards never mutate the checkout or execute merged guards', t => {
  for (const shard of ['1/4', '2/4', '3/4']) {
    const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
    const result = transaction(f, { shard });
    assert.equal(result.failed, false, result.text);
    assert.equal(f.guards().length, 0);
    assert.deepEqual(
      f.installs().map(row => row.phase),
      ['initial']
    );
    assert.equal(f.git('status', '--porcelain'), '');
  }
});

test('the receipt condition reads install outputs only inside the same setup invocation', t => {
  const f = fixture(t, () => {});
  const action = load(
    readFileSync('.github/actions/setup-node-pnpm/action.yml', 'utf8')
  );
  const install = action.runs.steps.find(
    step => step.name === 'Install dependencies'
  );
  const stamp = action.runs.steps.find(
    step => step.name === 'Stamp installed workspace receipt'
  );
  // Exercise the real env, step ID and stamp predicate with a controlled producer.
  install.run = [
    'test "$USE_PREPARED_WORKSPACE" = false',
    'if [[ "$EMIT_REUSE" == true ]]; then echo "prepared-workspace-reused=true" >> "$GITHUB_OUTPUT"; fi',
  ].join('\n');
  stamp.run = 'echo stamped';
  const parentOutput = join(f.root, 'parent-output');
  writeFileSync(parentOutput, 'parent=untouched\n');
  for (const reuse of ['true', 'false']) {
    const result = runInstallAndStamp(
      f,
      action,
      { package_cache: 'true' },
      { runner: { environment: 'github-hosted' } },
      { EMIT_REUSE: reuse, GITHUB_OUTPUT: parentOutput }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, reuse === 'true' ? '' : 'stamped\n');
    assert.equal(readFileSync(parentOutput, 'utf8'), 'parent=untouched\n');
  }
});

for (const actionGeneration of ['added', 'changed']) {
  test(`registered ${actionGeneration} action generation survives exact-head restoration`, t => {
    const makeFixture = () =>
      fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'), {
        actionGeneration,
      });
    const f = makeFixture();
    const result = transaction(f, { capturePosts: true });
    assert.equal(result.failed, false, result.text);
    restored(f);
    assert.deepEqual(
      result
        .runPosts()
        .filter(row => row.phase === 'source_merge_dependencies'),
      [{ phase: 'source_merge_dependencies', generation: 'merged' }]
    );

    // Deliberate red control: the former live-worktree uses path either
    // disappears or silently executes the source head's older post payload.
    const legacy = makeFixture();
    const oldResult = transaction(legacy, {
      capturePosts: true,
      legacyActionPaths: true,
    });
    assert.equal(oldResult.failed, false, oldResult.text);
    restored(legacy);
    if (actionGeneration === 'added')
      assert.throws(() => oldResult.runPosts(), /ENOENT/);
    else
      assert.deepEqual(
        oldResult
          .runPosts()
          .filter(row => row.phase === 'source_merge_dependencies'),
        [{ phase: 'source_merge_dependencies', generation: 'head' }]
      );
  });
}

test('an existing action snapshot is preserved and cannot authorize merged setup', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  f.write('tmp/source-guard-actions/owner.txt', 'pre-existing local work\n');
  const result = transaction(f);
  assert.equal(result.failed, true);
  assert.match(result.text, /EEXIST/);
  assert.equal(result.state.source_merge_dependencies.outcome, 'skipped');
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.equal(
    readFileSync(join(f.repo, 'tmp/source-guard-actions/owner.txt'), 'utf8'),
    'pre-existing local work\n'
  );
  restored(f);
});

for (const [name, change] of [
  [
    'lockfile',
    write =>
      write('pnpm-lock.yaml', 'lockfileVersion: 9.0\n# new dependency graph\n'),
  ],
  [
    'root manifest',
    write =>
      write(
        'package.json',
        '{"name":"fixture-new","packageManager":"pnpm@9.15.9"}\n'
      ),
  ],
  [
    'workspace manifest',
    write => write('apps/web/package.json', '{"name":"fixture-web-new"}\n'),
  ],
  [
    'workspace membership',
    write =>
      write(
        'pnpm-workspace.yaml',
        'packages: [apps/*, packages/*, workers/*]\n'
      ),
  ],
  ['patch', write => write('patches/fixture.patch', 'updated patch\n')],
  [
    'pnpm pin',
    write =>
      write(
        'package.json',
        '{"name":"fixture","packageManager":"pnpm@9.15.10"}\n'
      ),
  ],
]) {
  test(`merged ${name} dependencies are qualified and exact-head dependencies restored`, t => {
    const f = fixture(t, change);
    const result = transaction(f);
    assert.equal(result.failed, false, result.text);
    assert.deepEqual(
      f.installs().map(row => row.phase),
      ['initial', 'source_merge_dependencies', 'source_head_dependencies']
    );
    assert.equal(f.guards().length, 1);
    assert.notEqual(f.guards()[0].dependencyInputDigest, f.headDigest);
    assert.equal(f.guards()[0].browserPath, '');
    assert.deepEqual(
      f.browsers().map(row => [row.phase, row.path]),
      [
        ['source_merge_browsers', ''],
        ['source_head_browsers', ''],
      ]
    );
    restored(f);
  });
}

test('unchanged dependency generation needs no second install', t => {
  const f = fixture(t);
  const result = transaction(f);
  assert.equal(result.failed, false, result.text);
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.equal(f.guards()[0].dependencyInputDigest, f.headDigest);
  assert.equal(f.guards()[0].browserPath, '/fixture/baked/head-browsers');
  assert.deepEqual(f.browsers(), []);
  restored(f);
});

test('guard failure remains failed after restoring the head and its installed tree', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'), {
    actionGeneration: 'added',
  });
  const result = transaction(f, { failGuard: true, capturePosts: true });
  assert.equal(result.failed, true);
  assert.match(result.text, /exact-dependency-probe: exit 43/);
  assert.equal(result.state.source_head_dependencies.outcome, 'success');
  restored(f);
  assert.deepEqual(result.runPosts(), [
    { phase: 'source_merge_dependencies', generation: 'merged' },
  ]);
});

test('partially failed merged install skips guards and still reinstalls exact-head dependencies', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'), {
    actionGeneration: 'added',
  });
  const result = transaction(f, {
    failInstall: 'source_merge_dependencies',
    capturePosts: true,
  });
  assert.equal(result.failed, true);
  assert.equal(f.guards().length, 0);
  assert.equal(result.state.source_merge_dependencies.outcome, 'failure');
  assert.equal(result.state.source_head_dependencies.outcome, 'success');
  restored(f);
  assert.deepEqual(result.runPosts(), [
    { phase: 'source_merge_dependencies', generation: 'merged' },
  ]);
});

test('changed Node pin cannot reuse the prior runtime receipt', t => {
  const f = fixture(t, write => write('.nvmrc', '25.0.0\n'));
  const result = transaction(f);
  // The fixture has one real Node runtime. The install seam cannot provision
  // this new pin: the unchanged strict helper rejects it, then the transaction
  // restores the original source and installed runtime receipt.
  assert.equal(result.failed, true);
  assert.match(result.text, /Node .* does not match \.nvmrc/);
  assert.equal(result.state.source_merge_dependencies.outcome, 'failure');
  assert.equal(result.state.source_head_dependencies.outcome, 'success');
  assert.equal(f.guards().length, 0);
  restored(f);
});

test('failed exact-head reinstall never turns successful merged guards into a pass', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  const result = transaction(f, { failInstall: 'source_head_dependencies' });
  assert.equal(result.failed, true);
  assert.equal(f.guards().length, 1);
  assert.equal(result.state.source_head_dependencies.outcome, 'failure');
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(dependencyInputDigest(f.repo), f.headDigest);
  assert.throws(() => validateDependencyWorkspace(f.repo), /receipt mismatch/);
  assert.deepEqual(readdirSync(f.runner), []);
});

test('failed source restoration prevents a head install and still cleans trusted helpers', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  const result = transaction(f, {
    beforeStep(id) {
      if (id !== 'source_guard_restore') return;
      writeFileSync(
        join(f.bin, 'git'),
        '#!/bin/sh\nif [ "$1" = reset ]; then echo "fixture reset failed" >&2; exit 52; fi\nexec /usr/bin/git "$@"\n',
        { mode: 0o755 }
      );
    },
  });
  assert.equal(result.failed, true);
  assert.match(result.text, /fixture reset failed/);
  assert.equal(result.state.source_guard_restore.outcome, 'failure');
  assert.equal(result.state.source_head_dependencies.outcome, 'skipped');
  assert.notEqual(dependencyInputDigest(f.repo), f.headDigest);
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial', 'source_merge_dependencies']
  );
  assert.deepEqual(readdirSync(f.runner), []);
});

test('restoration proof rejects dependency inputs changed after the reset', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  const result = transaction(f, {
    beforeStep(id) {
      if (id === 'source_head_dependencies')
        f.write('patches/fixture.patch', 'unexpected local mutation\n');
    },
  });
  assert.equal(result.failed, true);
  assert.equal(result.state.source_guard_restore.outcome, 'success');
  assert.equal(result.state.source_head_dependencies.outcome, 'success');
  assert.equal(result.state.source_guard_proof.outcome, 'failure');
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.notEqual(dependencyInputDigest(f.repo), f.headDigest);
  assert.deepEqual(readdirSync(f.runner), []);
});

test('a mismatched installed lock is rejected instead of being re-stamped', t => {
  const f = fixture(t);
  f.write('node_modules/.pnpm/lock.yaml', 'stale installed dependency graph\n');
  const result = transaction(f);
  assert.equal(result.failed, true);
  assert.match(
    result.text,
    /installed dependency lock does not match pnpm-lock\.yaml/
  );
  assert.equal(f.guards().length, 0);
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.throws(
    () => validateDependencyWorkspace(f.repo),
    /installed dependency lock does not match/
  );
  assert.deepEqual(readdirSync(f.runner), []);
});

test('merge conflict is named without installing or qualifying a conflicted tree', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'), {
    conflict: true,
  });
  const result = transaction(f);
  assert.equal(result.failed, true);
  assert.match(result.text, /merge conflict with main/);
  assert.match(result.text, /shared\.txt/);
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.equal(f.guards().length, 0);
  restored(f);
});

test('tracked edits left by unit tests fail closed and survive without a merge or reinstall', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  f.write('feature.txt', 'local work not committed\n');
  f.write('untracked.txt', 'local untracked work\n');
  const before = f.git('status', '--porcelain');
  const result = transaction(f);
  assert.equal(result.failed, true, result.text);
  assert.match(result.text, /Exact-head tests modified tracked source/);
  assert.equal(f.git('status', '--porcelain'), before);
  assert.equal(
    readFileSync(join(f.repo, 'feature.txt'), 'utf8'),
    'local work not committed\n'
  );
  assert.equal(
    readFileSync(join(f.repo, 'untracked.txt'), 'utf8'),
    'local untracked work\n'
  );
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.equal(f.guards().length, 0);
  assert.equal(
    validateDependencyWorkspace(f.repo).dependencyInputDigest,
    f.headDigest
  );
  assert.deepEqual(readdirSync(f.runner), []);
});

test('an untracked merge collision survives the rejected transaction', t => {
  const f = fixture(t, write => write('pnpm-lock.yaml', 'changed lock\n'));
  f.write('base-only.txt', 'local untracked bytes\n');
  const result = transaction(f);
  assert.equal(result.failed, true);
  assert.match(
    result.text,
    /untracked working tree files would be overwritten/
  );
  assert.equal(
    readFileSync(join(f.repo, 'base-only.txt'), 'utf8'),
    'local untracked bytes\n'
  );
  assert.equal(f.git('status', '--porcelain'), '?? base-only.txt');
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.deepEqual(
    f.installs().map(row => row.phase),
    ['initial']
  );
  assert.equal(f.guards().length, 0);
  assert.equal(
    validateDependencyWorkspace(f.repo).dependencyInputDigest,
    f.headDigest
  );
  assert.deepEqual(readdirSync(f.runner), []);
});
