import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseCertOptions, runPerformanceCert } from './performance-cert.mjs';
import {
  buildCertReport,
  evaluatePerformanceContract,
  exitCodeForReport,
  liveCertGate,
  measurementsFromLaunchReadiness,
  measurementsFromProductionBaseline,
  mergeMeasurements,
  metricPasses,
  PERFORMANCE_CONTRACT,
} from './performance-contract.mjs';

const underBudget = {
  warmLaunchMs: 400,
  cachedNavigationMs: 80,
  coldLaunchToUsableMs: 1200,
  typingLatencyMs: 12,
  commandPaletteMs: 40,
  idleCpuPercent: 0.5,
  unintendedLayoutShifts: 0,
  lostDrafts: 0,
};

test('charter budgets match the daily-driver contract', () => {
  const { budgets } = PERFORMANCE_CONTRACT;
  assert.equal(budgets.warmLaunchMs.limit, 500);
  assert.equal(budgets.cachedNavigationMs.limit, 100);
  assert.equal(budgets.coldLaunchToUsableMs.limit, 1500);
  assert.equal(budgets.typingLatencyMs.limit, 16);
  assert.equal(budgets.commandPaletteMs.limit, 50);
  assert.equal(budgets.idleCpuPercent.limit, 1);
  assert.equal(budgets.unintendedLayoutShifts.limit, 0);
  assert.equal(budgets.lostDrafts.limit, 0);
  assert.equal(PERFORMANCE_CONTRACT.issue, 'JOV-7463');
});

test('metricPasses enforces lte and exact-zero equality', () => {
  assert.equal(metricPasses({ comparison: 'lte', limit: 500 }, 500), true);
  assert.equal(metricPasses({ comparison: 'lte', limit: 500 }, 501), false);
  assert.equal(metricPasses({ comparison: 'eq', limit: 0 }, 0), true);
  assert.equal(metricPasses({ comparison: 'eq', limit: 0 }, 1), false);
  assert.equal(
    metricPasses({ comparison: 'lte', limit: 1 }, Number.NaN),
    false
  );
});

test('evaluatePerformanceContract certifies under budget and rejects regressions', () => {
  const pass = evaluatePerformanceContract(underBudget);
  assert.equal(pass.status, 'certified');
  assert.equal(pass.regressions, 0);
  assert.equal(pass.missing, 0);

  const fail = evaluatePerformanceContract({
    ...underBudget,
    warmLaunchMs: 501,
    idleCpuPercent: 1.1,
  });
  assert.equal(fail.status, 'regression');
  assert.equal(fail.regressions, 2);
  assert.equal(fail.results.warmLaunchMs.met, false);
  assert.equal(fail.results.idleCpuPercent.met, false);

  const incomplete = evaluatePerformanceContract({ warmLaunchMs: 100 });
  assert.equal(incomplete.status, 'incomplete');
  assert.ok(incomplete.missing >= 7);
});

test('launch readiness maps cold usable UI without inventing warm metrics', () => {
  const mapped = measurementsFromLaunchReadiness({
    schema: 'jovie-desktop-launch-readiness/v1',
    pid: 42,
    composerVisibleEditableAfterPaintOpportunityMs: 1337,
    nativeBuild: { channel: 'production', sourceRevision: 'a'.repeat(40) },
  });
  assert.equal(mapped.coldLaunchToUsableMs, 1337);
  assert.equal(mapped.warmLaunchMs, undefined);
  assert.throws(() => measurementsFromLaunchReadiness({ schema: 'nope' }));
});

test('production baseline maps idle CPU mean and rejects non-idle scenarios', () => {
  const mapped = measurementsFromProductionBaseline({
    schema: 'jovie-desktop-production-baseline/v1',
    status: 'baseline-captured',
    scenario: 'foreground-idle',
    nativeBuild: { version: '26.11.5' },
    samples: [
      { totalCpuPercent: 0.4 },
      { totalCpuPercent: 0.6 },
      { totalCpuPercent: 0.5 },
    ],
  });
  assert.equal(mapped.idleCpuPercent, 0.5);
  assert.throws(() =>
    measurementsFromProductionBaseline({
      schema: 'jovie-desktop-production-baseline/v1',
      scenario: 'foreground-streaming',
      samples: [],
    })
  );
});

test('mergeMeasurements prefers concrete values over null placeholders', () => {
  assert.deepEqual(
    mergeMeasurements(
      { coldLaunchToUsableMs: 900, idleCpuPercent: null, pid: 1 },
      { idleCpuPercent: 0.2, warmLaunchMs: 300 }
    ),
    {
      coldLaunchToUsableMs: 900,
      idleCpuPercent: 0.2,
      warmLaunchMs: 300,
    }
  );
});

test('LIVE_CERT stays blocked off-Mac and fails on regression on Mac', () => {
  const certified = evaluatePerformanceContract(underBudget);
  const regression = evaluatePerformanceContract({
    ...underBudget,
    typingLatencyMs: 20,
  });
  assert.equal(
    liveCertGate({ platform: 'linux', evaluation: certified }).liveCert,
    'blocked'
  );
  assert.equal(
    liveCertGate({ platform: 'darwin', evaluation: certified }).liveCert,
    'pass'
  );
  assert.equal(
    liveCertGate({ platform: 'darwin', evaluation: regression }).liveCert,
    'fail'
  );
  assert.equal(
    liveCertGate({
      platform: 'darwin',
      evaluation: evaluatePerformanceContract({}),
    }).liveCert,
    'blocked'
  );
});

test('contract-check self-test passes on Linux and keeps LIVE_CERT blocked', async () => {
  const report = await runPerformanceCert({
    mode: 'contract-check',
    measurementsPath: null,
    readinessPath: null,
    baselinePath: null,
    outputDir: await mkdtemp(path.join(tmpdir(), 'perf-cert-')),
  });
  assert.equal(report.mode, 'contract-check');
  assert.equal(report.gate.liveCert, 'blocked');
  assert.equal(report.gate.selfTest.underBudget, 'certified');
  assert.equal(report.gate.selfTest.overBudget, 'regression');
  assert.equal(exitCodeForReport(report), 0);
});

test('live mode without macOS blocks without claiming certification', async () => {
  if (process.platform === 'darwin') return;
  const report = await runPerformanceCert({
    mode: 'live',
    measurementsPath: null,
    readinessPath: null,
    baselinePath: null,
    outputDir: await mkdtemp(path.join(tmpdir(), 'perf-cert-live-')),
  });
  assert.equal(report.gate.liveCert, 'blocked');
  assert.match(report.gate.reason, /installed-Mac session required/);
  assert.equal(exitCodeForReport(report), 1);
});

test('evaluate mode rejects over-budget measurement files', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'perf-cert-eval-'));
  const file = path.join(dir, 'measurements.json');
  await writeFile(
    file,
    `${JSON.stringify({ ...underBudget, commandPaletteMs: 51 }, null, 2)}\n`
  );
  const report = await runPerformanceCert({
    mode: 'evaluate',
    measurementsPath: file,
    readinessPath: null,
    baselinePath: null,
    outputDir: dir,
  });
  assert.equal(report.evaluation.status, 'regression');
  assert.equal(exitCodeForReport(report), 1);
});

test('evaluate mode accepts under-budget files combined with readiness + baseline', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'perf-cert-combo-'));
  const measurements = path.join(dir, 'measurements.json');
  const readiness = path.join(dir, 'readiness.json');
  const baseline = path.join(dir, 'baseline.json');
  await writeFile(
    measurements,
    `${JSON.stringify(
      {
        warmLaunchMs: 350,
        cachedNavigationMs: 70,
        typingLatencyMs: 10,
        commandPaletteMs: 30,
        unintendedLayoutShifts: 0,
        lostDrafts: 0,
      },
      null,
      2
    )}\n`
  );
  await writeFile(
    readiness,
    `${JSON.stringify({
      schema: 'jovie-desktop-launch-readiness/v1',
      pid: 9,
      composerVisibleEditableAfterPaintOpportunityMs: 1100,
      nativeBuild: {
        channel: 'production',
        version: '26.11.5',
        sourceRevision: 'b'.repeat(40),
      },
    })}\n`
  );
  await writeFile(
    baseline,
    `${JSON.stringify({
      schema: 'jovie-desktop-production-baseline/v1',
      status: 'baseline-captured',
      scenario: 'hidden-idle',
      nativeBuild: { channel: 'production', version: '26.11.5' },
      samples: [{ totalCpuPercent: 0.2 }, { totalCpuPercent: 0.3 }],
    })}\n`
  );
  const report = await runPerformanceCert({
    mode: 'evaluate',
    measurementsPath: measurements,
    readinessPath: readiness,
    baselinePath: baseline,
    outputDir: dir,
  });
  assert.equal(report.evaluation.status, 'certified');
  assert.equal(report.measurements.coldLaunchToUsableMs, 1100);
  assert.equal(report.measurements.idleCpuPercent, 0.25);
  assert.equal(exitCodeForReport(report), 0);
});

test('parseCertOptions validates mode and resolves paths', () => {
  assert.equal(parseCertOptions(['--help']).help, true);
  assert.throws(() => parseCertOptions(['--mode', 'nope']));
  const options = parseCertOptions([
    '--',
    '--mode',
    'evaluate',
    '--measurements',
    'm.json',
  ]);
  assert.equal(options.mode, 'evaluate');
  assert.ok(path.isAbsolute(options.measurementsPath));
});

test('buildCertReport wires evaluation and gate together', () => {
  const report = buildCertReport({
    mode: 'evaluate',
    measurements: underBudget,
    platform: 'darwin',
    identity: { channel: 'production', version: '26.11.5' },
  });
  assert.equal(report.schema, 'jovie-desktop-performance-cert-report/v1');
  assert.equal(report.gate.liveCert, 'pass');
  assert.equal(report.identity.version, '26.11.5');
});

test('desktop package and root expose the cert scripts', async () => {
  const desktop = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  );
  const root = JSON.parse(
    await readFile(new URL('../../../package.json', import.meta.url), 'utf8')
  );
  assert.equal(
    desktop.scripts['performance:cert'],
    'node scripts/performance-cert.mjs'
  );
  assert.match(desktop.scripts['test:performance'], /performance-contract/);
  assert.equal(
    root.scripts['desktop:performance:cert'],
    'pnpm --filter @jovie/desktop run performance:cert'
  );
});

test('Mac CI wires the CI-safe performance contract job', async () => {
  const source = await readFile(
    new URL('../../../.github/workflows/macos-ci.yml', import.meta.url),
    'utf8'
  );
  assert.match(source, /performance-cert:/);
  assert.match(
    source,
    /pnpm --filter @jovie\/desktop run performance:cert --mode contract-check/
  );
  assert.match(
    source,
    /path: artifacts\/desktop-test-results\/performance-cert/
  );
  assert.match(source, /LIVE_CERT stays blocked/);
});
