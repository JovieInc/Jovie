import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { afterEach, test } from 'node:test';
import {
  inspectTools,
  readGraph,
  seedPlan,
  withMutation,
} from './lib/native-typecheck-evidence.mjs';
import { runQualification } from './typecheck-native-qualification.mjs';

const directories = [];
const temporary = () => {
  const path = mkdtempSync(resolve(tmpdir(), 'native-qualification-test-'));
  directories.push(path);
  return path;
};
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
const save = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof value === 'string' ? value : JSON.stringify(value)
  );
};
const git = (root, args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const FILES = [
  'apps/web/lib/hud/number-series.ts',
  'packages/ui/lib/utils.ts',
  'apps/web/lib/design/generated/design-tokens.ts',
  'packages/extension-contracts/index.ts',
  'apps/web/lib/extensions/summary.ts',
];

function fixture() {
  const directory = temporary();
  const root = resolve(directory, 'repo');
  mkdirSync(root);
  for (const path of FILES)
    save(resolve(root, path), 'export type Original = never;\n');
  save(resolve(root, 'apps/web/tsconfig.typecheck.json'), {
    compilerOptions: { strict: true, incremental: true },
    include: ['lib/**/*.ts'],
  });
  save(resolve(root, 'packages/ui/tsconfig.json'), {
    compilerOptions: { strict: true, incremental: true },
    include: ['lib/**/*.ts'],
  });
  git(root, ['init', '--quiet']);
  git(root, ['add', '.']);
  git(root, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  ]);
  const tools = resolve(directory, 'tools');
  mkdirSync(tools);
  const pins = {
    lockSha256: 'fixture-only',
    packages: Object.fromEntries(
      ['ts6', 'tsrs', 'upstream'].map(alias => [
        alias,
        {
          executable: resolve(tools, alias, 'compiler'),
          packageTreeSha256: alias,
        },
      ])
    ),
  };
  const plans = Object.fromEntries(
    ['web', 'ui'].map(program => [program, seedPlan(root, program)])
  );
  let tick = 0;
  const calls = [];
  const execute = async argv => {
    const config = argv[argv.indexOf('--project') + 1];
    const cache = argv[argv.indexOf('--tsBuildInfoFile') + 1];
    const alias =
      argv[3] === process.execPath
        ? 'ts6'
        : argv[3].includes('/tsrs/')
          ? 'tsrs'
          : 'upstream';
    const program = config.includes('web') ? 'web' : 'ui';
    const files = program === 'web' ? FILES : ['packages/ui/lib/utils.ts'];
    const seeded = files.some(file =>
      readFileSync(resolve(root, file), 'utf8').includes(
        '__nativeQualification'
      )
    );
    const diagnostics = seeded
      ? Object.values(plans[program])
          .flatMap(item => item.expected)
          .map(
            seed =>
              `${seed.path}(${seed.line},1): error ${seed.code}: Deliberate fixture error.`
          )
      : [];
    save(cache, {
      fileNames: files.map(file =>
        relative(dirname(cache), resolve(root, file))
      ),
      root: [[1, files.length]],
    });
    calls.push({ alias, program, config, cache, seeded, argv });
    return {
      output: diagnostics.join('\n'),
      durationMs: 10,
      exitCode: seeded ? 2 : 0,
      timedOut: false,
      peakRssKb: 1024,
      cpuPercent: 100,
    };
  };
  return {
    root,
    tools,
    output: resolve(directory, 'output'),
    inspect: () => structuredClone(pins),
    expectedSha: git(root, ['rev-parse', 'HEAD']),
    emitMetrics: async () => {},
    resolveTypeRoots: config => [
      resolve(dirname(config), 'node_modules/@types'),
    ],
    execute,
    calls,
    monotonic: () => tick++,
    now: () => new Date('2026-01-01T00:00:00.000Z'),
    plans,
  };
}

test('expands compressed root ranges and rejects empty, out-of-range or external programs', () => {
  const data = fixture();
  const cache = resolve(data.output, 'cache.tsbuildinfo');
  save(cache, {
    fileNames: FILES.map(file =>
      relative(dirname(cache), resolve(data.root, file))
    ),
    root: [[1, FILES.length]],
  });
  const graph = readGraph(cache, data.root, data.tools);
  assert.equal(graph.repositoryFiles.length, FILES.length);
  assert.equal(graph.rootFiles.length, FILES.length);
  for (const root of [[], [0], [99], [[4, 1]]]) {
    save(cache, { fileNames: ['external.ts'], root });
    assert.throws(() => readGraph(cache, data.root, data.tools));
  }
});

test('restores exact source bytes after an edited invocation throws', async () => {
  const data = fixture();
  const path = FILES[0];
  const before = readFileSync(resolve(data.root, path));
  await assert.rejects(
    withMutation(data.root, { [path]: '\ninvalid probe\n' }, async () => {
      throw new Error('fixture failure');
    }),
    /fixture failure/
  );
  assert.deepEqual(readFileSync(resolve(data.root, path)), before);
});

test('completes all matched cold/warm/seed/edit/revert scenarios with honest receipts', async () => {
  const data = fixture();
  const result = await runQualification(data);
  assert.equal(result.status, 'qualified-for-advisory-observation');
  assert.equal(result.runs.length, 38);
  assert.equal(data.calls.length, 38);
  assert.equal(result.adoptionEligible, false);
  assert.equal(result.requiredGate, 'not-run-by-this-tool');
  assert.equal(result.sourceRestored, true);
  assert.equal(result.toolsUnchanged, true);
  assert.equal(result.graphSourceRestored, true);
  assert.equal(result.requiredGateCriticalPathSavingsMs, null);
  for (const run of result.runs.filter(item => item.scenario === 'cold'))
    assert.equal(run.cacheBefore, null);
  for (const run of result.runs.filter(item => item.scenario === 'warm'))
    assert.equal(run.cacheBefore, run.primeHash);
  assert.equal(
    result.runs.filter(item => item.scenario.endsWith('-revert')).length,
    9
  );
  assert.ok(
    data.calls.every(
      call =>
        call.argv[0] === '/usr/bin/taskset' &&
        call.argv[2] === result.hardware.cpuAffinity.selected
    )
  );
  assert.equal(
    result.runs.filter(
      item => item.program === 'ui' && item.scenario === 'leaf-edit'
    ).length,
    0
  );
  const overlay = JSON.parse(
    readFileSync(resolve(data.output, 'web-tsrs.json'), 'utf8')
  );
  assert.equal(overlay.compilerOptions.baseUrl, null);
  assert.equal(
    overlay.compilerOptions.types[0],
    resolve(data.root, 'apps/web/tests/types/vitest')
  );
  assert.equal(overlay.compilerOptions.strict, undefined);
  assert.deepEqual(overlay.compilerOptions.typeRoots, [
    resolve(data.root, 'apps/web/node_modules/@types'),
  ]);
  assert.equal(git(data.root, ['status', '--porcelain']), '');
  assert.equal(
    readFileSync(resolve(data.output, 'stage-events.ndjson'), 'utf8')
      .trim()
      .split('\n').length,
    2
  );
  assert.ok(result.statistics.every(item => item.n === 1));
});

test('blocks a candidate which misses one seed and preserves raw failure logs', async () => {
  const data = fixture();
  const execute = data.execute;
  data.execute = async (...args) => {
    const result = await execute(...args);
    if (data.calls.at(-1).alias === 'tsrs' && data.calls.at(-1).seeded)
      result.output = result.output.split('\n').slice(1).join('\n');
    return result;
  };
  const result = await runQualification(data);
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /Seed missed/);
  assert.equal(result.sourceRestored, true);
  assert.ok(
    result.runs.every(run => existsSync(resolve(data.output, run.rawLog)))
  );
});

test('blocks reduced coverage before crediting any candidate timing', async () => {
  const data = fixture();
  const execute = data.execute;
  data.execute = async (...args) => {
    const result = await execute(...args);
    const call = data.calls.at(-1);
    if (call.alias === 'tsrs')
      save(call.cache, {
        fileNames: [
          relative(dirname(call.cache), resolve(data.root, FILES[0])),
        ],
        root: [1],
      });
    return result;
  };
  const result = await runQualification(data);
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /graph parity/);
});

test('blocks matched-config differences from original TS6 intent', async () => {
  const data = fixture();
  const execute = data.execute;
  data.execute = async (...args) => {
    const result = await execute(...args);
    if (data.calls.at(-1).config.endsWith('web-ts6.json'))
      return {
        ...result,
        exitCode: 2,
        output:
          'apps/web/lib/hud/number-series.ts(1,1): error TS2322: Configuration changed semantics.',
      };
    return result;
  };
  const result = await runQualification(data);
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /diagnostic parity/);
});

test('blocks a timeout and an exception during an edit while restoring source', async () => {
  for (const mode of ['timeout', 'exception', 'interruption']) {
    const data = fixture();
    const execute = data.execute;
    data.execute = async (...args) => {
      if (
        readFileSync(resolve(data.root, FILES[0]), 'utf8').includes(
          '__NativeQualificationLeaf'
        )
      ) {
        if (mode === 'exception') throw new Error('edited child failed');
        if (mode === 'interruption') process.emit('SIGTERM');
        return {
          output: '',
          durationMs: 20,
          exitCode: 1,
          timedOut: true,
          peakRssKb: null,
          cpuPercent: null,
        };
      }
      return execute(...args);
    };
    const result = await runQualification(data);
    assert.equal(result.status, 'blocked');
    assert.equal(result.sourceRestored, true);
    assert.equal(git(data.root, ['status', '--porcelain']), '');
  }
});

test('requires a clean head, external fresh evidence directory and expected dispatched SHA', async () => {
  const data = fixture();
  await assert.rejects(
    runQualification({ ...data, output: data.tools }),
    /fresh directory/
  );
  await assert.rejects(
    runQualification({ ...data, output: resolve(data.root, 'evidence') }),
    /outside/
  );
  save(resolve(data.root, 'unexpected.ts'), 'export {};');
  await assert.rejects(runQualification(data), /clean exact-head/);
  rmSync(resolve(data.root, 'unexpected.ts'));
  await assert.rejects(
    runQualification({ ...data, expectedSha: '0'.repeat(40) }),
    /expected SHA/
  );
});

test('blocks suite exhaustion and changed tool provenance', async () => {
  const data = fixture();
  let elapsed = 0;
  const exhausted = await runQualification({
    ...data,
    monotonic: () => (elapsed += 300_000),
  });
  assert.equal(exhausted.status, 'blocked');
  assert.match(exhausted.error, /deadline/);
  const changed = fixture();
  let reads = 0;
  const original = changed.inspect;
  changed.inspect = () => ({ ...original(), generation: ++reads });
  const result = await runQualification(changed);
  assert.equal(result.status, 'blocked');
  assert.equal(result.toolsUnchanged, false);
});

test('blocks telemetry failure without leaving timing eligibility enabled', async () => {
  const data = fixture();
  const result = await runQualification({
    ...data,
    emitMetrics: async () => {
      throw new Error('fixture telemetry failed');
    },
  });
  assert.equal(result.status, 'blocked');
  assert.match(result.error, /telemetry/);
  assert.ok(result.statistics.every(row => row.eligibleForTiming === false));
});

test('checks isolated package identities and rejects lifecycle scripts or changed lock bytes', () => {
  const data = fixture();
  const sidecar = resolve(
    data.root,
    '.github/ci-harness/typecheck-native-tools'
  );
  save(resolve(sidecar, 'package.json'), '{}');
  save(resolve(sidecar, 'pnpm-lock.yaml'), 'fixture pin lock');
  cpSync(sidecar, data.tools, { recursive: true });
  for (const [alias, name, version, executable] of [
    ['ts6', 'typescript', '6.0.3', 'bin/tsc'],
    ['tsrs', '@tsrs/linux-x64-gnu', '0.25.0-ts7.1.0-beta', 'tsrs'],
    ['upstream', '@typescript/typescript-linux-x64', '7.1.0-beta', 'lib/tsc'],
  ]) {
    save(resolve(data.tools, 'node_modules', alias, 'package.json'), {
      name,
      version,
      scripts: { test: 'unused test command' },
    });
    save(
      resolve(data.tools, 'node_modules', alias, executable),
      'fixture executable, never run'
    );
  }
  assert.equal(
    inspectTools(data.root, data.tools).packages.tsrs.version,
    '0.25.0-ts7.1.0-beta'
  );
  const metadataPath = resolve(data.tools, 'node_modules/tsrs/package.json');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  save(metadataPath, {
    ...metadata,
    scripts: { install: 'unapproved installer' },
  });
  assert.throws(() => inspectTools(data.root, data.tools), /install scripts/);
  save(metadataPath, { ...metadata, version: '0.25.1' });
  assert.throws(
    () => inspectTools(data.root, data.tools),
    /Unexpected compiler pin/
  );
  save(metadataPath, metadata);
  save(resolve(data.tools, 'pnpm-lock.yaml'), 'changed');
  assert.throws(() => inspectTools(data.root, data.tools), /lock differs/);
});

test('CLI help never invokes a checker or writes evidence', () => {
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, 'typecheck-native-qualification.mjs')],
    { encoding: 'utf8' }
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.equal(result.stderr, '');
});
