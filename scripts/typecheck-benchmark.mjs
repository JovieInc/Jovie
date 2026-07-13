#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  installTrackedEditSignalHandlers,
  withTrackedFileEdit,
} from './lib/tracked-file-edit.mjs';
import {
  aggregateScenarioResults,
  calculateStatistics,
  evaluatePerformanceConstraints,
  evaluateRatchet,
  isValidHistoricalScenario,
  nearestRankPercentile,
  parseExtendedDiagnostics,
  parseTimeOutput,
  selectRatchetBaseline,
} from './lib/typecheck-performance.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG_PATH = resolve(
  ROOT,
  '.github/ci-harness/typecheck-performance.json'
);
const DEFAULT_OUTPUT = resolve(
  ROOT,
  'artifacts/typecheck-performance/latest.json'
);
let commandSequence = 0;
let activeCommand = null;
installTrackedEditSignalHandlers(process, {
  onSignal: terminateActiveCommand,
});
const MAX_CAPTURED_OUTPUT_CHARACTERS = 100 * 1024 * 1024;

const SCENARIOS = {
  'cold-full': {
    targetKey: 'coldFullMs',
    requiresPackageTelemetry: true,
    clearBuildInfo: true,
    command: [
      'pnpm',
      'turbo',
      'typecheck',
      '--force',
      '--output-logs=errors-only',
      '--summarize',
      '--env-mode=loose',
    ],
  },
  'warm-full': {
    targetKey: 'warmFullMs',
    command: [
      'pnpm',
      'turbo',
      'typecheck',
      '--output-logs=errors-only',
      '--summarize',
      '--env-mode=loose',
    ],
  },
  'ci-warm': {
    targetKey: 'ciMs',
    requiresPackageTelemetry: true,
    command: [
      'pnpm',
      'turbo',
      'typecheck',
      '--force',
      '--output-logs=errors-only',
      '--summarize',
      '--env-mode=loose',
    ],
  },
  'stable-ci-warm': {
    targetKey: 'ciMs',
    cwd: 'apps/web',
    command: ['pnpm', 'run', 'typecheck:stable'],
  },
  'incremental-leaf': {
    targetKey: 'localIncrementalMs',
    editPath: 'apps/web/lib/hud/number-series.ts',
    command: ['pnpm', '--filter', '@jovie/web', 'run', 'typecheck'],
  },
  'incremental-wide': {
    targetKey: 'widelyImportedIncrementalMs',
    requiresPackageTelemetry: true,
    editPath: 'packages/ui/lib/utils.ts',
    command: [
      'pnpm',
      'turbo',
      'typecheck',
      '--force',
      '--output-logs=errors-only',
      '--summarize',
      '--env-mode=loose',
      '--concurrency=4',
    ],
  },
  'web-diagnostics': {
    targetKey: 'warmFullMs',
    cwd: 'apps/web',
    command: [
      'pnpm',
      'exec',
      'tsc',
      '-p',
      'tsconfig.typecheck.json',
      '--noEmit',
      '--incremental',
      '--tsBuildInfoFile',
      '.cache/tsbuildinfo',
      '--extendedDiagnostics',
      '--pretty',
      'false',
    ],
  },
  'web-native-diagnostics': {
    targetKey: 'coldFullMs',
    clearBuildInfo: true,
    cwd: 'apps/web',
    command: [
      'pnpm',
      'exec',
      'tsgo',
      '-p',
      'tsconfig.typecheck.json',
      '--noEmit',
      '--tsBuildInfoFile',
      '.cache/tsbuildinfo-native-diagnostics',
      '--extendedDiagnostics',
      '--pretty',
      'false',
    ],
  },
};

function argValue(args, name, fallback) {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
}

function writeFileAtomic(path, contents) {
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, contents);
  renameSync(temporaryPath, path);
}

function listBuildInfo() {
  const result = spawnSync(
    'find',
    ['.', '-path', '*/.cache/tsbuildinfo*', '-type', 'f'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  return (result.stdout ?? '').split(/\r?\n/).filter(Boolean);
}

function clearBuildInfo() {
  for (const relativePath of listBuildInfo()) {
    rmSync(resolve(ROOT, relativePath), { force: true });
  }
}

function processTreeRssBytes(rootPid) {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,rss='], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const processes = (result.stdout ?? '')
    .trim()
    .split(/\r?\n/)
    .map(line => line.trim().split(/\s+/).map(Number))
    .filter(parts => parts.length === 3 && parts.every(Number.isFinite));
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, parentPid] of processes) {
      if (!descendants.has(pid) && descendants.has(parentPid)) {
        descendants.add(pid);
        changed = true;
      }
    }
  }
  return (
    processes
      .filter(([pid]) => descendants.has(pid))
      .reduce((total, [, , rssKiB]) => total + rssKiB * 1024, 0) || null
  );
}

function effectiveMemoryLimitBytes() {
  const candidates = [totalmem()];
  for (const path of [
    '/sys/fs/cgroup/memory.max',
    '/sys/fs/cgroup/memory/memory.limit_in_bytes',
  ]) {
    if (!existsSync(path)) continue;
    const value = Number(readFileSync(path, 'utf8').trim());
    if (Number.isFinite(value) && value > 0) candidates.push(value);
  }
  return Math.min(...candidates);
}

function environmentProfile(memoryLimitBytes) {
  const webPackage = JSON.parse(
    readFileSync(resolve(ROOT, 'apps/web/package.json'), 'utf8')
  );
  const stableCompiler = JSON.parse(
    readFileSync(resolve(ROOT, 'node_modules/typescript/package.json'), 'utf8')
  ).version;
  const profile = {
    platform: process.platform,
    arch: process.arch,
    nodeMajor: Number(process.versions.node.split('.')[0]),
    cpus: availableParallelism(),
    memoryLimitGiB: Math.round(memoryLimitBytes / 1024 ** 3),
    nativeCompiler:
      webPackage.devDependencies?.['@typescript/native-preview'] ?? null,
    stableCompiler,
  };
  return {
    ...profile,
    fingerprint: createHash('sha256')
      .update(JSON.stringify(profile))
      .digest('hex'),
  };
}

function cgroupMemoryUsageBytes() {
  for (const path of [
    '/sys/fs/cgroup/memory.current',
    '/sys/fs/cgroup/memory/memory.usage_in_bytes',
  ]) {
    if (!existsSync(path)) continue;
    const value = Number(readFileSync(path, 'utf8').trim());
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

async function timeCommand(command, cwd) {
  commandSequence += 1;
  const singleflightDir = resolve(
    process.env.TMPDIR ?? '/tmp',
    `jovie-typecheck-benchmark-${process.pid}-${commandSequence}`
  );
  const startedAt = performance.now();
  const isMac = process.platform === 'darwin';
  const timeArgs = isMac ? ['-lp', ...command] : ['-v', ...command];
  const child = spawn('/usr/bin/time', timeArgs, {
    cwd,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      TYPECHECK_SINGLEFLIGHT_REUSE_WINDOW_MS: '1',
      TYPECHECK_SINGLEFLIGHT_DIR: singleflightDir,
    },
  });
  let output = '';
  let processTreePeakMemoryBytes = null;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  const capture = chunk => {
    output = `${output}${chunk}`.slice(-MAX_CAPTURED_OUTPUT_CHARACTERS);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  const sampleMemory = () => {
    const current = cgroupMemoryUsageBytes() ?? processTreeRssBytes(child.pid);
    if (current !== null) {
      processTreePeakMemoryBytes = Math.max(
        processTreePeakMemoryBytes ?? 0,
        current
      );
    }
  };
  sampleMemory();
  const memoryTimer = setInterval(
    sampleMemory,
    cgroupMemoryUsageBytes() === null ? 250 : 100
  );
  memoryTimer.unref();
  const completion = new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('close', code => resolveExit(code ?? 1));
  });
  const commandState = { child, completion };
  activeCommand = commandState;
  let exitCode;
  try {
    exitCode = await completion;
  } finally {
    if (activeCommand === commandState) activeCommand = null;
    clearInterval(memoryTimer);
    sampleMemory();
    rmSync(singleflightDir, { recursive: true, force: true });
  }
  const durationMs = performance.now() - startedAt;
  const turboSummary = parseTurboSummary(output);
  const time = parseTimeOutput(output);
  const realSeconds = time.realSeconds ?? durationMs / 1000;
  const cpuUtilization =
    Number.isFinite(time.userSeconds) && Number.isFinite(time.systemSeconds)
      ? (time.userSeconds + time.systemSeconds) / realSeconds
      : null;
  return {
    exitCode,
    durationMs,
    peakMemoryBytes: processTreePeakMemoryBytes ?? time.peakMemoryBytes ?? null,
    cpuUtilization,
    diagnostics: parseExtendedDiagnostics(output),
    packageDurationsMs: turboSummary?.packageDurationsMs ?? null,
    cacheHitRate: turboSummary?.cacheHitRate ?? null,
    output,
  };
}

function signalCommandTree(commandState, signal) {
  try {
    if (process.platform === 'win32') commandState.child.kill(signal);
    else process.kill(-commandState.child.pid, signal);
  } catch {
    // The process may have exited between the active-state check and signal.
  }
}

async function terminateActiveCommand(signal) {
  const commandState = activeCommand;
  if (!commandState) return;
  signalCommandTree(commandState, signal);
  let timedOut = false;
  await Promise.race([
    commandState.completion.catch(() => {}),
    new Promise(resolveTimeout => {
      setTimeout(() => {
        timedOut = true;
        resolveTimeout();
      }, 2000).unref();
    }),
  ]);
  if (timedOut && activeCommand === commandState) {
    signalCommandTree(commandState, 'SIGKILL');
    await commandState.completion.catch(() => {});
  }
}

function parseTurboSummary(output) {
  const match = String(output).match(/^Summary:\s+(.+\.json)\s*$/m);
  if (!match) return null;
  try {
    const summaryPath = match[1].trim();
    const report = JSON.parse(readFileSync(resolve(ROOT, summaryPath), 'utf8'));
    const packageDurationsMs = Object.fromEntries(
      report.tasks
        .filter(task => task.execution?.startTime && task.execution?.endTime)
        .map(task => [
          task.package,
          task.execution.endTime - task.execution.startTime,
        ])
    );
    const attempted = report.execution?.attempted ?? report.tasks.length;
    const cached = report.execution?.cached ?? 0;
    return {
      packageDurationsMs,
      cacheHitRate: attempted === 0 ? null : cached / attempted,
    };
  } catch {
    return null;
  }
}

function aggregatePackages(results) {
  const packages = new Map();
  for (const result of results) {
    for (const [name, durationMs] of Object.entries(
      result.packageDurationsMs ?? {}
    )) {
      const samples = packages.get(name) ?? [];
      samples.push(durationMs);
      packages.set(name, samples);
    }
  }
  const totalMean = [...packages.values()].reduce(
    (total, samples) =>
      total + samples.reduce((sum, value) => sum + value, 0) / samples.length,
    0
  );
  return Object.fromEntries(
    [...packages.entries()]
      .map(([name, samples]) => {
        const stats = calculateStatistics(samples);
        return [
          name,
          {
            ...stats,
            share: totalMean === 0 ? null : stats.mean / totalMean,
          },
        ];
      })
      .sort((left, right) => right[1].mean - left[1].mean)
  );
}

function withDeterministicEdit(relativePath, sampleIndex, callback) {
  if (!relativePath) return callback();
  const absolutePath = resolve(ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`benchmark edit target does not exist: ${relativePath}`);
  }
  return withTrackedFileEdit(
    absolutePath,
    `\n// typecheck-benchmark deterministic edit ${sampleIndex}\n`,
    callback
  );
}

function cooldown(milliseconds) {
  if (milliseconds <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

async function runScenario(name, definition, samples, warmups, cooldownMs) {
  const results = [];
  const warmupCount = warmups;
  const totalRuns = samples + warmupCount;
  for (let index = 0; index < totalRuns; index += 1) {
    if (definition.clearBuildInfo) clearBuildInfo();
    const result = await withDeterministicEdit(definition.editPath, index, () =>
      timeCommand(definition.command, resolve(ROOT, definition.cwd ?? '.'))
    );
    const measuredIndex = index - warmupCount;
    if (measuredIndex >= 0) {
      results.push({
        sample: measuredIndex + 1,
        ...result,
        output: result.output.slice(-4000),
      });
    }
    const seconds = (result.durationMs / 1000).toFixed(2);
    console.log(
      measuredIndex < 0
        ? `[typecheck-benchmark] ${name} warmup ${index + 1}/${warmupCount}: ${seconds}s, exit ${result.exitCode}`
        : `[typecheck-benchmark] ${name} ${measuredIndex + 1}/${samples}: ${seconds}s, exit ${result.exitCode}`
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `${name} failed during ${measuredIndex < 0 ? 'warmup' : `sample ${measuredIndex + 1}`}\n${result.output.slice(-4000)}`
      );
    }
    if (index < totalRuns - 1) cooldown(cooldownMs);
  }
  return {
    name,
    samples: results,
    aggregate: aggregateScenarioResults(results),
    packages: aggregatePackages(results),
    telemetry: {
      expectedSamples: results.length,
      memorySamples: results.filter(result =>
        Number.isFinite(result.peakMemoryBytes)
      ).length,
      packageSamples: results.filter(
        result =>
          result.packageDurationsMs !== null &&
          Object.keys(result.packageDurationsMs).length > 0
      ).length,
    },
  };
}

function formatSummary(report) {
  const lines = [
    '# Typecheck performance',
    '',
    `Machine: ${report.machine.platform} ${report.machine.arch}, Node ${report.machine.node}`,
    '',
    '| Scenario | Samples | P50 | P95 | Peak memory | Variance | Status |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const scenario of report.scenarios) {
    const stats = scenario.aggregate.durationMs;
    const peak = scenario.aggregate.peakMemoryBytes;
    const verdict = report.ratchet[scenario.name];
    const constraint = report.constraints[scenario.name];
    const constraintFailed =
      !constraint.variancePassed ||
      !constraint.packageSharePassed ||
      !constraint.memoryPassed;
    const status =
      verdict.status === 'fail' || constraintFailed ? 'fail' : verdict.status;
    lines.push(
      `| ${scenario.name} | ${stats.count} | ${(stats.p50 / 1000).toFixed(2)}s | ${(stats.p95 / 1000).toFixed(2)}s | ${peak ? `${(peak / 1024 ** 2).toFixed(0)} MiB` : 'n/a'} | ${stats.coefficientOfVariation === null ? 'n/a' : `${(stats.coefficientOfVariation * 100).toFixed(1)}%`} | ${status} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

function loadRollingBaselines(historyDir, environmentFingerprint) {
  if (!historyDir || !existsSync(historyDir)) return {};
  const files = [];
  const allowedScenarioNames = new Set(Object.keys(SCENARIOS));
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.json')) files.push(path);
    }
  };
  visit(historyDir);

  const values = new Map();
  const seenGitShas = new Set();
  for (const file of files) {
    try {
      const report = JSON.parse(readFileSync(file, 'utf8'));
      if (
        report.schemaVersion !== 1 ||
        !Array.isArray(report.scenarios) ||
        !/^[0-9a-f]{40}$/.test(report.gitSha ?? '') ||
        !Number.isFinite(Date.parse(report.generatedAt)) ||
        report.environment?.fingerprint !== environmentFingerprint ||
        seenGitShas.has(report.gitSha)
      )
        continue;
      seenGitShas.add(report.gitSha);
      for (const scenario of report.scenarios) {
        const p95 = scenario.aggregate?.durationMs?.p95;
        if (!isValidHistoricalScenario(scenario, allowedScenarioNames))
          continue;
        const samples = values.get(scenario.name) ?? [];
        samples.push(p95);
        values.set(scenario.name, samples);
      }
    } catch {
      // Historical artifacts are best-effort; ignore unrelated or partial JSON.
    }
  }
  return Object.fromEntries(
    [...values.entries()]
      .filter(([, samples]) => samples.length >= 3)
      .map(([name, samples]) => [
        name,
        {
          p95Ms: nearestRankPercentile(samples, 50),
          reportCount: samples.length,
        },
      ])
  );
}

async function main() {
  const args = process.argv.slice(2);
  const requested = argValue(args, '--scenario', 'warm-full')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const sampleCount = Number(argValue(args, '--samples', '3'));
  const warmupCount = Number(argValue(args, '--warmups', '1'));
  const cooldownMs = Number(argValue(args, '--cooldown-ms', '0'));
  const outputPath = resolve(ROOT, argValue(args, '--output', DEFAULT_OUTPUT));
  const historyDir = argValue(args, '--history-dir', null);
  const check = args.includes('--check');
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  if (!outputPath.endsWith('.json')) {
    throw new Error('--output must end in .json');
  }

  if (
    !Number.isInteger(sampleCount) ||
    sampleCount < 1 ||
    !Number.isInteger(warmupCount) ||
    warmupCount < 0 ||
    !Number.isFinite(cooldownMs) ||
    cooldownMs < 0
  ) {
    throw new Error(
      '--samples must be positive; --warmups and --cooldown-ms must be non-negative'
    );
  }
  const unknown = requested.filter(name => !SCENARIOS[name]);
  if (unknown.length > 0)
    throw new Error(`unknown scenario(s): ${unknown.join(', ')}`);

  const scenarios = [];
  for (const name of requested) {
    scenarios.push(
      await runScenario(
        name,
        SCENARIOS[name],
        sampleCount,
        warmupCount,
        cooldownMs
      )
    );
  }
  const memoryLimitBytes = effectiveMemoryLimitBytes();
  const environment = environmentProfile(memoryLimitBytes);
  const rollingBaselines = loadRollingBaselines(
    historyDir,
    environment.fingerprint
  );
  const committedProfileMatches =
    config.baselineProfile?.platform === environment.platform &&
    config.baselineProfile?.arch === environment.arch;
  const ratchet = Object.fromEntries(
    scenarios.map(scenario => {
      const definition = SCENARIOS[scenario.name];
      const target = config.targets[definition.targetKey];
      const committedBaseline =
        (committedProfileMatches
          ? config.baselines[scenario.name]?.p95Ms
          : null) ?? target;
      const rollingBaseline = rollingBaselines[scenario.name]?.p95Ms;
      const baseline = selectRatchetBaseline(
        committedBaseline,
        rollingBaseline
      );
      return [
        scenario.name,
        evaluateRatchet({
          samples: scenario.samples.map(sample => sample.durationMs),
          baseline,
          absoluteTarget: target,
          warningRegression: config.ratchet.warningRegression,
          failureRegression: config.ratchet.failureRegression,
          minimumFailureSamples: config.ratchet.minimumFailureSamples,
          immediateFailureMultiplier: config.ratchet.immediateFailureMultiplier,
        }),
      ];
    })
  );
  const constraints = Object.fromEntries(
    scenarios.map(scenario => [
      scenario.name,
      evaluatePerformanceConstraints({
        coefficientOfVariation:
          scenario.aggregate.durationMs.coefficientOfVariation,
        packages: scenario.packages,
        peakMemoryBytes: scenario.aggregate.peakMemoryBytes,
        memoryLimitBytes,
        targets: config.targets,
        packageShareJustification: config.packageShareJustification,
        requiresPackageTelemetry:
          SCENARIOS[scenario.name].requiresPackageTelemetry ?? false,
        expectedSamples: scenario.telemetry.expectedSamples,
        packageTelemetrySamples: scenario.telemetry.packageSamples,
        memoryTelemetrySamples: scenario.telemetry.memorySamples,
      }),
    ])
  );
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    gitSha: spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).stdout.trim(),
    machine: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpus: availableParallelism(),
      totalMemoryBytes: totalmem(),
      memoryLimitBytes,
    },
    environment,
    config,
    rollingBaselines,
    scenarios,
    ratchet,
    constraints,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileAtomic(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  const summary = formatSummary(report);
  writeFileAtomic(outputPath.replace(/\.json$/, '.md'), summary);
  console.log(summary);
  console.log(`[typecheck-benchmark] wrote ${outputPath}`);

  if (
    scenarios.some(scenario =>
      scenario.samples.some(sample => sample.exitCode !== 0)
    )
  ) {
    process.exit(1);
  }
  if (
    check &&
    Object.values(ratchet).some(result => result.status === 'fail')
  ) {
    process.exit(1);
  }
  if (
    check &&
    Object.values(constraints).some(
      result =>
        !result.variancePassed ||
        !result.packageSharePassed ||
        !result.memoryPassed
    )
  ) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
