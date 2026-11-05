import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  SCRIPT_CONTRACT_NODE_COMMAND,
  SCRIPT_CONTRACT_NODE_TESTS,
  SOURCE_GUARDS,
  scriptContractNodeArgs,
  selectSourceGuards,
} from '../../ci-fast-lanes.mjs';
import { selectScriptContracts } from '../script-contract-affected.mjs';
import { testsAffectedBy } from '../test-file-dependencies.mjs';
import {
  snapshotTrustedTestPlanner,
  verifyTrustedTestPlanner,
} from '../trusted-test-planner-snapshot.mjs';
import {
  trustedPlannerFixture,
  workflowBootstrap,
} from './trusted-planner-fixture.mjs';

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

test('trusted planner old BASE snapshots its actual imports without requiring future helpers', t => {
  const f = trustedPlannerFixture(t, false);
  const out = join(f.root, 'snapshot');
  const manifest = snapshotTrustedTestPlanner({
    repo: f.root,
    base: f.base,
    out,
  });
  assert.ok(
    manifest.files.some(file => file.path === 'scripts/lib/git-base-ref.mjs')
  );
  assert.ok(
    manifest.files.some(file => file.path === 'scripts/lib/blog-content-ci.mjs')
  );
  assert.ok(
    !manifest.files.some(
      file => file.path === 'scripts/lib/onboarding-test-producers.mjs'
    )
  );
  assert.equal(verifyTrustedTestPlanner(out, f.base).base, f.base);
});

test('actual BASE bootstrap ignores malicious candidate engine and producer side effects', t => {
  const f = trustedPlannerFixture(t, true);
  const marker = join(f.root, 'candidate-executed');
  const evil =
    "import {writeFileSync} from 'node:fs';writeFileSync(process.env.MARKER,'executed');\n";
  f.put(
    'scripts/lib/onboarding-test-producers.mjs',
    evil + "export const tests=['attacker-only.test.ts'];\n"
  );
  f.put(
    'scripts/lib/trusted-test-planner-snapshot.mjs',
    evil + 'process.exit(0);\n'
  );
  const temp = join(f.root, 'runner');
  mkdirSync(temp);
  const { workflow, bootstrap } = workflowBootstrap();
  const executed = spawnSync(
    'bash',
    ['--norc', '-c', 'set -euo pipefail\n' + bootstrap],
    {
      cwd: f.root,
      env: { ...f.env, BASE_HEAD: f.base, RUNNER_TEMP: temp, MARKER: marker },
      encoding: 'utf8',
    }
  );
  assert.equal(executed.status, 0, executed.stderr);
  assert.equal(existsSync(marker), false);
  const out = join(temp, 'trusted-planner');
  verifyTrustedTestPlanner(out, f.base);
  const entry = pathToFileURL(
    join(out, 'files/scripts/run-affected-tests.mjs')
  ).href;
  const code =
    'import(' +
    JSON.stringify(entry) +
    ').then(m=>console.log(JSON.stringify(m.buildAffectedTestPlan())))';
  const selected = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', code],
    {
      cwd: f.root,
      env: { ...f.env, MARKER: marker },
      encoding: 'utf8',
    }
  );
  assert.equal(selected.status, 0, selected.stderr);
  assert.deepEqual(JSON.parse(selected.stdout).selectedTests, [
    'trusted.unit.test.ts',
  ]);
  assert.equal(existsSync(marker), false);
  assert.match(
    workflow,
    /trusted-planner\/files\/\$path:\/workspace\/\$path:ro/
  );
  assert.ok(
    workflow.includes('"' + String.fromCharCode(36) + '{trusted_mounts[@]}"')
  );
});

test('missing required BASE dependency never falls back to an available candidate helper', t => {
  const f = trustedPlannerFixture(t, false);
  f.put(
    'scripts/run-affected-tests.mjs',
    "import './lib/missing-required.mjs';\n"
  );
  f.git('add', 'scripts/run-affected-tests.mjs');
  f.git('commit', '-qm', 'require missing base helper');
  const base = f.git('rev-parse', 'HEAD');
  f.put(
    'scripts/lib/missing-required.mjs',
    'export const candidateFallback=true;\n'
  );
  const out = join(f.root, 'missing-snapshot');
  assert.throws(
    () => snapshotTrustedTestPlanner({ repo: f.root, base, out }),
    /Required BASE dependency missing/
  );
  assert.equal(existsSync(out), false);
});

test('syntax-aware BASE closure follows commented imports and ignores inert type/string text', t => {
  const f = trustedPlannerFixture(t, false);
  f.put(
    'scripts/run-affected-tests.mjs',
    [
      "/** @type {typeof import('./lib/type-only.mjs')} */",
      'const inert = "import(\'./lib/fake.mjs\')";',
      "await import /* webpackIgnore: true */ ('./lib/runtime.mjs');",
    ].join('\n')
  );
  f.put('scripts/lib/runtime.mjs', "export const value='trusted';\n");
  f.git('add', '.');
  f.git('commit', '-qm', 'runtime dependency with comments');
  const base = f.git('rev-parse', 'HEAD');
  const manifest = snapshotTrustedTestPlanner({
    repo: f.root,
    base,
    out: join(f.root, 'syntax-snapshot'),
  });
  assert.deepEqual(manifest.files.map(file => file.path).sort(), [
    'scripts/lib/runtime.mjs',
    'scripts/run-affected-tests.mjs',
  ]);
  f.put(
    'scripts/run-affected-tests.mjs',
    "const target='./lib/runtime.mjs';await import /* comment */ (target);\n"
  );
  f.git('add', '.');
  f.git('commit', '-qm', 'unsupported computed runtime import');
  assert.throws(
    () =>
      snapshotTrustedTestPlanner({
        repo: f.root,
        base: f.git('rev-parse', 'HEAD'),
        out: join(f.root, 'computed-snapshot'),
      }),
    /Unsupported computed BASE dependency/
  );
});

test('trusted snapshot verification rejects payload tampering', t => {
  const f = trustedPlannerFixture(t, true);
  const out = join(f.root, 'snapshot');
  const manifest = snapshotTrustedTestPlanner({
    repo: f.root,
    base: f.base,
    out,
  });
  const target = join(out, 'files', manifest.entry);
  // Replace only this test-owned generated file, preserving all repository work.
  rmSync(target);
  writeFileSync(target, 'export const tampered=true;\n');
  assert.throws(
    () => verifyTrustedTestPlanner(out, f.base),
    /snapshot changed/
  );
});

test('trusted engine/helper conflict paths are rejected by the actual workflow predicate', () => {
  const workflow = readFileSync(
    join(ROOT, '.github/workflows/pr-conflict-handler.yml'),
    'utf8'
  );
  const match = /elif jq -e '([\s\S]*?)'\s+<<<"\$conflict_files"/u.exec(
    workflow
  );
  assert.ok(match);
  const paths = [
    'scripts/lib/trusted-test-planner-snapshot.mjs',
    'scripts/lib/git-base-ref.mjs',
    'scripts/lib/onboarding-test-producers.mjs',
    'scripts/lib/product-shot-test-producers.mjs',
    'scripts/lib/art-direction-source-guard.mjs',
    'scripts/ci-fast-lanes.mjs',
  ];
  for (const input of paths.flatMap(file => [
    file,
    { file, oursBlob: 'a'.repeat(40), theirsBlob: 'b'.repeat(40) },
  ])) {
    const rejected = spawnSync('jq', ['-e', match[1]], {
      input: JSON.stringify([input]),
      encoding: 'utf8',
    });
    assert.equal(
      rejected.status,
      0,
      JSON.stringify(input) + ': ' + rejected.stderr
    );
  }
  const ordinary = spawnSync('jq', ['-e', match[1]], {
    input: JSON.stringify(['packages/ui/atoms/button.tsx']),
    encoding: 'utf8',
  });
  assert.equal(ordinary.status, 1);
});

test('pre-engine BASE is a structured machine rejection and never runs the candidate bootstrap', t => {
  const f = trustedPlannerFixture(t, false);
  f.git('rm', 'scripts/lib/trusted-test-planner-snapshot.mjs');
  f.git('commit', '-qm', 'base predates engine');
  const base = f.git('rev-parse', 'HEAD');
  const marker = join(f.root, 'candidate-executed');
  f.put(
    'scripts/lib/trusted-test-planner-snapshot.mjs',
    "import{writeFileSync}from'node:fs';writeFileSync(process.env.MARKER,'unsafe');\n"
  );
  const temp = join(f.root, 'runner');
  mkdirSync(temp);
  const output = join(temp, 'outputs');
  const { bootstrap } = workflowBootstrap();
  const script =
    'set -euo pipefail\nwrite_binding(){ printf \'%s\\n\' "$1" > "$RUNNER_TEMP/binding-status"; }\n' +
    bootstrap;
  const result = spawnSync('bash', ['--norc', '-c', script], {
    cwd: f.root,
    env: {
      ...f.env,
      BASE_HEAD: base,
      RUNNER_TEMP: temp,
      GITHUB_OUTPUT: output,
      MARKER: marker,
      expected_patch_sha: 'fixture',
      resolved_tree: 'fixture',
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(join(temp, 'binding-status'), 'utf8').trim(),
    'false'
  );
  assert.match(readFileSync(output, 'utf8'), /candidate=false/);
  assert.equal(existsSync(marker), false);
  assert.equal(existsSync(join(temp, 'trusted-planner')), false);
});

test('the trusted snapshot engine is present in every rolling sparse checkout and actual CI discovery', () => {
  const workflow = readFileSync(
    join(ROOT, '.github/workflows/rolling-ci-dispatch.yml'),
    'utf8'
  );
  const blocks = [
    ...workflow.matchAll(/sparse-checkout:\s*\|\n((?:[ ]{12}[^\n]*\n)+)/gu),
  ]
    .map(match => match[1])
    .filter(block => block.includes('scripts/run-affected-tests.mjs'));
  assert.equal(blocks.length, 4);
  for (const block of blocks)
    assert.match(block, /scripts\/lib\/trusted-test-planner-snapshot\.mjs/);
  const file = 'scripts/lib/trusted-test-planner-snapshot.mjs';
  const guard = selectSourceGuards('pull_request', [file]);
  assert.ok(guard.some(candidate => candidate.id === 'script-contracts'));
  const selection = selectScriptContracts([file], {
    root: ROOT,
    node: SCRIPT_CONTRACT_NODE_TESTS,
    vitest: [],
  });
  assert.ok(
    selection.node.includes(
      'scripts/lib/__tests__/script-contract-affected.test.mjs'
    )
  );
});
