import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  assertCompleted,
  assertEquivalent,
  assertPrime,
  assertSeeds,
  cpuAllocation,
  effectiveTypeRoots,
  parseArgs,
  parseDiagnostics,
  readGraph,
  writeStageMetrics,
} from './native-typecheck-evidence.mjs';

const directories = [];
const temporary = () => {
  const path = mkdtempSync(resolve(tmpdir(), 'native-evidence-test-'));
  directories.push(path);
  return path;
};
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});

test('requires explicit execution and rejects arbitrary command or configuration flags', () => {
  const directory = temporary();
  const tools = resolve(directory, 'tools');
  const output = resolve(directory, 'result');
  assert.equal(parseArgs([]), null);
  assert.equal(parseArgs(['--help']), null);
  assert.throws(() => parseArgs(['--run']), /required/);
  assert.throws(
    () => parseArgs(['--run', '--tools', '--output', output]),
    /Missing/
  );
  assert.throws(() => parseArgs(['--command', 'evil']), /Unexpected/);
  assert.throws(() => parseArgs(['--run', '--run']), /Unexpected/);
  assert.throws(() => parseArgs(['--program', 'scripts']), /Unexpected/);
  assert.deepEqual(parseArgs(['--run', '--tools', tools, '--output', output]), {
    tools,
    output,
  });
});

test('uses the same first two permitted CPUs including sparse affinity masks', () => {
  assert.deepEqual(cpuAllocation('Cpus_allowed_list:\t4-7,12\n'), {
    parentAllowed: '4-7,12',
    selected: '4,5',
    count: 2,
  });
  assert.equal(cpuAllocation('Cpus_allowed_list:\t3,8-10\n').selected, '3,8');
  assert.throws(() => cpuAllocation('Cpus_allowed_list:\t1\n'), /two/);
  assert.throws(() => cpuAllocation('no affinity'), /Cannot/);
});

test('preserves implicit type roots when an overlay leaves the original directory', () => {
  const directory = temporary();
  const original = resolve(directory, 'app/tsconfig.json');
  const relocated = resolve(directory, 'outside/tsconfig.json');
  mkdirSync(resolve(directory, 'app'), { recursive: true });
  mkdirSync(resolve(directory, 'outside'), { recursive: true });
  writeFileSync(resolve(directory, 'app/source.ts'), 'export {};');
  writeFileSync(original, JSON.stringify({ include: ['source.ts'] }));
  writeFileSync(relocated, JSON.stringify({ extends: original }));
  const compiler = createRequire(import.meta.url)('typescript');
  const roots = effectiveTypeRoots(original, directory, compiler);
  assert.equal(roots[0], resolve(directory, 'app/node_modules/@types'));
  assert.notDeepEqual(
    effectiveTypeRoots(relocated, directory, compiler),
    roots
  );
  writeFileSync(
    relocated,
    JSON.stringify({ extends: original, compilerOptions: { typeRoots: roots } })
  );
  assert.deepEqual(effectiveTypeRoots(relocated, directory, compiler), roots);
});

test('rejects missing or changed warm cache bytes', () => {
  const directory = temporary();
  const cache = resolve(directory, 'cache');
  assert.throws(() => assertPrime(cache, 'expected'), /prime mismatch/);
  writeFileSync(cache, 'wrong compiler state');
  assert.throws(() => assertPrime(cache, 'expected'), /prime mismatch/);
});

test('normalizes paths and multiline diagnostics while retaining severity and exact message', () => {
  const result = parseDiagnostics(
    '\u001b[31m/repo/lib/a.ts(2,3): error TS2322: Wrong type.\u001b[0m\n    Nested detail.\n\tMaximum resident set size (kbytes): 200\nlib/b.ts(4,5): warning TS1234: Warning.\nerror TS5102: Unsupported option.',
    '/repo'
  );
  assert.equal(result.length, 3);
  assert.equal(
    result.find(item => item.path === 'lib/a.ts').message,
    'Wrong type.\nNested detail.'
  );
  assert.equal(
    result.find(item => item.path === 'lib/b.ts').severity,
    'warning'
  );
  assert.equal(result.find(item => item.code === 'TS5102').path, null);
});

test('rejects a fast timeout, crash, global config failure, unknown exit and false success', () => {
  const good = { exitCode: 0, timedOut: false, output: '', diagnostics: [] };
  assert.doesNotThrow(() => assertCompleted(good));
  for (const changes of [
    { timedOut: true },
    { exitCode: null },
    { exitCode: 7 },
    { exitCode: 2 },
    { output: 'thread compiler panicked' },
    { exitCode: 2, diagnostics: [{ path: null, code: 'TS5102' }] },
    { diagnostics: [{ path: 'lib/a.ts', code: 'TS2322', severity: 'error' }] },
  ])
    assert.throws(() => assertCompleted({ ...good, ...changes }));
});

test('retains real baseline diagnostics and rejects missing or extra differences', () => {
  const directory = temporary();
  const cache = resolve(directory, 'captured.json');
  writeFileSync(resolve(directory, 'a.ts'), 'export {};');
  writeFileSync(
    cache,
    JSON.stringify({
      version: '6.0.3',
      fileNames: ['a.ts'],
      fileInfos: ['fixture'],
      root: [1],
    })
  );
  const expected = {
    diagnostics: [{ path: 'a.ts', code: 'TS2322', message: 'real issue' }],
    graph: readGraph(cache, directory, resolve(directory, 'tools')),
  };
  assert.doesNotThrow(() =>
    assertEquivalent(structuredClone(expected), expected, 'same')
  );
  assert.throws(
    () =>
      assertEquivalent({ ...expected, diagnostics: [] }, expected, 'missing'),
    /diagnostic/
  );
  assert.throws(
    () =>
      assertEquivalent(
        { ...expected, graph: { repositoryFiles: [] } },
        expected,
        'partial'
      ),
    /graph/
  );
  assert.throws(
    () =>
      assertSeeds({ diagnostics: [] }, [
        { path: 'a.ts', line: 1, code: 'TS2322' },
      ]),
    /Seed missed/
  );
  assert.throws(() => assertSeeds({ diagnostics: [] }, []), /No seeded/);
});

test('keeps the workflow manual and connects its telemetry to the existing collector', () => {
  const root = resolve(import.meta.dirname, '../..');
  const workflow = readFileSync(
    resolve(root, '.github/workflows/typecheck-native-qualification.yml'),
    'utf8'
  );
  assert.match(workflow, /^  workflow_dispatch:$/mu);
  assert.doesNotMatch(
    workflow,
    /^  (?:pull_request|push|schedule|workflow_run|workflow_call):/mu
  );
  assert.match(workflow, /permissions:\n  contents: read/u);
  assert.doesNotMatch(workflow, /(?:secrets\.|: write|continue-on-error)/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /--frozen-lockfile --ignore-scripts/u);
  assert.match(workflow, /name: native-typecheck-qualification/u);
  const manifest = JSON.parse(
    readFileSync(resolve(root, 'docs/metrics/stage-manifest.json'), 'utf8')
  );
  assert.equal(
    manifest.sources['native-typecheck-qualification-receipts'].artifact,
    'native-typecheck-qualification/results/stage-events.ndjson'
  );
  assert.deepEqual(
    manifest.entities['native-typecheck-qualification'].stages.map(
      stage => stage.id
    ),
    ['qualification', 'finished']
  );
});

test('emits registered stage timings with an honest single sample', async () => {
  const root = resolve(import.meta.dirname, '../..');
  const output = temporary();
  const events = ['qualification', 'finished'].map(stage => ({
    schema: 'jovie-stage-event/v1',
    entityType: 'native-typecheck-qualification',
    entityId: 'fixture:run:attempt',
    stage,
    enteredAt:
      stage === 'qualification'
        ? '2026-01-01T00:00:00.000Z'
        : '2026-01-01T00:00:02.000Z',
    exitedAt: '2026-01-01T00:00:02.000Z',
    actor: null,
    outcome: 'completed',
    sourceReceipt: 'fixture.json',
  }));
  await writeStageMetrics(root, output, events);
  const snapshot = JSON.parse(
    readFileSync(resolve(output, 'stage-timings-latest.json'), 'utf8')
  );
  const observed =
    snapshot.entities['native-typecheck-qualification'].stages.qualification[
      '24h'
    ];
  assert.equal(observed.n, 1);
  assert.equal(observed.p50, 2);
  assert.equal(observed.p95, 2);
});
