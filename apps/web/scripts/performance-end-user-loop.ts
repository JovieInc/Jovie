#!/usr/bin/env tsx

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type GuardSummary,
  type PageResult,
  runPerformanceBudgetsGuard,
} from './performance-budgets-guard';
import {
  buildOptimizerPrompt,
  createEmptyRunState,
  evaluateMeasurement,
  getDefaultThreshold,
  getRankedHypotheses,
  type PerfLoopCliOptions,
  type PerfMeasurement,
  type PerfRunConfig,
  type PerfRunState,
  parsePerfLoopArgs,
} from './performance-optimizer-lib';
import {
  collectChangedFiles,
  deriveRunStatus,
  getThresholdRecommendation,
  isStricterThreshold,
  measureCurrentState,
  resolveStatePaths,
} from './performance-optimizer-shared';
import { buildRouteQueue, findFreePort } from './performance-overnight';
import {
  getPrimaryTimingMetricName,
  getRouteTimingBudgets,
  type PerfRouteDefinition,
  type PerfRouteGroup,
  type PerfRouteSurface,
  type PerfTimingMetricName,
  selectPerfRoutes,
} from './performance-route-manifest';

type EndUserLoopStatus = 'baseline' | 'running' | 'completed' | 'stalled';
type EndUserRouteStatus = 'pending' | 'running' | 'passed' | 'stalled';

interface EndUserRouteState {
  readonly routeId: string;
  readonly group: PerfRouteGroup;
  readonly path: string;
  readonly surface: PerfRouteSurface;
  readonly requiresAuth: boolean;
  routeArtifactDir: string;
  status: EndUserRouteStatus;
  perfState: PerfRunState;
  lastPageResult?: PageResult;
}

interface EndUserLoopState {
  readonly version: number;
  readonly artifactDir: string;
  readonly promptPath: string;
  readonly createdAt: string;
  updatedAt: string;
  status: EndUserLoopStatus;
  readonly optimizePassing: boolean;
  authPath?: string;
  baselinePath?: string;
  readonly selectedRouteIds: readonly string[];
  readonly routeOrder: readonly string[];
  currentRouteId: string | null;
  completedRoutes: readonly string[];
  stalledRoutes: readonly string[];
  routeStates: Record<string, EndUserRouteState>;
  measurementCount: number;
}

interface CommandResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const perfRoot = resolve(repoRoot, '.context', 'perf');
const pointerPath = resolve(perfRoot, 'end-user-current.json');
const defaultAuthOutputPath = resolve(perfRoot, 'auth', 'user.json');

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function timestampLabel() {
  return new Date().toISOString().replaceAll(':', '-');
}

function dedupe(items: readonly string[]) {
  return [...new Set(items)];
}

function resolveArtifactDir(options: PerfLoopCliOptions) {
  ensureDir(perfRoot);
  if (options.artifactsDir) {
    return resolve(repoRoot, options.artifactsDir);
  }

  if (!options.fresh && existsSync(pointerPath)) {
    const pointer = readJsonFile<{ artifactDir: string }>(pointerPath);
    if (pointer.artifactDir) {
      return pointer.artifactDir;
    }
  }

  return resolve(perfRoot, `end-user-${timestampLabel()}`);
}

function persistCurrentPointer(artifactDir: string) {
  writeJsonFile(pointerPath, { artifactDir });
}

function resolveEndUserStatePaths(artifactDir: string) {
  return {
    baselinePath: resolve(artifactDir, 'baseline.json'),
    measurementsDir: resolve(artifactDir, 'measurements'),
    promptPath: resolve(artifactDir, 'optimizer-prompt.txt'),
    routesDir: resolve(artifactDir, 'routes'),
    statePath: resolve(artifactDir, 'state.json'),
  };
}

function runCommand(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv }
): CommandResult {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
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
    [message, result.stdout.trim(), result.stderr.trim()]
      .filter(Boolean)
      .join('\n')
  );
}

function buildProject() {
  const buildResult = runCommand(
    'doppler',
    ['run', '--', 'pnpm', '--filter', 'web', 'build'],
    { cwd: repoRoot }
  );
  assertSuccess(buildResult, 'End-user perf baseline build failed.');
}

async function waitForServer(baseUrl: string, child: ReturnType<typeof spawn>) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error('The performance server exited before it became ready.');
    }

    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.status < 500) {
        return;
      }
    } catch {
      // Keep polling until the server is ready.
    }

    await new Promise(resolvePromise => setTimeout(resolvePromise, 1000));
  }

  throw new Error('Timed out waiting for the performance server to start.');
}

export function resolveServerBaseUrl(requestedBaseUrl: string, port: number) {
  const parsedUrl = new URL(requestedBaseUrl);
  parsedUrl.port = String(port);
  parsedUrl.pathname = '';
  parsedUrl.search = '';
  parsedUrl.hash = '';
  return parsedUrl.toString().replace(/\/$/, '');
}

async function startServer(
  artifactDir: string,
  requestedBaseUrl: string,
  port: number,
  extraEnv?: NodeJS.ProcessEnv
) {
  const baseUrl = resolveServerBaseUrl(requestedBaseUrl, port);
  const hostname = new URL(baseUrl).hostname;
  const logPath = resolve(artifactDir, 'server.log');
  writeFileSync(logPath, '');

  const child = spawn(
    'doppler',
    ['run', '--', 'pnpm', '--filter', 'web', 'start'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...extraEnv,
        HOSTNAME: hostname,
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  const appendOutput = (chunk: Buffer | string) => {
    writeFileSync(logPath, String(chunk), { flag: 'a' });
  };
  child.stdout?.on('data', appendOutput);
  child.stderr?.on('data', appendOutput);

  await waitForServer(baseUrl, child);

  return {
    baseUrl,
    child,
  };
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

function isLoopbackBaseUrl(baseUrl: string) {
  const hostname = new URL(baseUrl).hostname;
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

function runPerfAuth(baseUrl: string, authPath: string) {
  const authResult = runCommand(
    'pnpm',
    [
      '--filter',
      'web',
      'exec',
      'tsx',
      'scripts/performance-auth.ts',
      '--base-url',
      baseUrl,
      '--out',
      authPath,
      '--json',
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
      },
    }
  );

  if (authResult.code !== 0) {
    throw new Error(
      [authResult.stdout.trim(), authResult.stderr.trim()]
        .filter(Boolean)
        .join('\n')
    );
  }

  const parsed = JSON.parse(authResult.stdout) as { authStatePath: string };
  return parsed.authStatePath;
}

function bootstrapAuthState(baseUrl: string, explicitAuthPath?: string) {
  const authPath = explicitAuthPath
    ? resolve(repoRoot, explicitAuthPath)
    : defaultAuthOutputPath;

  ensureDir(dirname(authPath));

  return runPerfAuth(baseUrl, authPath);
}

function requiresAuth(routes: readonly PerfRouteDefinition[]) {
  return routes.some(route => route.requiresAuth);
}

function getPrimaryBudget(route: PerfRouteDefinition) {
  const primaryMetric = getPrimaryTimingMetricName(route);
  const entry = getRouteTimingBudgets(route).find(
    budget => budget.metric === primaryMetric
  );

  if (!entry) {
    throw new Error(`Route ${route.id} is missing a primary budget.`);
  }

  return {
    metric: primaryMetric,
    budget: entry.budget,
  };
}

function createRouteRunConfig(
  route: PerfRouteDefinition,
  artifactDir: string,
  baseUrl: string,
  authPath: string | undefined,
  cliOptions: PerfLoopCliOptions
): PerfRunConfig {
  const primaryBudget = getPrimaryBudget(route);

  return {
    mode: route.id === 'home' ? 'homepage' : 'route',
    scope: 'route',
    threshold:
      route.id === 'home'
        ? getDefaultThreshold('homepage')
        : primaryBudget.budget,
    baseUrl,
    authPath: route.requiresAuth ? authPath : undefined,
    maxNoProgress: cliOptions.maxNoProgress,
    runsPerSample: cliOptions.runsPerSample,
    artifactsDir: artifactDir,
    route: route.path,
    routeId: route.id,
  };
}

function getSelectedRoutes(cliOptions: PerfLoopCliOptions) {
  return selectPerfRoutes({
    groupIds: cliOptions.groupIds,
    routeIds: cliOptions.routeId ? [cliOptions.routeId] : [],
  });
}

function extractPageByRouteId(summary: GuardSummary, routeId: string) {
  const page = summary.pages.find(entry => entry.id === routeId);
  if (!page) {
    throw new Error(`Route ${routeId} missing from guard summary.`);
  }

  return page;
}

export function createEndUserLoopState(options: {
  readonly artifactDir: string;
  readonly authPath?: string;
  readonly baselineSummary: GuardSummary;
  readonly cliOptions: PerfLoopCliOptions;
  readonly promptPath: string;
  readonly routes: readonly PerfRouteDefinition[];
  readonly routesDir: string;
}): EndUserLoopState {
  const selectedRouteIds = options.routes.map(route => route.id);
  const selectedRouteIdSet = new Set(selectedRouteIds);
  const failingRouteIds = buildRouteQueue(options.baselineSummary)
    .map(entry => entry.id)
    .filter(routeId => selectedRouteIdSet.has(routeId));
  const passingRouteIds = selectedRouteIds.filter(
    routeId => !failingRouteIds.includes(routeId)
  );
  const routeOrder = options.cliOptions.optimizePassing
    ? [...failingRouteIds, ...passingRouteIds]
    : failingRouteIds;
  const now = new Date().toISOString();

  const routeStates = Object.fromEntries(
    options.routes.map(route => {
      const routeArtifactDir = resolve(options.routesDir, route.id);
      ensureDir(routeArtifactDir);
      const promptPath = resolve(routeArtifactDir, 'optimizer-prompt.txt');
      const perfState = createEmptyRunState(
        createRouteRunConfig(
          route,
          routeArtifactDir,
          options.cliOptions.baseUrl,
          options.authPath,
          options.cliOptions
        ),
        promptPath
      );
      const lastPageResult = extractPageByRouteId(
        options.baselineSummary,
        route.id
      );

      return [
        route.id,
        {
          routeId: route.id,
          group: route.group,
          path: route.path,
          surface: route.surface,
          requiresAuth: route.requiresAuth,
          routeArtifactDir,
          status:
            !options.cliOptions.optimizePassing &&
            !failingRouteIds.includes(route.id)
              ? 'passed'
              : 'pending',
          perfState,
          lastPageResult,
        } satisfies EndUserRouteState,
      ];
    })
  ) satisfies Record<string, EndUserRouteState>;

  const completedRoutes = options.cliOptions.optimizePassing
    ? []
    : passingRouteIds;
  const currentRouteId = routeOrder[0] ?? null;

  return {
    version: 1,
    artifactDir: options.artifactDir,
    promptPath: options.promptPath,
    createdAt: now,
    updatedAt: now,
    status: currentRouteId ? 'running' : 'completed',
    optimizePassing: options.cliOptions.optimizePassing,
    authPath: options.authPath,
    selectedRouteIds,
    routeOrder,
    currentRouteId,
    completedRoutes,
    stalledRoutes: [],
    routeStates,
    measurementCount: 0,
  };
}

export function refreshEndUserLoopStateConfig(
  state: EndUserLoopState,
  cliOptions: PerfLoopCliOptions
) {
  const nextRouteStates = Object.fromEntries(
    Object.entries(state.routeStates).map(([routeId, routeState]) => {
      const nextConfig: PerfRunConfig = {
        ...routeState.perfState.config,
        baseUrl: cliOptions.baseUrl,
        authPath: routeState.requiresAuth
          ? cliOptions.authPath
            ? resolve(repoRoot, cliOptions.authPath)
            : state.authPath
          : undefined,
        maxNoProgress: cliOptions.maxNoProgress,
        runsPerSample: cliOptions.runsPerSample,
      };

      return [
        routeId,
        {
          ...routeState,
          perfState: {
            ...routeState.perfState,
            config: nextConfig,
          },
        } satisfies EndUserRouteState,
      ];
    })
  ) satisfies Record<string, EndUserRouteState>;

  return {
    ...state,
    routeStates: nextRouteStates,
  } satisfies EndUserLoopState;
}

function saveState(statePath: string, state: EndUserLoopState) {
  state.updatedAt = new Date().toISOString();
  writeJsonFile(statePath, state);
}

export function normalizeRawPageResults(
  measurement: PerfMeasurement<unknown>,
  routeId: string
) {
  const rawSamples = Array.isArray(measurement.raw)
    ? measurement.raw
    : [measurement.raw];
  const pages = rawSamples
    .flatMap(sample => {
      if (!sample || typeof sample !== 'object') {
        return [];
      }
      return ((sample as GuardSummary).pages ?? []) as PageResult[];
    })
    .filter(page => page.id === routeId);

  if (pages.length === 0) {
    throw new Error(`No raw page results found for route ${routeId}.`);
  }

  const primaryMetric = pages[0]?.primaryMetric;
  if (!primaryMetric) {
    throw new Error(`Route ${routeId} is missing a primary metric.`);
  }

  return [...pages].sort((left, right) => {
    return (
      (left.rawTimings[primaryMetric as PerfTimingMetricName] ?? 0) -
      (right.rawTimings[primaryMetric as PerfTimingMetricName] ?? 0)
    );
  })[Math.floor(pages.length / 2)] as PageResult;
}

async function measureGuardSummaryForRoute(options: {
  readonly artifactDir: string;
  readonly authPath?: string;
  readonly routeId: string;
  readonly runs: number;
  readonly skipBuild: boolean;
}) {
  if (!options.skipBuild) {
    buildProject();
  }

  const port = await findFreePort();
  const server = await startServer(options.artifactDir, port);
  try {
    return await runPerformanceBudgetsGuard({
      authPath: options.authPath,
      baseUrl: server.baseUrl,
      groupIds: [],
      json: true,
      manifestPath: undefined,
      paths: [],
      routeIds: [options.routeId],
      runs: options.runs,
    });
  } finally {
    await stopServer(server.child);
  }
}

function getCurrentRouteState(state: EndUserLoopState) {
  if (!state.currentRouteId) {
    return undefined;
  }

  return state.routeStates[state.currentRouteId];
}

function updateLoopStatus(state: EndUserLoopState) {
  const remainingRoutes = state.routeOrder.filter(routeId => {
    return (
      !state.completedRoutes.includes(routeId) &&
      !state.stalledRoutes.includes(routeId)
    );
  });

  if (remainingRoutes.length === 0) {
    state.currentRouteId = null;
    state.status = state.stalledRoutes.length > 0 ? 'stalled' : 'completed';
    return;
  }

  state.currentRouteId = remainingRoutes[0] ?? null;
  state.status = 'running';
}

function maybeTightenHomepageThreshold(routeState: EndUserRouteState) {
  if (
    routeState.routeId !== 'home' ||
    routeState.perfState.status !== 'threshold-hit' ||
    !routeState.perfState.bestMeasurement
  ) {
    return;
  }

  const nextThreshold = getThresholdRecommendation(routeState.perfState.config);
  if (
    !isStricterThreshold(
      routeState.perfState.config,
      routeState.perfState.bestMeasurement.primaryMetric,
      nextThreshold
    )
  ) {
    return;
  }

  routeState.perfState.config.threshold = nextThreshold;
  routeState.perfState.status = deriveRunStatus({
    bestMeasurement: routeState.perfState.bestMeasurement,
    config: routeState.perfState.config,
    noProgressCount: routeState.perfState.noProgressCount,
    fallbackStatus: 'running',
  });
}

export function applyRouteOutcome(
  state: EndUserLoopState,
  routeState: EndUserRouteState,
  pageResult: PageResult
) {
  routeState.lastPageResult = pageResult;

  if (pageResult.violations.length === 0) {
    routeState.status = 'passed';
    state.completedRoutes = dedupe([
      ...state.completedRoutes,
      routeState.routeId,
    ]);
    updateLoopStatus(state);
    return;
  }

  maybeTightenHomepageThreshold(routeState);

  if (routeState.perfState.status === 'stalled') {
    routeState.status = 'stalled';
    state.stalledRoutes = dedupe([...state.stalledRoutes, routeState.routeId]);
    updateLoopStatus(state);
    return;
  }

  routeState.status = 'running';
  state.currentRouteId = routeState.routeId;
  state.status = 'running';
}

function writePrompt(state: EndUserLoopState, changedFiles: readonly string[]) {
  const routeState = getCurrentRouteState(state);

  if (!routeState) {
    const lines = [
      'All selected end-user performance routes are complete.',
      `Completed routes: ${state.completedRoutes.join(', ') || 'none'}`,
      `Stalled routes: ${state.stalledRoutes.join(', ') || 'none'}`,
    ];
    writeFileSync(state.promptPath, lines.join('\n') + '\n');
    return;
  }

  const nextHypothesis = getRankedHypotheses(routeState.perfState.config.mode)[
    routeState.perfState.nextHypothesisIndex
  ];
  const routePrompt = buildOptimizerPrompt({
    state: routeState.perfState,
    nextHypothesis,
    changedFiles: [...changedFiles],
  });

  const remainingRouteIds = state.routeOrder.filter(routeId => {
    return (
      !state.completedRoutes.includes(routeId) &&
      !state.stalledRoutes.includes(routeId)
    );
  });

  const summaryLines = [
    'You are running the end-user performance loop.',
    `Current route: ${routeState.routeId} (${routeState.path})`,
    `Completed routes: ${state.completedRoutes.join(', ') || 'none'}`,
    `Stalled routes: ${state.stalledRoutes.join(', ') || 'none'}`,
    `Remaining queue: ${remainingRouteIds.join(', ') || 'none'}`,
    '',
    routePrompt,
  ];

  writeFileSync(state.promptPath, summaryLines.join('\n') + '\n');
  writeFileSync(routeState.perfState.promptPath, routePrompt + '\n');
}

function printLoopSummary(state: EndUserLoopState) {
  const routeState = getCurrentRouteState(state);
  if (!routeState) {
    console.log('No remaining end-user perf routes.');
    console.log('Completed:', state.completedRoutes.join(', ') || 'none');
    console.log('Stalled:', state.stalledRoutes.join(', ') || 'none');
    return;
  }

  console.log('Current route:', routeState.routeId, routeState.path);
  console.log('Completed:', state.completedRoutes.join(', ') || 'none');
  console.log('Stalled:', state.stalledRoutes.join(', ') || 'none');
  if (routeState.perfState.bestMeasurement) {
    console.log(
      'Current best metric:',
      routeState.perfState.bestMeasurement.primaryMetric.toFixed(2)
    );
    console.log('Threshold:', routeState.perfState.config.threshold);
    console.log('Summary:', routeState.perfState.bestMeasurement.summary);
  } else {
    console.log('Current route baseline not captured yet.');
  }
}

async function captureBaselineSummary(
  artifactDir: string,
  routes: readonly PerfRouteDefinition[],
  cliOptions: PerfLoopCliOptions
) {
  if (!cliOptions.skipBuild) {
    buildProject();
  }

  const port = await findFreePort();
  let server = await startServer(artifactDir, cliOptions.baseUrl, port);

  try {
    let authPath = cliOptions.authPath
      ? resolve(repoRoot, cliOptions.authPath)
      : undefined;

    if (
      requiresAuth(routes) &&
      !authPath &&
      !process.env.CLERK_SESSION_COOKIE
    ) {
      try {
        authPath = bootstrapAuthState(server.baseUrl, cliOptions.authPath);
      } catch (error) {
        if (
          !isLoopbackBaseUrl(server.baseUrl) ||
          !process.env.E2E_CLERK_USER_ID
        ) {
          throw error;
        }

        writeFileSync(
          resolve(artifactDir, 'auth-fallback.log'),
          `Primary auth bootstrap failed at ${new Date().toISOString()}.\n${String(
            error
          )}\nRetrying with loopback test-auth bypass enabled.\n`
        );
        await stopServer(server.child);
        server = await startServer(artifactDir, cliOptions.baseUrl, port, {
          E2E_USE_TEST_AUTH_BYPASS: '1',
          NEXT_PUBLIC_CLERK_MOCK: '1',
          NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
        });
        authPath = bootstrapAuthState(server.baseUrl, cliOptions.authPath);
      }
    }

    const summary = await runPerformanceBudgetsGuard({
      authPath,
      baseUrl: server.baseUrl,
      groupIds: [],
      json: true,
      manifestPath: undefined,
      paths: [],
      routeIds: routes.map(route => route.id),
      runs: cliOptions.runsPerSample,
    });

    return {
      authPath,
      summary,
    };
  } finally {
    await stopServer(server.child);
  }
}

function createIterationRecord(
  routeState: EndUserRouteState,
  measurement: PerfMeasurement<unknown>,
  accepted: boolean,
  reason: string,
  changedFiles: readonly string[]
) {
  return {
    iteration: routeState.perfState.iterations.length + 1,
    hypothesis:
      getRankedHypotheses(routeState.perfState.config.mode)[
        routeState.perfState.nextHypothesisIndex
      ]?.summary ?? 'Unspecified optimization',
    filesChanged: [...changedFiles],
    baseline: routeState.perfState.bestMeasurement?.primaryMetric ?? 0,
    measured: measurement.primaryMetric,
    accepted,
    reason,
  };
}

export async function runEndUserPerfLoop(cliOptions: PerfLoopCliOptions) {
  const artifactDir = resolveArtifactDir(cliOptions);
  const { baselinePath, measurementsDir, promptPath, routesDir, statePath } =
    resolveEndUserStatePaths(artifactDir);
  ensureDir(artifactDir);
  ensureDir(measurementsDir);
  ensureDir(routesDir);
  persistCurrentPointer(artifactDir);

  if (!existsSync(statePath)) {
    const routes = getSelectedRoutes(cliOptions);
    const { authPath, summary } = await captureBaselineSummary(
      artifactDir,
      routes,
      cliOptions
    );
    const state = createEndUserLoopState({
      artifactDir,
      authPath,
      baselineSummary: summary,
      cliOptions,
      promptPath,
      routes,
      routesDir,
    });
    state.baselinePath = baselinePath;
    state.measurementCount = 1;
    writeJsonFile(baselinePath, summary);
    writeJsonFile(resolve(measurementsDir, 'attempt-001.json'), summary);
    writePrompt(state, collectChangedFiles());
    saveState(statePath, state);
    printLoopSummary(state);
    return;
  }

  const persistedState = readJsonFile<EndUserLoopState>(statePath);
  const state = refreshEndUserLoopStateConfig(persistedState, cliOptions);
  const changedFiles = collectChangedFiles();
  const routeState = getCurrentRouteState(state);

  if (!routeState) {
    writePrompt(state, changedFiles);
    saveState(statePath, state);
    printLoopSummary(state);
    return;
  }

  const routeMeasurementsDir = resolveStatePaths(
    routeState.routeArtifactDir
  ).measurementsDir;
  ensureDir(routeMeasurementsDir);

  if (!routeState.perfState.bestMeasurement) {
    const measurement = await measureCurrentState(
      routeState.perfState.config,
      routeMeasurementsDir,
      cliOptions.skipBuild
    );
    routeState.perfState.baselineMeasurement = measurement;
    routeState.perfState.bestMeasurement = measurement;
    routeState.perfState.status = deriveRunStatus({
      bestMeasurement: measurement,
      config: routeState.perfState.config,
      noProgressCount: routeState.perfState.noProgressCount,
      fallbackStatus: 'running',
    });
    writeJsonFile(
      resolve(routeState.routeArtifactDir, 'baseline.json'),
      measurement
    );

    const pageResult =
      routeState.routeId === 'home'
        ? extractPageByRouteId(
            await measureGuardSummaryForRoute({
              artifactDir,
              authPath: state.authPath,
              routeId: routeState.routeId,
              runs: cliOptions.runsPerSample,
              skipBuild: cliOptions.skipBuild,
            }),
            routeState.routeId
          )
        : normalizeRawPageResults(measurement, routeState.routeId);

    state.measurementCount += 1;
    writeJsonFile(
      resolve(
        measurementsDir,
        `attempt-${String(state.measurementCount).padStart(3, '0')}.json`
      ),
      { routeId: routeState.routeId, page: pageResult }
    );
    applyRouteOutcome(state, routeState, pageResult);
    writePrompt(state, changedFiles);
    saveState(statePath, state);
    printLoopSummary(state);
    return;
  }

  if (changedFiles.length === 0) {
    writePrompt(state, changedFiles);
    saveState(statePath, state);
    printLoopSummary(state);
    return;
  }

  const measurement = await measureCurrentState(
    routeState.perfState.config,
    routeMeasurementsDir,
    cliOptions.skipBuild
  );
  const decision = evaluateMeasurement(
    routeState.perfState.bestMeasurement,
    measurement
  );
  const iteration = createIterationRecord(
    routeState,
    measurement,
    decision.accepted,
    decision.reason,
    changedFiles
  );
  routeState.perfState.iterations.push(iteration);
  writeJsonFile(
    resolve(
      routeState.routeArtifactDir,
      `iteration-${String(iteration.iteration).padStart(3, '0')}.json`
    ),
    { iteration, measurement }
  );

  if (decision.accepted) {
    routeState.perfState.bestMeasurement = measurement;
    routeState.perfState.noProgressCount = 0;
  } else {
    routeState.perfState.noProgressCount += 1;
  }
  routeState.perfState.nextHypothesisIndex = Math.min(
    routeState.perfState.nextHypothesisIndex + 1,
    Math.max(
      getRankedHypotheses(routeState.perfState.config.mode).length - 1,
      0
    )
  );
  routeState.perfState.status = deriveRunStatus({
    bestMeasurement: routeState.perfState.bestMeasurement,
    config: routeState.perfState.config,
    noProgressCount: routeState.perfState.noProgressCount,
    fallbackStatus: 'running',
  });

  const pageResult =
    routeState.routeId === 'home'
      ? extractPageByRouteId(
          await measureGuardSummaryForRoute({
            artifactDir,
            authPath: state.authPath,
            routeId: routeState.routeId,
            runs: cliOptions.runsPerSample,
            skipBuild: cliOptions.skipBuild,
          }),
          routeState.routeId
        )
      : normalizeRawPageResults(measurement, routeState.routeId);

  state.measurementCount += 1;
  writeJsonFile(
    resolve(
      measurementsDir,
      `attempt-${String(state.measurementCount).padStart(3, '0')}.json`
    ),
    { routeId: routeState.routeId, page: pageResult }
  );
  applyRouteOutcome(state, routeState, pageResult);
  writePrompt(state, changedFiles);
  saveState(statePath, state);
  printLoopSummary(state);
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  runEndUserPerfLoop(parsePerfLoopArgs(process.argv.slice(2))).catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
