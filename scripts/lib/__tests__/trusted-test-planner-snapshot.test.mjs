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
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  SCRIPT_CONTRACT_NODE_TESTS,
  scriptContractNodeArgs,
  selectSourceGuards,
} from '../../ci-fast-lanes.mjs';
import { selectScriptContracts } from '../script-contract-affected.mjs';
import {
  snapshotTrustedTestPlanner,
  verifyTrustedTestPlanner,
} from '../trusted-test-planner-snapshot.mjs';
import {
  trustedPlannerFixture,
  workflowBootstrap,
} from './trusted-planner-fixture.mjs';

const ROOT = join(import.meta.dirname, '../../..');

test('the isolated lane-runner snapshot loads the shared coverage-floor export', async t => {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(head.status, 0, head.stderr);
  const base = head.stdout.trim();
  const scratch = mkdtempSync(join(tmpdir(), 'trusted-lane-snapshot-'));
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const out = join(scratch, 'snapshot');
  const manifest = snapshotTrustedTestPlanner({ repo: ROOT, base, out });
  assert.ok(
    manifest.files.some(
      file => file.path === 'scripts/lib/ci-structural-shards.mjs'
    ),
    'the import closure must include the coverage-floor authority'
  );
  const mod = await import(
    `${pathToFileURL(join(out, 'files', 'scripts/ci-fast-lanes.mjs')).href}?isolated=${base}`
  );
  assert.ok(
    Array.isArray(mod.LANES_COVERAGE_FLOORS) &&
      mod.LANES_COVERAGE_FLOORS.length > 0
  );
  assert.equal(typeof mod.runStructural, 'function');
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
  assert.equal(
    readFileSync(
      join(f.root, 'scripts/lib/trusted-test-planner-snapshot.mjs'),
      'utf8'
    ),
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

test('module-initialization data comes from BASE and cannot fall back to candidate JSON', t => {
  const f = trustedPlannerFixture(t, false);
  const data = 'scripts/invariants/latency-sensitive-execution-allowlist.json';
  f.put(
    'scripts/run-affected-tests.mjs',
    "import './invariants/scanned-paths.mjs';\n"
  );
  f.put(
    'scripts/invariants/scanned-paths.mjs',
    "import {readFileSync} from 'node:fs';export const value=JSON.parse(readFileSync(new URL('./latency-sensitive-execution-allowlist.json',import.meta.url),'utf8'));\n"
  );
  f.put(data, '{"entries":{"trusted":{}}}');
  f.put('LESSONS.guards.json', '{"lessons":[]}');
  f.git('add', '.');
  f.git('commit', '-qm', 'base module initialization data');
  const base = f.git('rev-parse', 'HEAD');
  f.put(data, '{"entries":{"candidate":{}}}');
  const out = join(f.root, 'data-snapshot');
  const manifest = snapshotTrustedTestPlanner({ repo: f.root, base, out });
  assert.ok(manifest.files.some(file => file.path === data));
  assert.ok(manifest.files.some(file => file.path === 'LESSONS.guards.json'));
  assert.match(readFileSync(join(out, 'files', data), 'utf8'), /trusted/);
  f.git('rm', '-f', data);
  f.git('commit', '-qm', 'base missing required data');
  f.put(data, '{}');
  assert.throws(
    () =>
      snapshotTrustedTestPlanner({
        repo: f.root,
        base: f.git('rev-parse', 'HEAD'),
        out: join(f.root, 'missing-data-snapshot'),
      }),
    /Required BASE dependency missing/
  );
});

test('BASE-absent optional feedback data rejects candidate fallback before payload generation', t => {
  const f = trustedPlannerFixture(t, false);
  const actual = readFileSync(
    join(ROOT, 'scripts/invariants/scanned-paths.mjs'),
    'utf8'
  );
  const behavior = actual.slice(
    actual.indexOf('export function readFeedbackGuardPaths'),
    actual.indexOf('\nconst feedbackGuardPaths')
  );
  assert.ok(behavior.startsWith('export function readFeedbackGuardPaths'));
  f.put(
    'scripts/run-affected-tests.mjs',
    "import './invariants/scanned-paths.mjs';\n"
  );
  f.put(
    'scripts/invariants/scanned-paths.mjs',
    "import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';\n" +
      "const REPO_ROOT=fileURLToPath(new URL('../../',import.meta.url));\n" +
      behavior
  );
  f.put(
    'scripts/invariants/latency-sensitive-execution-allowlist.json',
    '{"entries":{}}'
  );
  f.git('add', '.');
  f.git('commit', '-qm', 'base has no optional feedback data');
  const base = f.git('rev-parse', 'HEAD');
  const entry = pathToFileURL(
    join(f.root, 'scripts/invariants/scanned-paths.mjs')
  ).href;
  const evaluate = () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'import(' +
          JSON.stringify(entry) +
          ').then(m=>console.log(JSON.stringify(m.readFeedbackGuardPaths())))',
      ],
      { cwd: f.root, env: f.env, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.deepEqual(evaluate(), []);
  f.put(
    'LESSONS.guards.json',
    JSON.stringify({ lessons: [{ guards: [{ path: 'candidate-only' }] }] })
  );
  assert.deepEqual(evaluate(), ['candidate-only']);
  const out = join(f.root, 'absent-feedback-snapshot');
  assert.throws(
    () => snapshotTrustedTestPlanner({ repo: f.root, base, out }),
    /Optional BASE feedback-guard input absent; refusing candidate fallback/
  );
  assert.equal(existsSync(out), false);
});

test('fixture rejects surplus arguments before writing a misleading payload', t => {
  const f = trustedPlannerFixture(t, false);
  assert.throws(
    () =>
      Reflect.apply(f.put, null, ['scripts/ignored.mjs', 'harmless', 'evil']),
    /fixture put requires exactly two arguments/
  );
  assert.equal(existsSync(join(f.root, 'scripts/ignored.mjs')), false);
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
  for (const input of paths) {
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
      'scripts/lib/__tests__/trusted-test-planner-snapshot.test.mjs'
    )
  );
});

test('real CI node runner includes this feature suite exactly once', () => {
  const file = 'scripts/lib/__tests__/trusted-test-planner-snapshot.test.mjs';
  assert.equal(
    SCRIPT_CONTRACT_NODE_TESTS.filter(entry => entry === file).length,
    1
  );
  assert.ok(
    scriptContractNodeArgs([file]).some(
      args => args[0] === '--test' && args.includes(file)
    )
  );
});
