#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { commandResult, stopActiveCommand } from './lib/typecheck-command.mjs';

// Test seam (JOV-12511): the shared-deadline fixture injects a virtual clock
// module via TYPECHECK_PERFORMANCE_CLOCK so the deadline arithmetic below is
// deterministic under suite load instead of racing real runner overhead.
// With the variable unset the script reads the real monotonic clock and
// behaves exactly as before — budgets, timeouts and verdicts are unchanged.
const clockModule = process.env.TYPECHECK_PERFORMANCE_CLOCK;
const clockNow = clockModule
  ? (await import(pathToFileURL(clockModule).href)).now
  : () => performance.now();

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG_PATH = resolve(
  ROOT,
  '.github/ci-harness/typecheck-performance.json'
);
const TURBO_RUNS = resolve(ROOT, '.turbo/runs');
const PNPM = ['corepack', 'pnpm'];
const TURBO = [...PNPM, 'turbo', 'typecheck'];
const EDITS = {
  'leaf-edit': 'apps/web/lib/hud/number-series.ts',
  'wide-edit': 'packages/ui/lib/utils.ts',
  package: 'packages/ui/lib/utils.ts',
};
const SCENARIOS = {
  'cold-full': { args: ['--force'], cold: true },
  'warm-full': { args: [] },
  'leaf-edit': { args: [] },
  'wide-edit': { args: [] },
  package: { args: ['--filter=@jovie/ui', '--force'] },
  ci: { args: ['--filter=@jovie/web...', '--force'], cold: true },
  diagnostics: { diagnostics: true },
};
let activeRestore = null;

export function statistics(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance =
    sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
  const percentile = value =>
    sorted[Math.max(0, Math.ceil((value / 100) * sorted.length) - 1)];
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted.at(-1),
    mean,
    variance,
    p50: percentile(50),
    p95: percentile(95),
  };
}

export function evaluateRatchet(samples, policy) {
  if (samples.some(sample => sample.timedOut))
    return { status: 'fail', reason: 'measurement-timeout' };
  if (samples.some(sample => sample.exitCode != null && sample.exitCode !== 0))
    return { status: 'fail', reason: 'sample-error' };
  const duration = statistics(samples.map(sample => sample.durationMs));
  if (!duration || duration.count < policy.minimumSamples) {
    return { status: 'observe', reason: 'insufficient-samples' };
  }
  const regression = duration.p95 / policy.baselineP95Ms - 1;
  if (
    duration.p95 > policy.targetP95Ms ||
    regression > policy.failureRegression
  ) {
    return { status: 'fail', regression };
  }
  if (regression > policy.warningRegression)
    return { status: 'warn', regression };
  return { status: 'pass', regression };
}

function parseArgs(argv) {
  const value = (name, fallback) => {
    const index = argv.indexOf(name);
    return index === -1 ? fallback : argv[index + 1];
  };
  return {
    confirmRetries: Number(value('--confirm-retries', '1')),
    // Leave five minutes of the CI job's 15-minute limit for setup/reporting.
    maxDurationMs: Number(
      value('--max-duration-ms', argv.includes('--enforce') ? '600000' : '0')
    ),
    enforce: argv.includes('--enforce'),
    output: resolve(
      ROOT,
      value('--output', '.context/typecheck-performance/latest.json')
    ),
    samples: Number(value('--samples', '3')),
    scenarios: value('--scenario', 'all').split(','),
  };
}

// With 3 samples the enforced p95 IS the maximum, and one cold sample on a
// shared hosted runner can swing from ~70s to ~120s+ on the same tree
// (scheduled runs 2026-10-12..11-09 measured both clusters; checkouts, setup
// and hook rungs stay fast on the slow days, so it is runner draw, not code).
// A sustained regression reproduces on every measurement; a contended runner
// draw does not. `--confirm-retries` (default 1) re-measures a breached
// scenario with the same scenario, sample count, budgets and statistic, and
// only a breach that reproduces keeps its fail verdict — never weaken or
// raise the budgets to deal with this. Budgets live in
// .github/ci-harness/typecheck-performance.json.
export function applyConfirmations(ratchet, confirmations) {
  const resolved = { ...ratchet };
  for (const { scenario, verdict } of confirmations) {
    if (
      resolved[scenario]?.status === 'fail' &&
      !resolved[scenario].reason &&
      (['pass', 'warn'].includes(verdict.status) ||
        (verdict.status === 'fail' && verdict.reason))
    )
      resolved[scenario] = verdict;
  }
  return resolved;
}

function turboSummary(previous) {
  if (!existsSync(TURBO_RUNS)) return null;
  const fresh = readdirSync(TURBO_RUNS)
    .filter(file => file.endsWith('.json') && !previous.has(file))
    .sort(
      (a, b) =>
        statSync(join(TURBO_RUNS, b)).mtimeMs -
        statSync(join(TURBO_RUNS, a)).mtimeMs
    )[0];
  if (!fresh) return null;
  const summary = JSON.parse(readFileSync(join(TURBO_RUNS, fresh), 'utf8'));
  const packages = Object.fromEntries(
    summary.tasks.map(task => [
      task.package,
      {
        cache: task.cache.status,
        durationMs: task.execution
          ? task.execution.endTime - task.execution.startTime
          : null,
      },
    ])
  );
  const hits = Object.values(packages).filter(
    item => item.cache === 'HIT'
  ).length;
  return {
    cacheHitRate: Object.keys(packages).length
      ? hits / Object.keys(packages).length
      : null,
    packages,
  };
}

async function runCommand(command, env, deadline = Infinity) {
  const before = new Set(existsSync(TURBO_RUNS) ? readdirSync(TURBO_RUNS) : []);
  const result = await commandResult(command, env, deadline - clockNow());
  const turbo = result.exitCode === 0 ? turboSummary(before) : null;
  return {
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    cpuPercent: result.cpuPercent,
    peakRssKb: result.peakRssKb,
    cacheHitRate: turbo?.cacheHitRate ?? null,
    packages: turbo?.packages ?? null,
    diagnostics: parseDiagnostics(result.output),
  };
}

function parseDiagnostics(output) {
  const fields = {
    Files: 'files',
    'Lines of TypeScript': 'linesOfTypeScript',
    'Lines of Definitions': 'linesOfDefinitions',
    'Memory used': 'memoryKb',
    'Parse time': 'parseMs',
    'Check time': 'checkMs',
    'Total time': 'totalMs',
  };
  const parsed = {};
  for (const [label, key] of Object.entries(fields)) {
    const match = new RegExp(
      `^${label}:\\s*([\\d,.]+)\\s*(K|s|ms)?`,
      'im'
    ).exec(output);
    if (!match) continue;
    let value = Number(match[1].replaceAll(',', ''));
    if (match[2]?.toLowerCase() === 's') value *= 1000;
    parsed[key] = value;
  }
  return Object.keys(parsed).length ? parsed : null;
}

function buildInfoFiles() {
  const found = [];
  const visit = path => {
    if (!existsSync(path)) return;
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (['node_modules', '.next', '.turbo'].includes(entry.name)) continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (
        entry.name.endsWith('.tsbuildinfo') ||
        entry.name === 'tsbuildinfo'
      )
        found.push(child);
    }
  };
  for (const root of ['apps', 'packages', 'workers'])
    visit(resolve(ROOT, root));
  return found;
}

function clearBuildInfo() {
  for (const path of buildInfoFiles()) rmSync(path, { force: true });
}

async function withEdit(path, suffix, callback) {
  const absolute = resolve(ROOT, path);
  const original = readFileSync(absolute, 'utf8');
  const restore = () => writeFileSync(absolute, original);
  activeRestore = restore;
  writeFileSync(absolute, `${original}${suffix}`);
  try {
    return await callback();
  } finally {
    restore();
    activeRestore = null;
  }
}

function aggregate(samples) {
  return {
    durationMs: statistics(samples.map(sample => sample.durationMs)),
    peakRssKb: statistics(samples.map(sample => sample.peakRssKb)),
    cpuPercent: statistics(samples.map(sample => sample.cpuPercent)),
    cacheHitRate: statistics(samples.map(sample => sample.cacheHitRate)),
  };
}

// The singleflight launcher replays a completed result for 30 s, which would
// turn every sample after the first into a cache replay. A fresh state dir
// per sample keeps each timed run a real typecheck (JOV-8044).
export function sampleEnv(index) {
  return {
    TYPECHECK_SINGLEFLIGHT_DIR: mkdtempSync(
      join(tmpdir(), `jovie-typecheck-performance-${index}-`)
    ),
  };
}

async function runScenario(name, definition, count, deadline = Infinity) {
  if (EDITS[name])
    await runCommand(
      [...TURBO, '--summarize', '--output-logs=errors-only'],
      {},
      deadline
    );
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const execute = () => {
      if (definition.diagnostics)
        return runCommand(
          [
            ...PNPM,
            '--filter=@jovie/web',
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
          sampleEnv(index),
          deadline
        );
      return runCommand(
        [
          ...TURBO,
          ...definition.args,
          '--summarize',
          '--output-logs=errors-only',
          '--env-mode=loose',
        ],
        sampleEnv(index),
        deadline
      );
    };
    const measured = () => {
      if (definition.cold) clearBuildInfo();
      return execute();
    };
    samples.push(
      EDITS[name]
        ? await withEdit(
            EDITS[name],
            `\nexport type __TypecheckBenchmark${index} = never;\n`,
            measured
          )
        : await measured()
    );
    if (samples.at(-1).timedOut) break;
  }
  return { name, samples, aggregate: aggregate(samples) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(options.samples) || options.samples < 1)
    throw new Error('--samples must be a positive integer');
  if (!Number.isInteger(options.confirmRetries) || options.confirmRetries < 0)
    throw new Error('--confirm-retries must be a non-negative integer');
  if (
    !Number.isSafeInteger(options.maxDurationMs) ||
    options.maxDurationMs < 0 ||
    (options.enforce && options.maxDurationMs === 0)
  )
    throw new Error(
      '--max-duration-ms must be a positive integer when enforcing'
    );
  const deadline = options.maxDurationMs
    ? clockNow() + options.maxDurationMs
    : Infinity;
  const names = options.scenarios.includes('all')
    ? Object.keys(SCENARIOS)
    : options.scenarios;
  const unknown = names.filter(name => !SCENARIOS[name]);
  if (unknown.length)
    throw new Error(`unknown scenario(s): ${unknown.join(', ')}`);
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const ratchetFor = (samples, name) =>
    evaluateRatchet(samples, {
      ...config.ratchet,
      ...config.scenarios[name],
    });
  const scenarios = [];
  for (const name of names)
    scenarios.push(
      await runScenario(name, SCENARIOS[name], options.samples, deadline)
    );
  const ratchet = Object.fromEntries(
    scenarios.map(scenario => [
      scenario.name,
      ratchetFor(scenario.samples, scenario.name),
    ])
  );
  const confirmations = [];
  if (options.enforce && options.confirmRetries > 0) {
    let pending = scenarios
      .filter(
        scenario =>
          ratchet[scenario.name]?.status === 'fail' &&
          scenario.samples.every(sample => sample.exitCode === 0)
      )
      .map(scenario => scenario.name);
    for (
      let round = 1;
      pending.length > 0 &&
      round <= options.confirmRetries &&
      clockNow() < deadline;
      round += 1
    ) {
      const stillFailing = [];
      for (const name of pending) {
        const rerun = await runScenario(
          name,
          SCENARIOS[name],
          options.samples,
          deadline
        );
        const verdict = ratchetFor(rerun.samples, name);
        confirmations.push({
          round,
          samples: rerun.samples,
          scenario: name,
          verdict,
        });
        if (verdict.status === 'fail' && !verdict.reason)
          stillFailing.push(name);
      }
      pending = stillFailing;
    }
  }
  const resolvedRatchet = applyConfirmations(ratchet, confirmations);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      arch: process.arch,
      ci: process.env.CI === 'true',
      node: process.version,
      platform: process.platform,
    },
    scenarios,
    confirmations,
    maxDurationMs: options.maxDurationMs,
    ratchet: resolvedRatchet,
  };
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (
    options.enforce &&
    Object.values(resolvedRatchet).some(item => item.status === 'fail')
  )
    process.exitCode = 1;
  if (
    scenarios.some(scenario =>
      scenario.samples.some(sample => sample.exitCode !== 0)
    ) ||
    confirmations.some(confirmation =>
      confirmation.samples.some(sample => sample.exitCode !== 0)
    )
  )
    process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stopActiveCommand();
    activeRestore?.();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch(error => {
    activeRestore?.();
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
