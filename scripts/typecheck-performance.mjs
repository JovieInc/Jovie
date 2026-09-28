#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG_PATH = resolve(
  ROOT,
  '.github/ci-harness/typecheck-performance.json'
);
const TURBO_RUNS = resolve(ROOT, '.turbo/runs');
const PNPM = ['corepack', 'pnpm'];
const TURBO = [...PNPM, 'turbo', 'typecheck'];
const MAX_BUFFER = 64 * 1024 * 1024;
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
    enforce: argv.includes('--enforce'),
    output: resolve(
      ROOT,
      value('--output', '.context/typecheck-performance/latest.json')
    ),
    samples: Number(value('--samples', '3')),
    scenarios: value('--scenario', 'all').split(','),
  };
}

function commandResult(command, env = {}) {
  const timeArgs = process.platform === 'darwin' ? ['-l'] : ['-v'];
  const timed = existsSync('/usr/bin/time');
  const executable = timed ? '/usr/bin/time' : command[0];
  const args = timed ? [...timeArgs, ...command] : command.slice(1);
  const started = process.hrtime.bigint();
  const result = spawnSync(executable, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: MAX_BUFFER,
  });
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const user = metric(output, /User time \(seconds\):\s*([\d.]+)/i);
  const system = metric(output, /System time \(seconds\):\s*([\d.]+)/i);
  const mac = output.match(
    /([\d.]+)\s+real\s+([\d.]+)\s+user\s+([\d.]+)\s+sys/i
  );
  const cpuSeconds =
    user === null || system === null
      ? mac
        ? Number(mac[2]) + Number(mac[3])
        : null
      : user + system;
  return {
    durationMs,
    exitCode: result.status ?? 1,
    output,
    cpuPercent:
      cpuSeconds === null ? null : (cpuSeconds * 100_000) / durationMs,
    peakRssKb:
      metric(output, /Maximum resident set size \(kbytes\):\s*(\d+)/i) ??
      ((metric(output, /(\d+)\s+maximum resident set size/i) ?? 0) / 1024 ||
        null),
  };
}

function metric(text, pattern) {
  const value = Number(pattern.exec(text)?.[1]);
  return Number.isFinite(value) ? value : null;
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

function runCommand(command, env) {
  const before = new Set(existsSync(TURBO_RUNS) ? readdirSync(TURBO_RUNS) : []);
  const result = commandResult(command, env);
  const turbo = turboSummary(before);
  return {
    durationMs: result.durationMs,
    exitCode: result.exitCode,
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

async function runScenario(name, definition, count) {
  if (EDITS[name])
    runCommand([...TURBO, '--summarize', '--output-logs=errors-only']);
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const execute = () => {
      if (definition.diagnostics)
        return runCommand([
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
        ]);
      return runCommand([
        ...TURBO,
        ...definition.args,
        '--summarize',
        '--output-logs=errors-only',
        '--env-mode=loose',
      ]);
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
        : measured()
    );
  }
  return { name, samples, aggregate: aggregate(samples) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(options.samples) || options.samples < 1)
    throw new Error('--samples must be a positive integer');
  const names = options.scenarios.includes('all')
    ? Object.keys(SCENARIOS)
    : options.scenarios;
  const unknown = names.filter(name => !SCENARIOS[name]);
  if (unknown.length)
    throw new Error(`unknown scenario(s): ${unknown.join(', ')}`);
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const scenarios = [];
  for (const name of names)
    scenarios.push(await runScenario(name, SCENARIOS[name], options.samples));
  const ratchet = Object.fromEntries(
    scenarios.map(scenario => [
      scenario.name,
      evaluateRatchet(scenario.samples, {
        ...config.ratchet,
        ...config.scenarios[scenario.name],
      }),
    ])
  );
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
    ratchet,
  };
  mkdirSync(dirname(options.output), { recursive: true });
  writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (
    options.enforce &&
    Object.values(ratchet).some(item => item.status === 'fail')
  )
    process.exitCode = 1;
  if (
    scenarios.some(scenario =>
      scenario.samples.some(sample => sample.exitCode !== 0)
    )
  )
    process.exitCode = 1;
}

for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    activeRestore?.();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch(error => {
    activeRestore?.();
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
