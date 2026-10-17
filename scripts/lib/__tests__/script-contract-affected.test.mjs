import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { SOURCE_GUARDS, selectSourceGuards } from '../../ci-fast-lanes.mjs';
import { selectScriptContracts } from '../script-contract-affected.mjs';
import { testsAffectedBy } from '../test-file-dependencies.mjs';

const ROOT = join(import.meta.dirname, '../../..');

test('script, workflow and toolchain diffs run both full contract lists', () => {
  const node = ['scripts/lib/__tests__/script-contract-affected.test.mjs'];
  const vitest = ['scripts/lib/__tests__/ci-fast-lanes.test.mjs'];
  for (const path of [
    'scripts/lib/pr-size-guard.mjs',
    '.github/workflows/pr-size-guard.yml',
    'package.json',
    'pnpm-lock.yaml',
    'biome.json',
  ])
    assert.deepEqual(
      selectScriptContracts([path], { root: ROOT, node, vitest }),
      { full: true, node, vitest },
      path
    );
  // An unreadable diff fails closed onto everything present.
  assert.deepEqual(selectScriptContracts(null, { root: ROOT, node, vitest }), {
    full: true,
    node,
    vitest,
  });
  assert.deepEqual(
    selectScriptContracts(['scripts/x.mjs'], {
      root: ROOT,
      node: [...node, 'scripts/absent.test.mjs'],
      vitest,
    }).node,
    node
  );
});

test('other diffs run only contracts whose derived reads they touch', () => {
  const root = mkdtempSync(join(tmpdir(), 'script-contract-affected-'));
  const write = (path, body) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  };
  try {
    write('apps/web/lib/leads/constants.ts', 'export const X = 1;\n');
    write(
      'scripts/funnel-judge/rubric.test.mjs',
      "readFileSync(join(ROOT, 'apps/web/lib/leads/constants.ts'));\n"
    );
    write('scripts/other.test.mjs', "import './helper.mjs';\n");
    write('scripts/helper.mjs', 'export {};\n');
    const options = {
      root,
      node: ['scripts/funnel-judge/rubric.test.mjs', 'scripts/other.test.mjs'],
      vitest: [],
    };
    assert.deepEqual(
      selectScriptContracts(['apps/web/lib/leads/constants.ts'], options),
      {
        full: false,
        node: ['scripts/funnel-judge/rubric.test.mjs'],
        vitest: [],
      }
    );
    assert.deepEqual(
      selectScriptContracts(['apps/ios/Jovie/App.swift'], options),
      { full: false, node: [], vitest: [] }
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('root DESIGN.md and ./design-sections.json select the instruction contract', () => {
  const contract = 'scripts/agent-context/check.test.mjs';
  assert.deepEqual(testsAffectedBy([contract], ['DESIGN.md'], ROOT), [
    contract,
  ]);
  assert.deepEqual(
    testsAffectedBy(
      [contract],
      ['scripts/agent-context/design-sections.json'],
      ROOT
    ),
    [contract]
  );
  const selected = selectScriptContracts(['DESIGN.md'], { root: ROOT });
  assert.equal(selected.full, false);
  assert.ok(selected.node.includes(contract));
});

test('is a PR-only source guard resolved beside ci-fast-lanes', () => {
  const guard = SOURCE_GUARDS.find(entry => entry.id === 'script-contracts');
  assert.ok(guard);
  assert.equal(guard.prOnly, true);
  assert.match(guard.command, /\/lib\/script-contract-affected\.mjs"$/u);
  const ids = event =>
    selectSourceGuards(event, ['apps/web/lib/leads/constants.ts']).map(
      entry => entry.id
    );
  assert.ok(ids('pull_request').includes('script-contracts'));
  assert.ok(!ids('merge_group').includes('script-contracts'));
});

test('the CLI lists the selection for explicit paths', () => {
  const result = spawnSync(
    process.execPath,
    [
      join(ROOT, 'scripts/lib/script-contract-affected.mjs'),
      '--list',
      'apps/ios/Jovie/App.swift',
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /^\[script-contracts\] affected: 0 node, 0 vitest$/m
  );
});
