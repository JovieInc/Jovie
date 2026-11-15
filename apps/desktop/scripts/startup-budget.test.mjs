import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { load } from 'js-yaml';
import {
  captureLaunch,
  LAUNCH_COUNT,
  median,
  SAMPLE_TIMES_MS,
  stageEvents,
  startStub,
  summarizeLaunches,
  validateReadiness,
} from './startup-budget.mjs';
import {
  intervalCpuPercent,
  parseStat,
  quitAndInspect,
  remainingChildren,
  summarizeSample,
} from './startup-budget-linux.mjs';

const sourceRevision = 'a'.repeat(40);
const readiness = () => ({
  schema: 'jovie-desktop-launch-readiness/v1',
  pid: 101,
  nativeBuild: { channel: 'local', sourceRevision },
  nativeWindowReadyToShowMs: 400,
  reactMountedMs: 600,
  composerVisibleEditableAfterPaintOpportunityMs: 700,
});
const row = (pid, ppid, extra = {}) => ({
  pid,
  ppid,
  group: 100,
  state: 'S',
  startTicks: pid,
  rssBytes: 10e6,
  cpuTicks: 10,
  ...extra,
});
const tree = () => [row(100, 1), row(101, 100), row(102, 101)];

test('S6 stub serves only loopback fixture routes and calls the real preload API after paint', async t => {
  const stub = await startStub(sourceRevision);
  t.after(stub.close);
  const response = await fetch(`${stub.url}/app/chat?runtime=electron`);
  assert.equal(response.status, 200);
  const html = await response.text();
  const info = await (await fetch(`${stub.url}/api/health/build-info`)).json();
  assert.equal(info.sourceRevision, sourceRevision);
  assert.equal((await fetch(`${stub.url}/missing`)).status, 404);
  const callbacks = [];
  const calls = [];
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    requestAnimationFrame: callback => callbacks.push(callback),
    window: {
      electronAPI: {
        notifyAppBooted: () => calls.push('boot'),
        notifyComposerReadiness: phase => calls.push(phase),
      },
    },
    document: { addEventListener() {} },
    setInterval() {},
    setTimeout() {},
    clearInterval() {},
  });
  assert.deepEqual(calls, []);
  callbacks.shift()();
  assert.deepEqual(calls, []);
  callbacks.shift()();
  assert.deepEqual(calls, ['boot', 'visible-editable']);
});

test('Linux samples retain PID identity and include reaped child CPU', () => {
  const fields = Array(22).fill('0');
  Object.assign(fields, {
    0: 'S',
    1: '100',
    2: '100',
    11: '40',
    12: '10',
    13: '5',
    14: '2',
    19: '1234',
  });
  const parsed = parseStat(
    `101 (a name (with parentheses)) ${fields.join(' ')}`,
    'VmRSS:\t2048 kB\n'
  );
  assert.equal(parsed.cpuTicks, 57);
  assert.equal(parsed.startTicks, 1234);
  assert.equal(parsed.rssBytes, 2097152);
  const first = summarizeSample(tree(), 100, 5000, 5000);
  const last = summarizeSample(
    [
      row(100, 1),
      row(101, 100, { cpuTicks: 40 }),
      row(102, 101, { cpuTicks: 20 }),
    ],
    100,
    35000,
    35000
  );
  assert.equal(first.processCount, 2); // Launcher is not Electron.
  assert.equal(first.treeRssMb, 20);
  assert.equal(intervalCpuPercent(first, last, 100), (40 / 3000) * 100);
  assert.throws(() => intervalCpuPercent(last, first, 100), /Invalid/);
  assert.throws(() => summarizeSample([], 100, 5000, 5000), /exited/);
});

test('S6 launch samples at T+5s/T+35s and validates native receipt identity', async () => {
  let clock = 0;
  let stopped = false;
  const waits = [];
  const run = await captureLaunch(1, {
    sourceRevision,
    ticksPerSecond: 100,
    now: () => clock,
    wait: async ms => {
      waits.push(ms);
      clock += ms;
    },
    launch: () => ({ pid: 100 }),
    snapshot: async () => (stopped ? [] : tree()),
    readReceipt: async () => readiness(),
    signal: () => {
      stopped = true;
    },
  });
  assert.equal(run.status, 'captured');
  assert.deepEqual(waits.slice(0, 2), [5000, 30000]);
  assert.deepEqual(
    run.samples.map(sample => sample.elapsedMs),
    SAMPLE_TIMES_MS
  );
  assert.deepEqual(run.cleanup.afterQuit, []);
  for (const invalid of [
    null,
    { ...readiness(), pid: 999 },
    { ...readiness(), reactMountedMs: null },
    { ...readiness(), nativeBuild: { channel: 'production', sourceRevision } },
  ])
    assert.throws(
      () => validateReadiness(invalid, 101, sourceRevision),
      /receipt/
    );
});

test('S6 cleanup detects reparented descendants before killing them and excludes reused PIDs', async () => {
  let clock = 0;
  let killed = false;
  const survivor = row(102, 1);
  const cleanup = await quitAndInspect({
    launcherPid: 100,
    mainPid: 101,
    known: tree(),
    now: () => clock,
    wait: async ms => {
      clock += ms;
    },
    snapshot: async () => (killed ? [] : [survivor]),
    signal: (_pid, signal) => {
      if (signal === 'SIGKILL') killed = true;
    },
  });
  assert.equal(cleanup.afterQuit.length, 1);
  assert.equal(cleanup.forcedCleanup, true);
  assert.deepEqual(cleanup.afterCleanup, []);
  assert.deepEqual(
    remainingChildren(
      [row(102, 1, { group: 200, startTicks: 999 })],
      100,
      tree()
    ),
    []
  );
});

test('cleanup kills identity-verified escaped children and still tears down on snapshot errors', async () => {
  let clock = 0;
  let escaped = true;
  const signals = [];
  const cleanup = await quitAndInspect({
    launcherPid: 100,
    mainPid: 101,
    known: tree(),
    now: () => clock,
    wait: async ms => {
      clock += ms;
    },
    snapshot: async () => (escaped ? [row(102, 1, { group: 200 })] : []),
    signal: (pid, signal) => {
      signals.push([pid, signal]);
      if (pid === 102 && signal === 'SIGKILL') escaped = false;
    },
  });
  assert.equal(cleanup.afterQuit.length, 1);
  assert.deepEqual(cleanup.afterCleanup, []);
  assert.ok(
    signals.some(([pid, signal]) => pid === 102 && signal === 'SIGKILL')
  );
  const failureSignals = [];
  await assert.rejects(
    quitAndInspect({
      launcherPid: 100,
      mainPid: 101,
      known: [],
      now: () => 0,
      wait: async () => {},
      snapshot: async () => {
        throw new Error('unreadable');
      },
      signal: (pid, signal) => failureSignals.push([pid, signal]),
    }),
    /unreadable/
  );
  assert.ok(
    failureSignals.some(([pid, signal]) => pid === -100 && signal === 'SIGKILL')
  );
  assert.equal(
    remainingChildren([row(102, 1, { state: 'Z' })], 100, tree()).length,
    1
  );
});

test('S6 failed launches still clean up and cannot produce a successful median', async () => {
  let clock = 0;
  const signals = [];
  const run = await captureLaunch(1, {
    sourceRevision,
    ticksPerSecond: 100,
    now: () => clock,
    wait: async ms => {
      clock += ms;
    },
    launch: () => ({ pid: 100 }),
    snapshot: async () => [],
    signal: (pid, signal) => signals.push([pid, signal]),
  });
  assert.equal(run.status, 'unavailable');
  assert.match(run.error, /exited/);
  assert.deepEqual(signals, [[-100, 'SIGKILL']]);
  assert.equal(summarizeLaunches([run]).medians, null);
});

test('S6 exactly five launches drop only the first, report even medians, and never hide a leak', () => {
  const runs = [99999, 10, 20, 30, 40].map((value, index) => ({
    index: index + 1,
    status: 'captured',
    readiness: { ...readiness(), reactMountedMs: value },
    samples: SAMPLE_TIMES_MS.map(targetMs => ({
      targetMs,
      processCount: 4,
      mainRssMb: 100,
      treeRssMb: 200,
    })),
    idleCpuPercent: 1,
    cleanup: { afterQuit: [] },
  }));
  assert.equal(LAUNCH_COUNT, 5);
  assert.equal(summarizeLaunches(runs).medians.reactMountedMs, 25);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([null, 1]), null);
  runs[0].cleanup.afterQuit.push({ pid: 1000 });
  assert.equal(
    summarizeLaunches(runs).targetResults.childrenAfterQuit.met,
    false
  );
  runs[2].status = 'unavailable';
  assert.equal(summarizeLaunches(runs).medians, null);
});

test('S6 CI captures on Ubuntu with sandbox intact and uploads the receipt on failure', async () => {
  const source = await readFile(
    new URL('../../../.github/workflows/macos-ci.yml', import.meta.url),
    'utf8'
  );
  assert.match(source, /startup-budget:/);
  assert.match(
    source,
    /xvfb-run -a pnpm --filter @jovie\/desktop run startup:budget/
  );
  assert.match(source, /name: desktop-startup-/);
  assert.match(source, /path: artifacts\/desktop-test-results\/startup-budget/);
  assert.doesNotMatch(source, /--no-sandbox|disable-setuid-sandbox/);
  const job = load(source).jobs['startup-budget'];
  assert.equal(job['continue-on-error'], undefined);
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.equal(job.steps.at(-1).if, '${{ always() }}');
});

test('startup stage events preserve failed evidence and are registered for collection', async () => {
  const run = {
    index: 1,
    status: 'unavailable',
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:00:05Z',
  };
  const events = stageEvents({
    sourceRevision,
    startedAt: run.startedAt,
    launches: [run],
  });
  assert.equal(events[0].outcome, 'failed');
  assert.equal(events[0].enteredAt, run.startedAt);
  const manifest = JSON.parse(
    await readFile(
      new URL('../../../docs/metrics/stage-manifest.json', import.meta.url),
      'utf8'
    )
  );
  assert.equal(
    manifest.entities['desktop-startup'].stages[0].id,
    events[0].stage
  );
  assert.equal(
    manifest.sources['desktop-startup-receipts'].artifact,
    'desktop-startup-receipts/stage-events.ndjson'
  );
});

test('graceful shutdown never signals a recycled main PID', async () => {
  const signals = [];
  const recycled = row(101, 1, { group: 900, startTicks: 999 });
  await quitAndInspect({
    launcherPid: 100,
    mainPid: 101,
    known: tree(),
    now: () => 0,
    wait: async () => {},
    snapshot: async () => [recycled],
    signal: (pid, signal) => signals.push([pid, signal]),
  });
  assert.deepEqual(signals, [[-100, 'SIGKILL']]);
});
