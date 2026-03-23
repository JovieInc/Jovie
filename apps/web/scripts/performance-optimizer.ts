#!/usr/bin/env tsx

import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  buildDashboardBudgetGuardArgs,
  buildOptimizerPrompt,
  createDashboardMeasurement,
  createEmptyRunState,
  createHomepageMeasurement,
  type DashboardSample,
  evaluateMeasurement,
  extractDashboardSample,
  extractHomepageSample,
  getRankedHypotheses,
  type HomepageSample,
  type PerfHypothesis,
  type PerfLoopCliOptions,
  type PerfMeasurement,
  type PerfMode,
  type PerfRunConfig,
  type PerfRunState,
  parsePerfLoopArgs,
} from './performance-optimizer-lib';

interface CommandResult {
  code: number;
  stderr: string;
  stdout: string;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const perfRoot = resolve(repoRoot, '.context', 'perf');
const defaultAuthPath = resolve(webRoot, '.auth', 'session.json');

export function printHelp() {
  console.log(
    [
      'Usage: pnpm --filter web perf:loop --mode homepage --threshold 95',
      '       pnpm --filter web perf:loop --mode dashboard --threshold 100 --auth-path apps/web/.auth/session.json',
      '',
      'Options:',
      '  --mode homepage|dashboard',
      '  --threshold <number>',
      '  --base-url <url>',
      '  --auth-path <path>',
      '  --artifacts-dir <path>',
      '  --runs-per-sample <number>',
      '  --max-no-progress <number>',
      '  --hypothesis <label>',
      '  --fresh',
      '  --skip-build',
    ].join('\n')
  );
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv }
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });

  return {
    code: result.status ?? 1,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

function assertSuccess(result: CommandResult, message: string) {
  if (result.code === 0) {
    return;
  }

  throw new Error(
    message +
      '\n' +
      [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n')
  );
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function ensureDir(dirPath: string) {
  mkdirSync(dirPath, { recursive: true });
}

function timestampLabel() {
  return new Date().toISOString().replaceAll(':', '-');
}

function artifactDirForMode(mode: PerfMode) {
  return resolve(perfRoot, mode + '-' + timestampLabel());
}

function currentPointerPath(mode: PerfMode) {
  return resolve(perfRoot, mode + '-current.json');
}

function resolveArtifactDir(options: PerfLoopCliOptions) {
  ensureDir(perfRoot);
  if (options.artifactsDir) {
    return resolve(repoRoot, options.artifactsDir);
  }

  const pointerPath = currentPointerPath(options.mode);
  if (!options.fresh && existsSync(pointerPath)) {
    const pointer = readJsonFile<{ artifactDir: string }>(pointerPath);
    if (pointer.artifactDir) {
      return pointer.artifactDir;
    }
  }

  return artifactDirForMode(options.mode);
}

function persistCurrentPointer(mode: PerfMode, artifactDir: string) {
  writeJsonFile(currentPointerPath(mode), { artifactDir });
}

function resolveStatePaths(artifactDir: string) {
  return {
    measurementsDir: resolve(artifactDir, 'measurements'),
    promptPath: resolve(artifactDir, 'optimizer-prompt.txt'),
    statePath: resolve(artifactDir, 'state.json'),
  };
}

function resolveAuthPath(authPath?: string) {
  if (authPath) {
    return resolve(repoRoot, authPath);
  }

  return existsSync(defaultAuthPath) ? defaultAuthPath : undefined;
}

function collectChangedFiles() {
  const tracked = runCommand(
    'git',
    ['diff', '--name-only', '--relative', 'HEAD'],
    { cwd: repoRoot }
  );
  assertSuccess(tracked, 'Failed to list tracked changes.');

  const untracked = runCommand(
    'git',
    ['ls-files', '--others', '--exclude-standard'],
    { cwd: repoRoot }
  );
  assertSuccess(untracked, 'Failed to list untracked changes.');

  return [
    ...new Set(
      [...tracked.stdout.split('\n'), ...untracked.stdout.split('\n')]
        .map(line => line.trim())
        .filter(Boolean)
    ),
  ];
}

function getBaseUrlServerConfig(baseUrl: string) {
  const parsedUrl = new URL(baseUrl);
  const port = parsedUrl.port
    ? Number(parsedUrl.port)
    : parsedUrl.protocol === 'https:'
      ? 443
      : 80;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Invalid base URL port: ' + baseUrl);
  }

  const hostname =
    parsedUrl.hostname === 'localhost' ? '127.0.0.1' : parsedUrl.hostname;

  return { hostname, port };
}

async function assertBaseUrlPortAvailable(baseUrl: string) {
  const { hostname, port } = getBaseUrlServerConfig(baseUrl);
  const lsofResult = spawnSync(
    'lsof',
    ['-nP', '-iTCP:' + String(port), '-sTCP:LISTEN', '-t'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    }
  );

  if (lsofResult.status === 0 && lsofResult.stdout.trim()) {
    throw new Error(
      'Port ' +
        port +
        ' already has a listening process. Pass --base-url with a free local port before running perf:loop.'
    );
  }

  await new Promise<void>((resolvePromise, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', () => {
      reject(
        new Error(
          'Port ' +
            port +
            ' is already in use for ' +
            hostname +
            '. Pass --base-url with a free local port before running perf:loop.'
        )
      );
    });
    probe.listen(port, hostname, () => {
      probe.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolvePromise();
      });
    });
  });
}

async function waitForServer(baseUrl: string, child: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('Next.js server exited before it became ready.');
    }

    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.status < 500) {
        if (child.exitCode !== null) {
          throw new Error(
            'Next.js server exited before the perf target was ready.'
          );
        }
        return;
      }
    } catch {
      // Poll until the server is up.
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, 1000));
  }

  throw new Error('Timed out waiting for the production server to start.');
}

async function startServer(baseUrl: string, artifactDir: string) {
  await assertBaseUrlPortAvailable(baseUrl);

  const logPath = resolve(artifactDir, 'server.log');
  writeFileSync(logPath, '');
  const { hostname, port } = getBaseUrlServerConfig(baseUrl);

  const child = spawn(
    'doppler',
    ['run', '--', 'pnpm', '--filter', 'web', 'start'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOSTNAME: hostname,
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const append = (chunk: Buffer | string) => {
    writeFileSync(logPath, String(chunk), { flag: 'a' });
  };

  child.stdout?.on('data', append);
  child.stderr?.on('data', append);

  await waitForServer(baseUrl, child);
  return child;
}

async function stopServer(child: ReturnType<typeof spawn>) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }

  child.kill('SIGKILL');
}

function buildProject() {
  const result = runCommand(
    'doppler',
    ['run', '--', 'pnpm', '--filter', 'web', 'build'],
    { cwd: repoRoot }
  );
  assertSuccess(result, 'Production build failed.');
}

function measureHomepageSample(baseUrl: string) {
  const lighthouseDir = resolve(webRoot, '.lighthouseci');
  rmSync(lighthouseDir, { recursive: true, force: true });

  const result = runCommand(
    'pnpm',
    [
      'exec',
      'lhci',
      'collect',
      '--config=.lighthouserc.pr.json',
      '--url=' + baseUrl.replace(/\/$/, '') + '/',
      '--numberOfRuns=1',
    ],
    { cwd: webRoot }
  );
  assertSuccess(result, 'Lighthouse collection failed.');

  const reportFiles = existsSync(lighthouseDir)
    ? readdirSync(lighthouseDir).filter(file => /^lhr-\d+\.json$/.test(file))
    : [];
  if (reportFiles.length === 0) {
    throw new Error(
      'Lighthouse collection completed without an lhr-*.json report.'
    );
  }

  const latestReport = reportFiles.sort().at(-1);
  if (!latestReport) {
    throw new Error('Unable to resolve a Lighthouse report path.');
  }

  const lhrPath = resolve(lighthouseDir, latestReport);
  const lhr = readJsonFile<unknown>(lhrPath);
  return { raw: lhr, sample: extractHomepageSample(lhr as never) };
}

function parseJsonOutput(output: string, message: string) {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error(message);
  }
  return JSON.parse(trimmed) as unknown;
}

function measureDashboardSample(baseUrl: string, authPath?: string) {
  const env: NodeJS.ProcessEnv = { ...process.env, BASE_URL: baseUrl };
  const resolvedAuthPath = resolveAuthPath(authPath);
  if (!process.env.CLERK_SESSION_COOKIE && !resolvedAuthPath) {
    throw new Error(
      'Dashboard mode requires CLERK_SESSION_COOKIE or --auth-path pointing to a Clerk storage state file.'
    );
  }
  if (resolvedAuthPath) {
    env.PERF_BUDGET_AUTH_PATH = resolvedAuthPath;
  }

  const args = buildDashboardBudgetGuardArgs(resolvedAuthPath);
  const result = runCommand('doppler', args, { cwd: repoRoot, env });
  const rawSummary = parseJsonOutput(
    result.stdout,
    'Performance budget guard did not emit JSON output.'
  );

  return {
    raw: rawSummary,
    sample: extractDashboardSample(rawSummary as never),
  };
}

async function measureCurrentState(
  config: PerfRunConfig,
  measurementsDir: string,
  skipBuild: boolean
): Promise<PerfMeasurement<HomepageSample | DashboardSample>> {
  if (!skipBuild) {
    buildProject();
  }

  const server = await startServer(config.baseUrl, config.artifactsDir);
  try {
    if (config.mode === 'homepage') {
      const samples: HomepageSample[] = [];
      const rawSamples: unknown[] = [];
      for (let run = 0; run < config.runsPerSample; run++) {
        const result = measureHomepageSample(config.baseUrl);
        samples.push(result.sample);
        rawSamples.push(result.raw);
        writeJsonFile(
          resolve(
            measurementsDir,
            'homepage-sample-' + String(run + 1).padStart(2, '0') + '.json'
          ),
          result.raw
        );
      }

      return createHomepageMeasurement(
        samples,
        config.threshold,
        rawSamples
      ) as PerfMeasurement<HomepageSample | DashboardSample>;
    }

    const samples: DashboardSample[] = [];
    const rawSamples: unknown[] = [];
    for (let run = 0; run < config.runsPerSample; run++) {
      const result = measureDashboardSample(config.baseUrl, config.authPath);
      samples.push(result.sample);
      rawSamples.push(result.raw);
      writeJsonFile(
        resolve(
          measurementsDir,
          'dashboard-sample-' + String(run + 1).padStart(2, '0') + '.json'
        ),
        result.raw
      );
    }

    return createDashboardMeasurement(
      samples,
      config.threshold,
      rawSamples
    ) as PerfMeasurement<HomepageSample | DashboardSample>;
  } finally {
    await stopServer(server);
  }
}

function writePrompt(state: PerfRunState, changedFiles: string[]) {
  const hypotheses = getRankedHypotheses(state.config.mode);
  const nextHypothesis = hypotheses[state.nextHypothesisIndex] as
    | PerfHypothesis
    | undefined;
  const prompt = buildOptimizerPrompt({
    state,
    nextHypothesis,
    changedFiles,
  });
  writeFileSync(state.promptPath, prompt + '\n');
}

function loadState(
  artifactDir: string,
  config: PerfRunConfig,
  promptPath: string
) {
  const { statePath } = resolveStatePaths(artifactDir);
  if (!existsSync(statePath)) {
    return createEmptyRunState(config, promptPath);
  }

  const state = readJsonFile<PerfRunState>(statePath);
  return {
    ...state,
    config,
    artifactDir,
    promptPath,
  } satisfies PerfRunState;
}

function saveState(state: PerfRunState) {
  state.updatedAt = new Date().toISOString();
  const { statePath } = resolveStatePaths(state.artifactDir);
  writeJsonFile(statePath, state);
}

function hasReachedThreshold(
  measurement: PerfMeasurement<HomepageSample | DashboardSample>,
  threshold: number,
  mode: PerfMode
) {
  if (mode === 'homepage') {
    return measurement.primaryMetric >= threshold;
  }

  return measurement.primaryMetric <= threshold;
}

async function maybeLowerThreshold(state: PerfRunState) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !state.bestMeasurement) {
    return;
  }

  const recommendation =
    state.config.mode === 'homepage'
      ? String(Math.min(100, state.config.threshold + 1))
      : String(Math.max(25, state.config.threshold - 25));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (
    await rl.question(
      'Threshold hit at ' +
        state.bestMeasurement.primaryMetric.toFixed(2) +
        (state.bestMeasurement.primaryMetricUnit === 'points'
          ? ' points'
          : 'ms') +
        '. Enter a stricter threshold to keep going or press Enter to stop [' +
        recommendation +
        ']: '
    )
  ).trim();
  rl.close();

  if (!answer) {
    return;
  }

  const nextThreshold = Number(answer);
  if (!Number.isFinite(nextThreshold)) {
    console.warn('Ignoring non-numeric threshold:', answer);
    return;
  }

  state.config.threshold = nextThreshold;
  state.status = 'running';
}

function printMeasurementSummary(state: PerfRunState) {
  const measurement = state.bestMeasurement;
  if (!measurement) {
    return;
  }

  console.log('Current best metric:', measurement.primaryMetric.toFixed(2));
  console.log('Threshold:', state.config.threshold);
  console.log('Summary:', measurement.summary);
}

function printNextHypothesis(state: PerfRunState) {
  const nextHypothesis = getRankedHypotheses(state.config.mode)[
    state.nextHypothesisIndex
  ];
  if (!nextHypothesis) {
    console.log('No remaining ranked hypotheses.');
    return;
  }

  console.log('Next hypothesis:', nextHypothesis.summary);
  console.log('Evidence:', nextHypothesis.evidence.join(' | '));
}

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes('--help')) {
    printHelp();
    return;
  }

  const cliOptions = parsePerfLoopArgs(rawArgs);
  const artifactDir = resolveArtifactDir(cliOptions);
  const { measurementsDir, promptPath } = resolveStatePaths(artifactDir);
  ensureDir(artifactDir);
  ensureDir(measurementsDir);
  persistCurrentPointer(cliOptions.mode, artifactDir);

  const config: PerfRunConfig = {
    mode: cliOptions.mode,
    threshold: cliOptions.threshold,
    baseUrl: cliOptions.baseUrl,
    authPath: resolveAuthPath(cliOptions.authPath),
    maxNoProgress: cliOptions.maxNoProgress,
    runsPerSample: cliOptions.runsPerSample,
    artifactsDir: artifactDir,
  };

  const changedFiles = collectChangedFiles();
  const state = loadState(artifactDir, config, promptPath);

  if (!state.bestMeasurement) {
    console.log(
      'No baseline found. Measuring current workspace as baseline...'
    );
    const measurement = await measureCurrentState(
      config,
      measurementsDir,
      cliOptions.skipBuild
    );
    state.baselineMeasurement = measurement;
    state.bestMeasurement = measurement;
    state.status = hasReachedThreshold(
      measurement,
      config.threshold,
      config.mode
    )
      ? 'threshold-hit'
      : 'running';
    writeJsonFile(resolve(artifactDir, 'baseline.json'), measurement);
    writePrompt(state, changedFiles);
    saveState(state);
    printMeasurementSummary(state);
    printNextHypothesis(state);
    if (state.status === 'threshold-hit') {
      await maybeLowerThreshold(state);
      writePrompt(state, changedFiles);
      saveState(state);
    }
    return;
  }

  if (changedFiles.length === 0) {
    console.log(
      'Workspace is clean relative to HEAD. Reusing the current best measurement.'
    );
    printMeasurementSummary(state);
    printNextHypothesis(state);
    writePrompt(state, changedFiles);
    saveState(state);
    if (state.status === 'threshold-hit') {
      await maybeLowerThreshold(state);
      writePrompt(state, changedFiles);
      saveState(state);
    }
    return;
  }

  const measurement = await measureCurrentState(
    config,
    measurementsDir,
    cliOptions.skipBuild
  );
  const decision = evaluateMeasurement(state.bestMeasurement, measurement);
  const hypotheses = getRankedHypotheses(state.config.mode);
  const hypothesisLabel =
    cliOptions.hypothesis ||
    hypotheses[state.nextHypothesisIndex]?.summary ||
    'Unspecified optimization';

  const iteration = {
    iteration: state.iterations.length + 1,
    hypothesis: hypothesisLabel,
    filesChanged: changedFiles,
    baseline: state.bestMeasurement.primaryMetric,
    measured: measurement.primaryMetric,
    accepted: decision.accepted,
    reason: decision.reason,
  };
  state.iterations.push(iteration);
  writeJsonFile(
    resolve(
      artifactDir,
      'iteration-' + String(iteration.iteration).padStart(3, '0') + '.json'
    ),
    { iteration, measurement }
  );

  if (decision.accepted) {
    state.bestMeasurement = measurement;
    state.noProgressCount = 0;
  } else {
    state.noProgressCount += 1;
  }
  state.nextHypothesisIndex = Math.min(
    state.nextHypothesisIndex + 1,
    hypotheses.length
  );

  if (decision.thresholdReached && decision.accepted) {
    state.status = 'threshold-hit';
  } else if (state.noProgressCount >= state.config.maxNoProgress) {
    state.status = 'stalled';
  } else {
    state.status = 'running';
  }

  writePrompt(state, changedFiles);
  saveState(state);

  console.log(
    'Current best metric:',
    state.bestMeasurement.primaryMetric.toFixed(2)
  );
  console.log('Threshold:', state.config.threshold);
  console.log('Hypothesis under test:', hypothesisLabel);
  console.log('Changed files:', changedFiles.join(', '));
  console.log('Decision:', decision.accepted ? 'accept' : 'reject');
  console.log('Reason:', decision.reason);
  printNextHypothesis(state);

  if (state.status === 'threshold-hit') {
    await maybeLowerThreshold(state);
    writePrompt(state, changedFiles);
    saveState(state);
  }
}

main().catch(error => {
  console.error(
    'perf:loop failed:',
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
