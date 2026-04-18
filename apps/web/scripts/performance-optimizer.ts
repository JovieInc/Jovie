#!/usr/bin/env tsx

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import {
  buildOptimizerPrompt,
  createEmptyRunState,
  evaluateMeasurement,
  getRankedHypotheses,
  type PerfHypothesis,
  type PerfLoopCliOptions,
  type PerfMode,
  type PerfRunState,
  parsePerfLoopArgs,
} from './performance-optimizer-lib';
import {
  collectChangedFiles,
  measureCurrentState,
  readJsonFile,
  resolveAuthPath,
  resolveStatePaths,
  writeJsonFile,
} from './performance-optimizer-shared';

export {
  collectChangedFiles,
  filterChangedFiles,
  measureCurrentState,
  resolveAuthPath,
  resolveStatePaths,
} from './performance-optimizer-shared';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const perfRoot = resolve(repoRoot, '.context', 'perf');

export function printHelp() {
  console.log(
    [
      'Usage: pnpm --filter web perf:loop --mode homepage --threshold 95',
      '       pnpm --filter web perf:loop --mode route --route-id creator-releases --auth-path apps/web/.auth/session.json',
      '       pnpm --filter web perf:loop --scope end-user',
      '',
      'Options:',
      '  --mode homepage|dashboard|route',
      '  --scope homepage|route|end-user',
      '  --threshold <number>',
      '  --base-url <url>',
      '  --auth-path <path>',
      '  --artifacts-dir <path>',
      '  --group <manifest-group>',
      '  --route-id <manifest-route-id>',
      '  --route <path>',
      '  --runs <number>',
      '  --runs-per-sample <number>',
      '  --max-no-progress <number>',
      '  --hypothesis <label>',
      '  --resume',
      '  --optimize-passing',
      '  --fresh',
      '  --skip-build',
    ].join('\n')
  );
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
  if (state.config.mode !== config.mode) {
    return createEmptyRunState(config, promptPath);
  }

  const nextState = {
    ...state,
    config,
    artifactDir,
    promptPath,
  } satisfies PerfRunState;

  nextState.status = deriveRunStatus({
    bestMeasurement: nextState.bestMeasurement,
    config: nextState.config,
    noProgressCount: nextState.noProgressCount,
    fallbackStatus: nextState.status,
  });

  return nextState;
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

export function deriveRunStatus(options: {
  bestMeasurement?: PerfMeasurement<HomepageSample | DashboardSample>;
  config: PerfRunConfig;
  noProgressCount: number;
  fallbackStatus?: PerfRunState['status'];
}): PerfRunState['status'] {
  const {
    bestMeasurement,
    config,
    noProgressCount,
    fallbackStatus = 'baseline',
  } = options;

  if (!bestMeasurement) {
    return fallbackStatus;
  }

  if (hasReachedThreshold(bestMeasurement, config.threshold, config.mode)) {
    return 'threshold-hit';
  }

  if (noProgressCount >= config.maxNoProgress) {
    return 'stalled';
  }

  return 'running';
}

export function getThresholdRecommendation(
  config: Pick<PerfRunConfig, 'mode' | 'threshold'>
) {
  return config.mode === 'homepage'
    ? Math.min(100, config.threshold + 1)
    : Math.max(1, config.threshold - 25);
}

export function isStricterThreshold(
  config: Pick<PerfRunConfig, 'mode'>,
  currentBest: number,
  nextThreshold: number
) {
  return config.mode === 'homepage'
    ? nextThreshold > currentBest
    : nextThreshold < currentBest;
}

export function getNextHypothesisIndex(currentIndex: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.min(currentIndex + 1, total - 1);
}

async function maybeLowerThreshold(state: PerfRunState) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !state.bestMeasurement) {
    return;
  }

  const recommendation = String(getThresholdRecommendation(state.config));

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

  if (
    !isStricterThreshold(
      state.config,
      state.bestMeasurement.primaryMetric,
      nextThreshold
    )
  ) {
    console.warn(
      'Threshold ' +
        nextThreshold +
        ' is already met by the current best (' +
        state.bestMeasurement.primaryMetric.toFixed(2) +
        '). Enter a stricter value.'
    );
    return;
  }

  state.config.threshold = nextThreshold;
  state.status = deriveRunStatus({
    bestMeasurement: state.bestMeasurement,
    config: state.config,
    noProgressCount: state.noProgressCount,
    fallbackStatus: state.status,
  });
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
  if (cliOptions.scope === 'end-user') {
    const { runEndUserPerfLoop } = await import('./performance-end-user-loop');
    await runEndUserPerfLoop(cliOptions);
    return;
  }
  const artifactDir = resolveArtifactDir(cliOptions);
  const { measurementsDir, promptPath } = resolveStatePaths(artifactDir);
  ensureDir(artifactDir);
  ensureDir(measurementsDir);
  persistCurrentPointer(cliOptions.mode, artifactDir);

  const config: PerfRunConfig = {
    mode: cliOptions.mode,
    scope: cliOptions.scope,
    threshold: cliOptions.threshold,
    baseUrl: cliOptions.baseUrl,
    authPath: resolveAuthPath(cliOptions.authPath),
    maxNoProgress: cliOptions.maxNoProgress,
    runsPerSample: cliOptions.runsPerSample,
    artifactsDir: artifactDir,
    route: cliOptions.route,
    routeId: cliOptions.routeId,
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
  state.nextHypothesisIndex = getNextHypothesisIndex(
    state.nextHypothesisIndex,
    hypotheses.length
  );

  state.status = deriveRunStatus({
    bestMeasurement: state.bestMeasurement,
    config: state.config,
    noProgressCount: state.noProgressCount,
    fallbackStatus: state.status,
  });

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

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch(error => {
    console.error(
      'perf:loop failed:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  });
}
