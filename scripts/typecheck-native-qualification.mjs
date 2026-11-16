#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, cpus, totalmem } from 'node:os';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertCompleted,
  assertEquivalent,
  assertPrime,
  assertSeeds,
  check,
  cpuAllocation,
  git,
  inspectTools,
  inventory,
  json,
  LEAF,
  PINS,
  PROGRAMS,
  parseArgs,
  parseDiagnostics,
  readGraph,
  same,
  save,
  seedPlan,
  sha,
  WIDE,
  withMutation,
  writeStageMetrics,
} from './lib/native-typecheck-evidence.mjs';

const ROOT = resolve(import.meta.dirname, '..');
export const BOUNDS = Object.freeze({
  suiteMs: 1_200_000,
  invocationMs: 240_000,
});

export async function runQualification({
  root = ROOT,
  tools,
  output,
  execute = null,
  now = () => new Date(),
  monotonic = () => performance.now(),
  inspect = inspectTools,
  expectedSha = process.env.NATIVE_TYPECHECK_EXPECTED_SHA ??
    process.env.GITHUB_SHA,
  emitMetrics = writeStageMetrics,
  programs = Object.keys(PROGRAMS),
}) {
  check(
    process.platform === 'linux' && process.arch === 'x64',
    'Qualification supports Linux x64 only'
  );
  check(
    programs.length &&
      new Set(programs).size === programs.length &&
      programs.every(program => Object.hasOwn(PROGRAMS, program)),
    'Unsupported program scope'
  );
  const report = /** @type {{ header: { glibcVersionRuntime?: string } }} */ (
    process.report.getReport()
  );
  check(report.header.glibcVersionRuntime, 'Qualification requires glibc');
  check(
    isAbsolute(tools) && isAbsolute(output),
    'Absolute tool/output directories required'
  );
  check(
    !resolve(output).startsWith(`${resolve(root)}${sep}`) &&
      !existsSync(output),
    'Output must be a fresh directory outside the checkout'
  );
  check(
    !git(root, ['status', '--porcelain', '--untracked-files=normal']),
    'Qualification requires a clean exact-head checkout'
  );
  const sourceSha = git(root, ['rev-parse', 'HEAD']);
  check(
    !expectedSha || sourceSha === expectedSha,
    'Checked-out head differs from expected SHA'
  );
  const initial = inventory(root);
  const pins = inspect(root, tools);
  check(existsSync('/usr/bin/taskset'), 'CPU affinity utility is unavailable');
  const allocation = cpuAllocation(readFileSync('/proc/self/status', 'utf8'));
  const initialTools = json(pins);
  const start = monotonic();
  const deadline = start + BOUNDS.suiteMs;
  const receipt = {
    schema: 'jovie-native-typecheck-qualification/v1',
    sourceSha,
    startedAt: now().toISOString(),
    status: 'running',
    adoptionEligible: false,
    requiredGate: 'not-run-by-this-tool',
    scope: programs,
    candidate: 'tsrs',
    reference: 'typescript@7.1.0-beta',
    bounds: BOUNDS,
    pins,
    sourceInventorySha256: sha(json(initial)),
    runs: [],
    hardware: {
      platform: process.platform,
      arch: process.arch,
      cpuModel: cpus()[0]?.model,
      logicalCpus: cpus().length,
      availableCpus: availableParallelism(),
      totalMemoryBytes: totalmem(),
      node: process.version,
      cpuAffinity: allocation,
      tasksetVersion: execFileSync('/usr/bin/taskset', ['--version'], {
        encoding: 'utf8',
        timeout: 5_000,
      }).trim(),
      cgroupMemoryMax: existsSync('/sys/fs/cgroup/memory.max')
        ? readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim()
        : null,
    },
    cacheDefinition:
      'Compiler buildinfo absent for cold; OS page cache retained; caches isolated by program/compiler.',
    memoryMetric:
      '/usr/bin/time peak RSS, not aggregate process-tree memory or a hard memory cap',
    ci: {
      runId: process.env.GITHUB_RUN_ID ?? null,
      attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      jobStartedAt: existsSync(resolve(dirname(output), 'job-started-at.txt'))
        ? readFileSync(
            resolve(dirname(output), 'job-started-at.txt'),
            'utf8'
          ).trim()
        : null,
    },
  };
  mkdirSync(output, { recursive: true });
  save(resolve(output, 'source-inventory.json'), initial);
  const originals = new Map();
  let interrupted = false;
  const commandModule = execute
    ? null
    : await import('./lib/typecheck-command.mjs');
  const run = execute ?? commandModule.commandResult;
  const cancel = () => {
    interrupted = true;
    commandModule?.stopActiveCommand();
  };
  process.on('SIGTERM', cancel);
  process.on('SIGINT', cancel);
  const timed = async (
    alias,
    program,
    scenario,
    config,
    cache,
    primeHash = null
  ) => {
    check(
      !interrupted && monotonic() < deadline,
      'Qualification suite deadline/interruption'
    );
    const executable =
      alias === 'ts6'
        ? [
            process.execPath,
            '--max-old-space-size=8192',
            pins.packages.ts6.executable,
          ]
        : [pins.packages[alias].executable];
    const argv = [
      '/usr/bin/taskset',
      '--cpu-list',
      allocation.selected,
      ...executable,
    ];
    argv.push(
      '--project',
      config,
      '--noEmit',
      '--pretty',
      'false',
      '--tsBuildInfoFile',
      cache
    );
    const before = existsSync(cache) ? sha(readFileSync(cache)) : null;
    if (primeHash) assertPrime(cache, primeHash);
    const startedAt = now().toISOString();
    const result = await run(
      argv,
      {
        TURBO_CACHE: 'local:rw',
        TURBO_TOKEN: '',
        TURBO_TEAM: '',
        CI: 'true',
        GOMAXPROCS: '2',
        RAYON_NUM_THREADS: '2',
      },
      Math.min(BOUNDS.invocationMs, deadline - monotonic())
    );
    const entry = {
      alias,
      program,
      scenario,
      argv,
      startedAt,
      endedAt: now().toISOString(),
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      completed: false,
      peakRssKb: result.peakRssKb,
      cpuPercent: result.cpuPercent,
      cacheBefore: before,
      cacheAfter: existsSync(cache) ? sha(readFileSync(cache)) : null,
      primeHash,
      configSha256: sha(readFileSync(config)),
      diagnostics: parseDiagnostics(result.output, root),
    };
    const stem = `${String(receipt.runs.length + 1).padStart(2, '0')}-${program}-${alias}-${scenario}`;
    writeFileSync(resolve(output, `${stem}.log`), result.output);
    entry.rawLog = `${stem}.log`;
    receipt.runs.push(entry);
    save(resolve(output, 'receipt.json'), receipt);
    assertCompleted({ ...result, diagnostics: entry.diagnostics });
    check(!interrupted, 'Qualification interrupted');
    entry.graph = readGraph(cache, root, tools);
    entry.completed = true;
    entry.sourceFiles = entry.graph.repositoryFiles.map(path => ({
      path,
      sha256: sha(readFileSync(resolve(root, path))),
    }));
    cpSync(cache, resolve(output, `${stem}.tsbuildinfo`));
    save(resolve(output, `${stem}.json`), entry);
    return entry;
  };
  try {
    for (const program of programs) {
      const configPath = resolve(root, PROGRAMS[program]);
      const originalCache = resolve(
        output,
        `${program}-ts6-original.tsbuildinfo`
      );
      const original = await timed(
        'ts6',
        program,
        'original-config',
        configPath,
        originalCache
      );
      originals.set(program, original);
      const clean = new Map();
      const configs = new Map();
      const caches = new Map();
      for (const alias of Object.keys(PINS)) {
        const options = { baseUrl: null };
        if (program === 'web')
          options.types = ['vitest', 'jest-dom'].map(name =>
            resolve(root, 'apps/web/tests/types', name)
          );
        if (program === 'ui') options.rootDir = resolve(root, 'packages/ui');
        const config = resolve(output, `${program}-${alias}.json`);
        save(config, { extends: configPath, compilerOptions: options });
        configs.set(alias, config);
        const cache = resolve(output, `${program}-${alias}.tsbuildinfo`);
        caches.set(alias, cache);
        const cold = await timed(alias, program, 'cold', config, cache);
        check(cold.cacheBefore === null, 'Cold cache was present');
        assertEquivalent(cold, original, `${program}/${alias}/original intent`);
        clean.set(alias, cold);
        cpSync(cache, `${cache}.pristine`);
        const warm = await timed(
          alias,
          program,
          'warm',
          config,
          cache,
          cold.cacheAfter
        );
        assertEquivalent(warm, cold, `${program}/${alias}/warm`);
      }
      const seed = seedPlan(root, program);
      const expectations = Object.values(seed).flatMap(item => item.expected);
      save(resolve(output, `${program}-seed-plan.json`), seed);
      const seeded = [];
      for (const alias of Object.keys(PINS)) {
        const cache = caches.get(alias);
        cpSync(`${cache}.pristine`, cache);
        const result = await withMutation(
          root,
          Object.fromEntries(
            Object.entries(seed).map(([path, item]) => [path, item.suffix])
          ),
          () =>
            timed(
              alias,
              program,
              'seeded',
              configs.get(alias),
              cache,
              clean.get(alias).cacheAfter
            )
        );
        assertSeeds(result, expectations);
        check(
          same(result.graph, clean.get(alias).graph),
          'Seeded program graph changed'
        );
        seeded.push(result);
      }
      for (const result of seeded)
        assertEquivalent(
          result,
          seeded[0],
          `${program}/${result.alias}/seeded`
        );
      for (const [scenario, path] of program === 'web'
        ? [
            ['leaf-edit', LEAF],
            ['wide-edit', WIDE],
          ]
        : [['wide-edit', WIDE]]) {
        for (const alias of Object.keys(PINS)) {
          const cache = caches.get(alias);
          cpSync(`${cache}.pristine`, cache);
          await withMutation(
            root,
            {
              [path]: `\nexport type __NativeQualification${scenario === 'leaf-edit' ? 'Leaf' : 'Wide'} = never;\n`,
            },
            async () => {
              const edited = await timed(
                alias,
                program,
                scenario,
                configs.get(alias),
                cache,
                clean.get(alias).cacheAfter
              );
              assertEquivalent(
                edited,
                clean.get(alias),
                `${program}/${alias}/${scenario}`
              );
            }
          );
          const reverted = await timed(
            alias,
            program,
            `${scenario}-revert`,
            configs.get(alias),
            cache
          );
          assertEquivalent(
            reverted,
            clean.get(alias),
            `${program}/${alias}/${scenario}/revert`
          );
        }
      }
    }
    check(
      [...originals.values()].every(entry => entry.exitCode === 0),
      'TS6 baseline is failing; diagnostic parity cannot qualify a green checker'
    );
    receipt.status = 'qualified-for-advisory-observation';
  } catch (error) {
    receipt.status = 'blocked';
    receipt.error = error.message;
  } finally {
    process.off('SIGTERM', cancel);
    process.off('SIGINT', cancel);
    receipt.finishedAt = now().toISOString();
    receipt.durationMs = monotonic() - start;
    try {
      receipt.sourceRestored =
        same(initial, inventory(root)) &&
        !git(root, ['status', '--porcelain', '--untracked-files=normal']) &&
        sourceSha === git(root, ['rev-parse', 'HEAD']);
      receipt.toolsUnchanged = initialTools === json(inspect(root, tools));
      receipt.graphSourceRestored = [...originals.values()].every(entry =>
        entry.sourceFiles.every(
          file => sha(readFileSync(resolve(root, file.path))) === file.sha256
        )
      );
    } catch (error) {
      receipt.restorationError = error.message;
    }
    if (
      !receipt.sourceRestored ||
      !receipt.toolsUnchanged ||
      !receipt.graphSourceRestored
    ) {
      receipt.status = 'blocked';
      receipt.error =
        'Source, generated program input or tool restoration failed';
    }
    receipt.statistics = receipt.runs.map(
      ({
        alias,
        program,
        scenario,
        durationMs,
        completed,
        exitCode,
        timedOut,
      }) => ({
        alias,
        program,
        scenario,
        completed,
        eligibleForTiming:
          receipt.status === 'qualified-for-advisory-observation' &&
          completed &&
          exitCode === 0,
        exitCode,
        timedOut,
        n: completed ? 1 : 0,
        p50Ms: completed ? durationMs : null,
        p95Ms: completed ? durationMs : null,
      })
    );
    receipt.requiredGateCriticalPathSavingsMs = null;
    receipt.requiredGateTiming =
      'Existing source and combined-head required CI receipts must be measured separately.';
    save(resolve(output, 'receipt.json'), receipt);
    const events = ['qualification', 'finished'].map(stage => ({
      schema: 'jovie-stage-event/v1',
      entityType: 'native-typecheck-qualification',
      entityId: `${sourceSha}:${process.env.GITHUB_RUN_ID ?? sha(output).slice(0, 16)}:${process.env.GITHUB_RUN_ATTEMPT ?? 'local'}`,
      stage,
      enteredAt:
        stage === 'qualification' ? receipt.startedAt : receipt.finishedAt,
      exitedAt: receipt.finishedAt,
      actor: null,
      outcome: receipt.status === 'blocked' ? 'failed' : 'completed',
      sourceReceipt: 'receipt.json',
    }));
    try {
      await emitMetrics(root, output, events);
    } catch (error) {
      receipt.status = 'blocked';
      receipt.error = error.message;
      for (const row of receipt.statistics) row.eligibleForTiming = false;
      for (const event of events) event.outcome = 'failed';
      save(resolve(output, 'receipt.json'), receipt);
    }
    writeFileSync(
      resolve(output, 'stage-events.ndjson'),
      `${events.map(event => JSON.stringify(event)).join('\n')}\n`
    );
  }
  return receipt;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    process.stdout.write(
      'Usage: node scripts/typecheck-native-qualification.mjs --run --tools ABSOLUTE_DIRECTORY --output FRESH_ABSOLUTE_DIRECTORY [--program web|ui]\nManual advisory qualification only; required TS6 gates remain authoritative.\n'
    );
    return;
  }
  const result = await runQualification(args);
  process.stdout.write(`${result.status}: ${args.output}/receipt.json\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    writeFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Native checker qualification: **${result.status}**\n\nSource: \`${result.sourceSha}\`; candidate: tsrs ${PINS.tsrs.version}; reference: Microsoft ${PINS.upstream.version}. ${result.runs.length} invocations, ${(result.durationMs / 1000).toFixed(1)}s. Required TS6 gates unchanged; required-gate speedup is not measured by this job.\n`,
      { flag: 'a' }
    );
  process.exitCode = result.status === 'blocked' ? 2 : 0;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
