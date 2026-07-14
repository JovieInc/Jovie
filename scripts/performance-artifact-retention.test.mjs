import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(import.meta.dirname, '..');
const cleanupScript = path.join(
  repoRoot,
  'scripts/performance-artifact-retention.mjs'
);

function fixture() {
  return realpathSync(
    mkdtempSync(path.join(os.tmpdir(), 'jovie-performance-retention-'))
  );
}

function run(root, ...args) {
  return spawnSync(
    process.execPath,
    [cleanupScript, ...args, '--repo-root', root],
    { encoding: 'utf8' }
  );
}

function makeRun(root, name, state, ageDays, options = {}) {
  const runPath = path.join(
    root,
    options.relativeRoot ?? 'artifacts/ios-test-results/runtime-performance',
    name
  );
  mkdirSync(path.join(runPath, 'result.xcresult'), { recursive: true });
  writeFileSync(
    path.join(runPath, 'result.xcresult', 'payload'),
    'large result'
  );
  if (state) writeFileSync(path.join(runPath, `.jovie-run-${state}`), '');
  if (options.childSymlink) {
    symlinkSync(options.childSymlink, path.join(runPath, 'external-link'));
  }
  if (options.unreadable) {
    const unreadable = path.join(runPath, 'unreadable');
    mkdirSync(unreadable);
    writeFileSync(path.join(unreadable, 'payload'), 'private');
    chmodSync(unreadable, 0o000);
  }

  const timestamp = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
  for (const file of [
    path.join(runPath, 'result.xcresult', 'payload'),
    path.join(runPath, 'result.xcresult'),
    state ? path.join(runPath, `.jovie-run-${state}`) : undefined,
    runPath,
  ]) {
    if (file) utimesSync(file, timestamp, timestamp);
  }
  return runPath;
}

test('retains two newest completed runs and preserves unsafe or non-terminal runs', () => {
  const root = fixture();
  const outside = fixture();
  const prefix = 'Test-Jovie-runtime-performance-2026.07.';
  const names = {
    newest: `${prefix}13_12-00-00-0700`,
    second: `${prefix}12_12-00-00-0700`,
    old: `${prefix}11_12-00-00-0700`,
    oldest: `${prefix}10_12-00-00-0700`,
    failed: `${prefix}09_12-00-00-0700`,
    active: `${prefix}08_12-00-00-0700`,
    abandoned: `${prefix}08_11-00-00-0700`,
    stale: `${prefix}07_12-00-00-0700`,
    young: `${prefix}06_12-00-00-0700`,
    linked: `${prefix}05_12-00-00-0700`,
    invalidState: `${prefix}04_12-00-00-0700`,
  };

  try {
    const paths = {
      newest: makeRun(root, names.newest, 'completed', 1),
      second: makeRun(root, names.second, 'completed', 2),
      old: makeRun(root, names.old, 'completed', 3),
      oldest: makeRun(root, names.oldest, 'completed', 4),
      failed: makeRun(root, names.failed, 'failed', 30),
      active: makeRun(root, names.active, 'in-progress', 1),
      abandoned: makeRun(root, names.abandoned, 'in-progress', 30),
      stale: makeRun(root, names.stale, undefined, 8),
      young: makeRun(root, names.young, undefined, 1),
      linked: makeRun(root, names.linked, 'completed', 30, {
        childSymlink: outside,
      }),
      invalidState: makeRun(root, names.invalidState, 'completed', 30),
    };
    const invalidStateTimestamp = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    );
    const conflictingMarker = path.join(
      paths.invalidState,
      '.jovie-run-failed'
    );
    writeFileSync(conflictingMarker, '');
    utimesSync(conflictingMarker, invalidStateTimestamp, invalidStateTimestamp);
    utimesSync(
      paths.invalidState,
      invalidStateTimestamp,
      invalidStateTimestamp
    );
    const invalid = path.join(
      root,
      'artifacts/ios-test-results/runtime-performance/manual-notes'
    );
    mkdirSync(invalid);
    writeFileSync(path.join(invalid, 'keep.txt'), 'keep');

    const result = run(root, 'retain', 'ios-runtime', '--apply');
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(paths.newest));
    assert.ok(existsSync(paths.second));
    assert.equal(existsSync(paths.old), false);
    assert.equal(existsSync(paths.oldest), false);
    assert.ok(existsSync(paths.failed));
    assert.ok(existsSync(paths.active));
    assert.equal(existsSync(paths.abandoned), false);
    assert.equal(existsSync(paths.stale), false);
    assert.ok(existsSync(paths.young));
    assert.ok(existsSync(paths.linked));
    assert.ok(existsSync(paths.invalidState));
    assert.ok(existsSync(path.join(outside)));
    assert.ok(existsSync(invalid));
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('uses recursive activity and preserves a run when its scan fails', () => {
  const root = fixture();
  const prefix = 'Test-Jovie-runtime-performance-2026.06.';
  let unreadable;
  try {
    makeRun(root, `${prefix}01_12-00-00-0700`, 'completed', 20);
    makeRun(root, `${prefix}02_12-00-00-0700`, 'completed', 19);
    makeRun(root, `${prefix}03_12-00-00-0700`, 'completed', 18);
    unreadable = makeRun(root, `${prefix}04_12-00-00-0700`, 'completed', 30, {
      unreadable: true,
    });

    const result = run(root, 'retain', 'ios-runtime', '--apply');
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /Preserving unscannable artifact run/);
    assert.ok(existsSync(unreadable));
  } finally {
    if (unreadable) {
      chmodSync(path.join(unreadable, 'unreadable'), 0o700);
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('matches the launch and memory run names emitted by their shell producers', () => {
  const root = fixture();
  const cases = [
    {
      producer: 'ios-launch',
      relativeRoot: 'artifacts/ios-test-results/launch-performance',
      names: [
        'Test-Jovie-launch-performance-2026.07.11_12-00-00-0700',
        'Test-Jovie-launch-performance-2026.07.12_12-00-00-0700',
        'Test-Jovie-launch-performance-2026.07.13_12-00-00-0700',
      ],
    },
    {
      producer: 'ios-memory',
      relativeRoot: 'artifacts/ios-test-results/memory-baseline',
      names: [
        'Jovie-memory-baseline-2026.07.11_12-00-00--0700',
        'Jovie-memory-baseline-2026.07.12_12-00-00--0700',
        'Jovie-memory-baseline-2026.07.13_12-00-00--0700',
      ],
    },
  ];

  try {
    for (const entry of cases) {
      const paths = entry.names.map((name, index) =>
        makeRun(root, name, 'completed', 3 - index, {
          relativeRoot: entry.relativeRoot,
        })
      );
      const dryRun = run(root, 'retain', entry.producer, '--dry-run');
      assert.equal(dryRun.status, 0, dryRun.stderr);
      assert.match(dryRun.stdout, /removed=0 bytes=0/);
      assert.ok(paths.every(runPath => existsSync(runPath)));
      const result = run(root, 'retain', entry.producer, '--apply');
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(paths[0]), false);
      assert.ok(existsSync(paths[1]));
      assert.ok(existsSync(paths[2]));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('retains three failed runs, applies a 24-hour floor, and reports actual removals', () => {
  const root = fixture();
  try {
    const runtimeRoot = 'artifacts/ios-test-results/runtime-performance';
    const oldFailed = [1, 2, 3, 4, 5, 6].map(day =>
      makeRun(
        root,
        `Test-Jovie-runtime-performance-2026.06.${String(day).padStart(2, '0')}_12-00-00-0700`,
        'failed',
        8 - day,
        { relativeRoot: runtimeRoot }
      )
    );
    const result = run(root, 'retain', 'ios-runtime', '--apply');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(oldFailed.filter(runPath => existsSync(runPath)).length, 3);
    assert.match(result.stdout, /removed=3 bytes=[1-9][0-9]*/);

    const launchRoot = 'artifacts/ios-test-results/launch-performance';
    const recentFailed = [1, 2, 3, 4].map(hour =>
      makeRun(
        root,
        `Test-Jovie-launch-performance-2026.07.13_0${hour}-00-00-0700`,
        'failed',
        hour / 24,
        { relativeRoot: launchRoot }
      )
    );
    const recentResult = run(root, 'retain', 'ios-launch', '--apply');
    assert.equal(recentResult.status, 0, recentResult.stderr);
    assert.ok(recentFailed.every(runPath => existsSync(runPath)));
    assert.match(recentResult.stdout, /removed=0 bytes=0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('retention refuses a symlinked ancestor even when the run root is absent', () => {
  const root = fixture();
  const outside = fixture();
  try {
    writeFileSync(path.join(outside, '.sentinel'), 'safe');
    symlinkSync(outside, path.join(root, 'artifacts'));
    const result = run(root, 'retain', 'ios-runtime', '--apply');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /symlinked ancestor/);
    assert.deepEqual(
      readFileSync(path.join(outside, '.sentinel'), 'utf8'),
      'safe'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('owned resets reject roots, outside paths, and symlink escapes', () => {
  const root = fixture();
  const outside = fixture();
  try {
    const valid = path.join(root, 'artifacts/ios-screenshots/custom-run');
    mkdirSync(valid, { recursive: true });
    writeFileSync(path.join(valid, 'stale.png'), 'stale');
    const reset = run(root, 'reset', 'ios-screenshots', valid, '--apply');
    assert.equal(reset.status, 0, reset.stderr);
    assert.ok(existsSync(valid));
    assert.equal(existsSync(path.join(valid, 'stale.png')), false);

    const defaultScreenshotRoot = path.join(root, 'artifacts/ios-screenshots');
    const defaultReset = run(
      root,
      'reset',
      'ios-screenshots',
      defaultScreenshotRoot,
      '--dry-run'
    );
    assert.equal(defaultReset.status, 0, defaultReset.stderr);
    assert.ok(existsSync(defaultScreenshotRoot));

    const ciDerivedData = path.join(root, '.build/ios-ci');
    const derivedReset = run(
      root,
      'reset',
      'ios-screenshot-derived-data',
      ciDerivedData,
      '--apply'
    );
    assert.equal(derivedReset.status, 0, derivedReset.stderr);
    assert.ok(existsSync(ciDerivedData));

    const benchmarkOutput = path.join(
      root,
      'apps/web/test-results/benchmark-test-performance/latest'
    );
    mkdirSync(benchmarkOutput, { recursive: true });
    writeFileSync(path.join(benchmarkOutput, 'previous.txt'), 'old benchmark');
    const benchmarkReset = run(root, 'reset', 'web-test-benchmark', '--apply');
    assert.equal(benchmarkReset.status, 0, benchmarkReset.stderr);
    assert.ok(existsSync(benchmarkOutput));
    assert.equal(existsSync(path.join(benchmarkOutput, 'previous.txt')), false);

    for (const unsafe of [root, path.join(root, 'artifacts'), outside]) {
      const result = run(root, 'reset', 'ios-screenshots', unsafe, '--apply');
      assert.notEqual(result.status, 0, unsafe);
    }

    const link = path.join(root, 'artifacts/ios-screenshots/link');
    symlinkSync(outside, link);
    const linked = run(root, 'reset', 'ios-screenshots', link, '--apply');
    assert.notEqual(linked.status, 0);
    assert.ok(existsSync(path.join(outside)));

    const linkedAncestor = path.join(root, '.build');
    rmSync(linkedAncestor, { recursive: true });
    symlinkSync(outside, linkedAncestor);
    const escaped = run(
      root,
      'reset',
      'ios-memory-derived-data',
      path.join(linkedAncestor, 'memory'),
      '--apply'
    );
    assert.notEqual(escaped.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('producer shells use bounded owned outputs and pnpm', () => {
  const scripts = {
    memory: readFileSync(
      path.join(repoRoot, 'apps/ios/scripts/capture-memory-baseline.sh'),
      'utf8'
    ),
    runtime: readFileSync(
      path.join(repoRoot, 'apps/ios/scripts/measure-runtime-performance.sh'),
      'utf8'
    ),
    launch: readFileSync(
      path.join(repoRoot, 'apps/ios/scripts/measure-launch-performance.sh'),
      'utf8'
    ),
    screenshots: readFileSync(
      path.join(repoRoot, 'apps/ios/scripts/capture-screenshots.sh'),
      'utf8'
    ),
    benchmark: readFileSync(
      path.join(repoRoot, 'apps/web/scripts/benchmark-test-performance.sh'),
      'utf8'
    ),
  };

  for (const script of [scripts.memory, scripts.runtime, scripts.launch]) {
    assert.match(script, /\.jovie-run-in-progress/);
    assert.match(script, /\.jovie-run-completed/);
    assert.match(script, /\.jovie-run-failed/);
    assert.match(script, /RESULTS_DIR" == "\$DEFAULT_RESULTS_DIR/);
    assert.ok((script.match(/ retain ios-/g) ?? []).length >= 2);
  }
  assert.match(scripts.memory, /reset ios-memory-derived-data/);
  assert.match(scripts.screenshots, /reset ios-screenshots/);
  assert.match(scripts.screenshots, /reset ios-screenshot-derived-data/);
  assert.match(scripts.benchmark, /reset web-test-benchmark/);
  assert.match(scripts.benchmark, /set -euo pipefail/);
  assert.match(scripts.benchmark, /duration:-not reported/);
  assert.match(scripts.benchmark, /benchmark-test-performance\/latest/);
  assert.match(scripts.benchmark, /pnpm --dir/);
  assert.doesNotMatch(scripts.benchmark, /\bnpm test\b/);
  assert.doesNotMatch(scripts.benchmark, /TIMESTAMP|_[${]TIMESTAMP[}]/);
});

test('benchmark shell stops before pnpm when its owned reset fails', () => {
  const root = fixture();
  try {
    const scriptDirectory = path.join(root, 'apps/web/scripts');
    const binDirectory = path.join(root, 'bin');
    mkdirSync(scriptDirectory, { recursive: true });
    mkdirSync(binDirectory, { recursive: true });
    const benchmarkScript = path.join(
      scriptDirectory,
      'benchmark-test-performance.sh'
    );
    writeFileSync(
      benchmarkScript,
      readFileSync(
        path.join(repoRoot, 'apps/web/scripts/benchmark-test-performance.sh'),
        'utf8'
      )
    );
    const nodeStub = path.join(binDirectory, 'node');
    const pnpmStub = path.join(binDirectory, 'pnpm');
    const pnpmMarker = path.join(root, 'pnpm-was-called');
    writeFileSync(nodeStub, '#!/usr/bin/env bash\nexit 42\n');
    writeFileSync(
      pnpmStub,
      `#!/usr/bin/env bash\nprintf called > ${JSON.stringify(pnpmMarker)}\n`
    );
    chmodSync(nodeStub, 0o755);
    chmodSync(pnpmStub, 0o755);

    const result = spawnSync('bash', [benchmarkScript], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${binDirectory}:${process.env.PATH}` },
    });
    assert.equal(result.status, 42);
    assert.equal(existsSync(pnpmMarker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('benchmark shell reports omitted optional durations without failing', () => {
  const root = fixture();
  try {
    const scriptDirectory = path.join(root, 'apps/web/scripts');
    const binDirectory = path.join(root, 'bin');
    mkdirSync(scriptDirectory, { recursive: true });
    mkdirSync(binDirectory, { recursive: true });
    const benchmarkScript = path.join(
      scriptDirectory,
      'benchmark-test-performance.sh'
    );
    writeFileSync(
      benchmarkScript,
      readFileSync(
        path.join(repoRoot, 'apps/web/scripts/benchmark-test-performance.sh'),
        'utf8'
      )
    );
    const nodeStub = path.join(binDirectory, 'node');
    const pnpmStub = path.join(binDirectory, 'pnpm');
    writeFileSync(
      nodeStub,
      '#!/usr/bin/env bash\nmkdir -p "$FIXTURE_ROOT/apps/web/test-results/benchmark-test-performance/latest"\n'
    );
    writeFileSync(
      pnpmStub,
      '#!/usr/bin/env bash\nprintf "Tests 1 passed\\n"\n'
    );
    chmodSync(nodeStub, 0o755);
    chmodSync(pnpmStub, 0o755);

    const result = spawnSync('bash', [benchmarkScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        FIXTURE_ROOT: root,
        PATH: `${binDirectory}:${process.env.PATH}`,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /not reported/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('screenshot shell rejects an external reset override before tool execution', () => {
  const outside = fixture();
  try {
    const sentinel = path.join(outside, 'keep.txt');
    writeFileSync(sentinel, 'keep');
    const result = spawnSync(
      'bash',
      [path.join(repoRoot, 'apps/ios/scripts/capture-screenshots.sh')],
      {
        encoding: 'utf8',
        env: { ...process.env, IOS_SCREENSHOT_DIR: outside },
      }
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /producer-owned descendant/);
    assert.equal(readFileSync(sentinel, 'utf8'), 'keep');
    assert.doesNotMatch(result.stdout, /Preparing simulator/);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});
