import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectBaseline,
  confirmReadiness,
  parseOptions,
  parseProductionProcesses,
  renderProductionSummary,
  summarizeProcesses,
} from './capture-production-baseline.mjs';

const executable = '/Applications/Jovie.app/Contents/MacOS/Jovie';
const processTable = `
100 1 102400 2.5 ${executable}
101 100 51200 4.0 /Applications/Jovie.app/Contents/Frameworks/Jovie Helper (Renderer).app/Contents/MacOS/Jovie Helper (Renderer) --type=renderer --url=private
102 100 25600 1.0 Jovie Helper --type=gpu-process
103 100 10240 0.5 Jovie Helper --type=utility
104 103 1024 0.0 crashpad_handler
200 1 900000 99.0 unrelated --type=renderer
malformed row
`;
const processes = () => parseProductionProcesses(processTable);
const identity = { version: '26.10.0', sourceRevision: 'a'.repeat(40) };
const options = parseOptions([
  '--pid',
  '100',
  '--messages',
  '200',
  '--samples',
  '2',
]);

function dependencies(overrides = {}) {
  return {
    identity,
    options,
    executable,
    confirm: async () => 'ready',
    readProcesses: async () => processes(),
    prepareScenario: async () => {},
    readVisibility: async () => 'foreground',
    wait: async () => {},
    ...overrides,
  };
}

test('requires bounded run options and a representative fixture', () => {
  assert.equal(options.intervalMs, 2000);
  assert.equal(options.scenario, 'foreground-idle');
  assert.equal(parseOptions(['--help']).help, true);
  for (const extra of [
    [],
    ['--pid', '100oops', '--messages', '200'],
    ['--pid', '100', '--messages', '21'],
    ['--pid', '100', '--messages', '200', '--samples', '0'],
    ['--pid', '100', '--messages', '200', '--samples', '61'],
    ['--pid', '100', '--messages', '200', '--interval-ms', 'Infinity'],
    ['--pid', '100', '--messages', '200', '--scenario', 'unknown'],
    ['--pid', '100', '--messages', '200', '--app', '/tmp/dev'],
  ]) {
    assert.throws(() => parseOptions(extra));
  }
});

test('attributes the full app tree including GPU and utility descendants without leaking commands', () => {
  const sample = summarizeProcesses(processes(), 100, executable);
  assert.deepEqual(sample.byRole.main, {
    pids: [100],
    rssMiB: 100,
    cpuPercent: 2.5,
  });
  assert.deepEqual(sample.byRole.renderer, {
    pids: [101],
    rssMiB: 50,
    cpuPercent: 4,
  });
  assert.deepEqual(sample.byRole.gpu, {
    pids: [102],
    rssMiB: 25,
    cpuPercent: 1,
  });
  assert.deepEqual(sample.byRole.utility, {
    pids: [103],
    rssMiB: 10,
    cpuPercent: 0.5,
  });
  assert.deepEqual(sample.byRole.other, {
    pids: [104],
    rssMiB: 1,
    cpuPercent: 0,
  });
  const hardwareDefaults = processes();
  hardwareDefaults[2].command +=
    ' --use-gl=angle --use-angle=metal --disable-gpu-sandbox';
  assert.equal(
    summarizeProcesses(hardwareDefaults, 100, executable).byRole.gpu.rssMiB,
    25
  );
  assert.equal(sample.totalRssMiB, 186);
  assert.equal(sample.totalCpuPercent, 8);
  assert.doesNotMatch(JSON.stringify(sample), /private|unrelated|command/);
});

test('rejects dev/wrong PIDs, lost renderers, missing GPU, and altered launch switches', () => {
  assert.throws(
    () => summarizeProcesses(processes(), 200, executable),
    /selected main PID/
  );
  assert.throws(
    () =>
      summarizeProcesses(
        processes().filter(row => row.pid !== 100),
        100,
        executable
      ),
    /selected main PID/
  );
  for (const rolePid of [101, 102])
    assert.throws(
      () =>
        summarizeProcesses(
          processes().filter(row => row.pid !== rolePid),
          100,
          executable
        ),
      /renderer and GPU/
    );
  for (const flag of [
    '--disable-gpu',
    '--disable-gpu=true',
    '--disable-gpu-compositing',
    '--use-gl=swiftshader',
    '--use-angle=swiftshader',
    '--remote-debugging-port=9222',
    '--remote-debugging-pipe',
    '--headless',
    '--disable-hardware-acceleration',
  ]) {
    const altered = processes();
    altered[2].command += ` ${flag}`;
    assert.throws(
      () => summarizeProcesses(altered, 100, executable),
      /not representative/,
      flag
    );
  }
});

test('explicit readiness records attestation without converting it to startup proof', () => {
  assert.throws(() => confirmReadiness('', 'foreground-idle'), /not confirmed/);
  const ready = confirmReadiness(
    'ready',
    'hidden-streaming',
    '2026-10-02T00:00:00.000Z'
  );
  assert.equal(ready.method, 'operator-confirmed');
  assert.equal(ready.workState, 'response-streaming-at-confirmation');
  assert.equal(ready.confirmedAt, '2026-10-02T00:00:00.000Z');
  assert.equal(
    confirmReadiness(' ready ', 'foreground-idle').workState,
    'idle-at-confirmation'
  );
});

test('does not capture samples until the operator confirms and scenario is prepared', async () => {
  const events = [];
  const report = await collectBaseline(
    dependencies({
      readProcesses: async () => {
        events.push('processes');
        return processes();
      },
      confirm: async () => {
        events.push('ready');
        return 'ready';
      },
      prepareScenario: async () => {
        events.push('prepare');
      },
      wait: async milliseconds => {
        events.push(milliseconds);
      },
    })
  );
  assert.deepEqual(events, [
    'processes',
    'ready',
    'prepare',
    1000,
    'processes',
    2000,
    'processes',
  ]);
  assert.equal(report.status, 'baseline-captured');
  assert.equal(report.samples.length, 2);
  const summary = renderProductionSummary(report);
  assert.match(summary, /OS CPU/);
  assert.match(summary, /not a startup/);
  assert.match(summary, /operator attestation/);
  assert.match(summary, /not unique physical footprint/);
});

test('cancellation and foreground or hidden preparation failure never produce a baseline', async () => {
  let prepared = false;
  const rejected = await collectBaseline(
    dependencies({
      confirm: async () => 'no',
      prepareScenario: async () => {
        prepared = true;
      },
    })
  );
  assert.equal(prepared, false);
  assert.equal(rejected.status, 'incomplete');
  assert.equal(rejected.readiness, null);
  assert.equal(rejected.samples.length, 0);
  const failure = await collectBaseline(
    dependencies({
      prepareScenario: async () => {
        throw new Error('Accessibility unavailable');
      },
    })
  );
  assert.equal(failure.samples.length, 0);
  assert.match(failure.error, /Accessibility unavailable/);
  assert.match(renderProductionSummary(failure), /Collection error/);
});

test('a target crash during collection preserves partial evidence and fails the run', async () => {
  let reads = 0;
  const report = await collectBaseline(
    dependencies({
      readProcesses: async () => (++reads < 3 ? processes() : []),
    })
  );
  assert.equal(report.status, 'incomplete');
  assert.equal(report.samples.length, 1);
  assert.match(report.error, /selected main PID/);
});

test('visibility is observed for the selected process at each sample and mismatches fail closed', async () => {
  const hidden = await collectBaseline(
    dependencies({
      options: { ...options, scenario: 'hidden-streaming' },
      readVisibility: async () => 'hidden',
    })
  );
  assert.equal(hidden.status, 'baseline-captured');
  assert.equal(hidden.samples[0].visibility, 'hidden');
  let probes = 0;
  const mismatch = await collectBaseline(
    dependencies({
      readVisibility: async () => (++probes === 1 ? 'foreground' : 'other'),
    })
  );
  assert.equal(mismatch.status, 'incomplete');
  assert.equal(mismatch.samples.length, 1);
  assert.match(mismatch.error, /expected foreground/);
});
