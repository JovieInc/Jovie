import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  SCRIPT_CONTRACT_NODE_COMMAND,
  SCRIPT_CONTRACT_NODE_TESTS,
  SOURCE_GUARDS,
  scriptContractNodeArgs,
  selectSourceGuards,
} from '../../ci-fast-lanes.mjs';
import { buildAffectedTestPlan } from '../../run-affected-tests.mjs';
import {
  COPY_INVENTORY_TEST,
  copyInventoryScanPath,
  selectScriptContracts,
} from '../script-contract-affected.mjs';
import { testsAffectedBy } from '../test-file-dependencies.mjs';

const ROOT = join(import.meta.dirname, '../../..');

test('a non-JS scripts path does not force the full contract lists', () => {
  const root = mkdtempSync(join(tmpdir(), 'script-contract-affected-'));
  const write = (path, body) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  };
  try {
    write('scripts/unrelated.test.mjs', 'export {};\n');
    const options = {
      root,
      node: ['scripts/unrelated.test.mjs'],
      vitest: [],
    };
    for (const path of [
      'scripts/lanes/lane_runner.py',
      'scripts/tests/test_lane_runner.py',
    ])
      assert.deepEqual(selectScriptContracts([path], options), {
        full: false,
        node: [],
        vitest: [],
      });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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

test('a marketing copy source selects the inventory contract without the full lists', () => {
  const landing =
    'apps/web/components/features/waitlist/WaitlistPublicLanding.tsx';
  const catalog = [COPY_INVENTORY_TEST, 'scripts/agent-context/check.test.mjs'];
  const options = { root: ROOT, node: catalog, vitest: [] };
  assert.deepEqual(testsAffectedBy([COPY_INVENTORY_TEST], [landing], ROOT), []);
  assert.equal(copyInventoryScanPath(landing), true);
  assert.equal(copyInventoryScanPath('apps/web/lib/leads/constants.ts'), false);
  assert.equal(copyInventoryScanPath('apps/web/data/marketing/copy.ts'), false);
  assert.equal(
    copyInventoryScanPath('apps/web/lib/content-records/home.ts'),
    false
  );
  assert.equal(copyInventoryScanPath('apps/web/lib/marketing/copy.ts'), true);
  assert.deepEqual(selectScriptContracts([landing], options), {
    full: false,
    node: [COPY_INVENTORY_TEST],
    vitest: [],
  });
  assert.deepEqual(
    selectScriptContracts([landing], { ...options, derivedOnly: true }).node,
    [COPY_INVENTORY_TEST]
  );
  assert.deepEqual(
    selectScriptContracts(['scripts/copy-inventory/ids.gen.json'], options),
    { full: false, node: [COPY_INVENTORY_TEST], vitest: [] }
  );
  assert.deepEqual(
    selectScriptContracts(['apps/web/data/marketing/copy.ts'], options).node,
    []
  );
  assert.deepEqual(
    selectScriptContracts(['apps/web/lib/leads/constants.ts'], options).node,
    []
  );
  assert.deepEqual(
    selectScriptContracts([landing], {
      root: ROOT,
      node: ['scripts/agent-context/check.test.mjs'],
      vitest: [],
    }).node,
    []
  );
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

test('Node contract coverage isolates the original behavior suites and preserves every selection once', () => {
  const focused = [
    'scripts/preflight.test.mjs',
    'scripts/verify-workflow-references.test.mjs',
  ];
  const hosted =
    'scripts/lib/__tests__/source-guard-dependency-generation.test.mjs';
  for (const selection of [
    [],
    focused,
    [hosted],
    [focused[0], hosted, focused[1]],
    SCRIPT_CONTRACT_NODE_TESTS,
  ]) {
    const batches = scriptContractNodeArgs(selection);
    const selected = batches.flatMap(args =>
      args.filter(arg => !arg.startsWith('--'))
    );
    assert.deepEqual([...selected].sort(), [...selection].sort());
    for (const args of batches) {
      const tests = args.filter(arg => !arg.startsWith('--'));
      if (args.includes('--experimental-test-coverage')) {
        assert.ok(tests.every(test => focused.includes(test)));
        assert.ok(
          args.includes('--test-coverage-include=scripts/preflight.mjs')
        );
        assert.ok(
          args.includes(
            '--test-coverage-include=scripts/lib/source-guard-action-snapshot.mjs'
          )
        );
      } else {
        assert.deepEqual(args, ['--test', ...tests]);
        assert.ok(tests.every(test => !focused.includes(test)));
      }
    }
  }
  for (const file of [...focused, hosted]) {
    assert.ok(SCRIPT_CONTRACT_NODE_TESTS.includes(file));
    assert.ok(
      selectScriptContracts(['scripts/preflight.mjs']).node.includes(file)
    );
    assert.equal(SCRIPT_CONTRACT_NODE_COMMAND.split(file).length, 2);
  }
});

/** @type {Array<[string, string[]]>} */
const waitlistBindings = [
  [
    'apps/web/lib/waitlist/role-entry.ts',
    ['apps/web/lib/waitlist/role-entry.test.ts'],
  ],
  [
    'apps/web/lib/waitlist/roles.ts',
    [
      'apps/web/components/features/waitlist/WaitlistRoleForm.test.tsx',
      'apps/web/lib/waitlist/role-entry.test.ts',
      'apps/web/tests/unit/api/waitlist/join.test.ts',
    ],
  ],
  [
    'apps/web/lib/admin/waitlist-gate-funnel.ts',
    ['apps/web/lib/admin/waitlist-gate-funnel.test.ts'],
  ],
];
for (const [source, producers] of waitlistBindings) {
  test(`binds ${source} to its real behavior producers`, () => {
    const plan = buildAffectedTestPlan([source]);
    assert.equal(plan.mode, 'selected');
    for (const producer of producers)
      assert.ok(plan.selectedTests.includes(producer));
    assert.equal(plan.fallbackReason, undefined);
  });
  test(`fails closed when a producer for ${source} is absent`, () => {
    const plan = buildAffectedTestPlan([source], {
      isFileAvailable: file => file !== producers[0],
    });
    assert.equal(plan.mode, 'full');
    assert.ok(plan.fallbackReason?.includes(source));
  });
}
test('waitlist producer selection keeps global flags on the broad lane', () => {
  const plan = buildAffectedTestPlan([
    waitlistBindings[0][0],
    'apps/web/lib/flags/code-flags.ts',
  ]);
  assert.equal(plan.mode, 'full');
  assert.ok(plan.fallbackReason?.includes('apps/web/lib/flags/code-flags.ts'));
});
test('waitlist producer selection keeps unknown neighbors fail-closed', () => {
  assert.equal(
    buildAffectedTestPlan([
      waitlistBindings[0][0],
      'apps/web/lib/waitlist/unmapped.ts',
    ]).mode,
    'full'
  );
});
test('waitlist producer mapping edits require the complete selector regression pair', () => {
  const selector = [
    'scripts/run-affected-tests.mjs',
    'scripts/lib/__tests__/automation-verify.test.mjs',
  ];
  const files = waitlistBindings.map(([source]) => source);
  const complete = buildAffectedTestPlan([...files, ...selector]);
  assert.equal(complete.mode, 'selected');
  assert.ok(complete.scriptVitestTests.includes(selector[1]));
  assert.equal(buildAffectedTestPlan([...files, selector[0]]).mode, 'full');
  assert.equal(buildAffectedTestPlan([...files, selector[1]]).mode, 'full');
});
