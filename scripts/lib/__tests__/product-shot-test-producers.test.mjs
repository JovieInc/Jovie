import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import ts from 'typescript';
import { buildAffectedTestPlan } from '../../run-affected-tests.mjs';
import { ONBOARDING_TEST_PRODUCERS } from '../onboarding-test-producers.mjs';
import { PRODUCT_SHOT_TEST_PRODUCERS } from '../product-shot-test-producers.mjs';

const ROOT = join(import.meta.dirname, '../../..');

for (const [source, producers] of PRODUCT_SHOT_TEST_PRODUCERS) {
  test('product-shot producer selects its real tests: ' + source, () => {
    for (const producer of producers) {
      assert.ok(
        existsSync(join(ROOT, producer)),
        'declared producer missing: ' + producer
      );
    }
    const plan = buildAffectedTestPlan([source]);
    assert.equal(plan.mode, 'selected');
    for (const producer of producers) {
      assert.ok(plan.selectedTests.includes(producer));
    }
  });

  test('product-shot missing producer fails closed: ' + source, () => {
    const plan = buildAffectedTestPlan([source], {
      isFileAvailable: file =>
        file !== producers[0] && existsSync(join(ROOT, file)),
    });
    assert.equal(plan.mode, 'full');
  });
}

test('product-shot exact bindings do not admit unknown neighbors or mixed peers', () => {
  const unknown = 'apps/web/scripts/product-shots/unmapped.ts';
  assert.equal(buildAffectedTestPlan([unknown]).mode, 'full');
  assert.equal(
    buildAffectedTestPlan([PRODUCT_SHOT_TEST_PRODUCERS[0][0], unknown]).mode,
    'full'
  );
});

test('core onboarding extraction preserves existing producer and actual dependencies', () => {
  const plan = buildAffectedTestPlan([
    'apps/web/components/features/onboarding/onboardingChatHelpers.ts',
  ]);
  assert.equal(plan.mode, 'selected');
  assert.ok(
    plan.selectedTests.includes(
      'apps/web/tests/unit/onboarding/OnboardingChat.completed-steps.test.tsx'
    )
  );
  assert.ok(
    plan.selectedTests.includes(
      'apps/web/tests/unit/onboarding/OnboardingChat.empty-intro.test.tsx'
    )
  );
  for (const [, producers] of ONBOARDING_TEST_PRODUCERS) {
    for (const producer of producers)
      assert.ok(existsSync(join(ROOT, producer)));
  }
});

test('all rolling sparse bootstraps carry the real selector helper closure', async t => {
  const document = yamlLoad(
    readFileSync(
      join(ROOT, '.github/workflows/rolling-ci-dispatch.yml'),
      'utf8'
    )
  );
  assert.ok(
    document !== null &&
      typeof document === 'object' &&
      !Array.isArray(document)
  );
  assert.ok(
    'jobs' in document &&
      document.jobs !== null &&
      typeof document.jobs === 'object' &&
      !Array.isArray(document.jobs)
  );
  const workflow =
    /** @type {{jobs:Record<string,{steps?:Array<{with?:Record<string,unknown>}>}>}} */ (
      document
    );
  const sparse = Object.values(workflow.jobs)
    .flatMap(job => job.steps ?? [])
    .map(step => step.with?.['sparse-checkout'])
    .filter(value => typeof value === 'string')
    .filter(value => value.includes('scripts/run-affected-tests.mjs'));
  assert.equal(sparse.length, 4);
  const required = [
    'scripts/lib/onboarding-test-producers.mjs',
    'scripts/lib/product-shot-test-producers.mjs',
  ];
  const closure = new Set();
  function collect(file) {
    if (closure.has(file)) return;
    closure.add(file);
    const source = ts.createSourceFile(
      file,
      readFileSync(join(ROOT, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement)
      )
        continue;
      const name = statement.moduleSpecifier;
      if (!name || !ts.isStringLiteral(name) || !name.text.startsWith('.'))
        continue;
      const absolute = resolve(ROOT, dirname(file), name.text);
      assert.ok(absolute.startsWith(resolve(ROOT) + '/'));
      assert.ok(existsSync(absolute), 'missing real module: ' + name.text);
      const child = relative(ROOT, absolute);
      if (/\.[cm]?js$/.test(child)) collect(child);
      else closure.add(child);
    }
  }
  collect('scripts/run-affected-tests.mjs');
  // Existing sparse policy declares this module-initialization data input.
  closure.add('scripts/invariants/latency-sensitive-execution-allowlist.json');
  for (let index = 0; index < sparse.length; index++) {
    await t.test(
      'bootstrap ' +
        index +
        ' loads the actual selector and rejects each missing helper',
      () => {
        const declared = new Set(sparse[index].split(/\s+/).filter(Boolean));
        for (const file of required)
          assert.ok(declared.has(file), 'sparse dependency missing: ' + file);
        const root = mkdtempSync(join(tmpdir(), 'product-selector-bootstrap-'));
        try {
          for (const file of closure) {
            mkdirSync(dirname(join(root, file)), { recursive: true });
            copyFileSync(join(ROOT, file), join(root, file));
          }
          const entry = pathToFileURL(
            join(root, 'scripts/run-affected-tests.mjs')
          ).href;
          const code =
            'import(' +
            JSON.stringify(entry) +
            ').then(({buildAffectedTestPlan})=>{if(buildAffectedTestPlan([]).mode!=="none")process.exit(2);console.log("core-bootstrap-ok")})';
          const run = () =>
            spawnSync(process.execPath, ['--input-type=module', '-e', code], {
              cwd: root,
              encoding: 'utf8',
            });
          const positive = run();
          assert.equal(positive.status, 0, positive.stderr);
          assert.match(positive.stdout, /core-bootstrap-ok/);
          for (const file of required) {
            const source = join(root, file);
            renameSync(source, source + '.withheld');
            const negative = run();
            renameSync(source + '.withheld', source);
            assert.notEqual(
              negative.status,
              0,
              'missing module must not load successfully'
            );
            assert.match(negative.stderr, /ERR_MODULE_NOT_FOUND/);
            assert.ok(!negative.stdout.includes('core-bootstrap-ok'));
          }
        } finally {
          rmSync(root, { recursive: true, force: true });
        }
      }
    );
  }
});
