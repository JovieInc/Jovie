import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type BudgetGuardSummaryLike,
  buildDashboardBudgetGuardArgs,
  createDashboardMeasurement,
  createHomepageMeasurement,
  type DashboardSample,
  extractDashboardSample,
  extractHomepageSample,
  type HomepageSample,
  type LighthouseResultLike,
  type PerfMeasurement,
  type PerfMode,
  type PerfRunConfig,
  type PerfRunState,
} from './performance-optimizer-lib';
import {
  getEndUserPerfRouteById,
  getEndUserPerfRouteManifest,
} from './performance-route-manifest';

interface CommandResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const perfRoot = resolve(repoRoot, '.context', 'perf');
const perfRootRelative = relative(repoRoot, perfRoot);
const defaultAuthPath = resolve(webRoot, '.auth', 'session.json');

function runCommand(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv }
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

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

export function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
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

async function startServer(baseUrl: string, artifactDir: string) {
  await assertBaseUrlPortAvailable(baseUrl);

  const logPath = resolve(artifactDir, 'server.log');
  writeFileSync(logPath, '');
  const { hostname, port } = getBaseUrlServerConfig(baseUrl);

  const standaloneServerPath = resolve(
    repoRoot,
    'apps/web/.next/standalone/apps/web/server.js'
  );
  if (!existsSync(standaloneServerPath)) {
    throw new Error(
      'Standalone production server not found at ' +
        standaloneServerPath +
        '. Run "doppler run --project jovie-web --config dev -- pnpm --filter web build" before running perf scripts.'
    );
  }

  const child = spawn('doppler', ['run', '--', 'node', standaloneServerPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOSTNAME: hostname,
      PORT: String(port),
      // Enable test auth bypass so authenticated routes can be measured
      // without real Clerk sessions. The budget-guard injects bypass cookies.
      E2E_USE_TEST_AUTH_BYPASS: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const append = (chunk: Buffer | string) => {
    writeFileSync(logPath, String(chunk), { flag: 'a' });
  };

  child.stdout?.on('data', append);
  child.stderr?.on('data', append);

  try {
    await waitForServer(baseUrl, child);
  } catch (error) {
    await stopServer(child);
    throw error;
  }
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
  return {
    raw: lhr,
    sample: extractHomepageSample(lhr as LighthouseResultLike),
  };
}

function parseJsonOutput(output: string, message: string) {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error(message);
  }

  const jsonStart = trimmed.indexOf('{');
  if (jsonStart === -1) {
    throw new Error(message);
  }

  const jsonCandidate = trimmed.slice(jsonStart);
  let depth = 0;
  let jsonEnd = -1;
  for (let index = 0; index < jsonCandidate.length; index += 1) {
    if (jsonCandidate[index] === '{') {
      depth += 1;
    } else if (jsonCandidate[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        jsonEnd = index + 1;
        break;
      }
    }
  }

  const jsonString =
    jsonEnd > 0 ? jsonCandidate.slice(0, jsonEnd) : jsonCandidate;
  return JSON.parse(jsonString) as unknown;
}

export function requiresDashboardAuth(route?: string, routeId?: string) {
  const matchedRoute = routeId
    ? getEndUserPerfRouteById(routeId)
    : route
      ? getEndUserPerfRouteManifest().find(
          candidate => candidate.path === route
        )
      : undefined;

  return matchedRoute?.requiresAuth ?? true;
}

function measureDashboardSample(
  baseUrl: string,
  authPath?: string,
  route?: string,
  routeId?: string
) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    BASE_URL: baseUrl,
    // Ensure bypass is available to the budget-guard subprocess
    E2E_USE_TEST_AUTH_BYPASS: '1',
  };
  const resolvedAuthPath = resolveAuthPath(authPath);
  const requiresAuth = requiresDashboardAuth(route, routeId);

  const hasTestBypass =
    process.env.E2E_USE_TEST_AUTH_BYPASS === '1' &&
    Boolean(process.env.E2E_CLERK_USER_ID?.trim());
  if (
    requiresAuth &&
    !hasTestBypass &&
    !process.env.CLERK_SESSION_COOKIE &&
    !resolvedAuthPath
  ) {
    throw new Error(
      'Dashboard mode requires CLERK_SESSION_COOKIE, --auth-path, or E2E_USE_TEST_AUTH_BYPASS=1 with E2E_CLERK_USER_ID.'
    );
  }
  if (resolvedAuthPath) {
    env.PERF_BUDGET_AUTH_PATH = resolvedAuthPath;
  }

  const args = buildDashboardBudgetGuardArgs(resolvedAuthPath, route, routeId);
  const result = runCommand('doppler', args, { cwd: repoRoot, env });
  const rawSummary = parseJsonOutput(
    result.stdout,
    'Performance budget guard did not emit JSON output.'
  );

  return {
    raw: rawSummary,
    sample: extractDashboardSample(rawSummary as BudgetGuardSummaryLike),
  };
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

export function resolveStatePaths(artifactDir: string) {
  return {
    measurementsDir: resolve(artifactDir, 'measurements'),
    promptPath: resolve(artifactDir, 'optimizer-prompt.txt'),
    statePath: resolve(artifactDir, 'state.json'),
  };
}

export function resolveAuthPath(authPath?: string) {
  if (authPath) {
    return resolve(repoRoot, authPath);
  }

  return existsSync(defaultAuthPath) ? defaultAuthPath : undefined;
}

export function filterChangedFiles(files: readonly string[]) {
  return [
    ...new Set(
      files
        .map(line => line.trim())
        .filter(Boolean)
        .filter(
          file =>
            file !== perfRootRelative &&
            !file.startsWith(`${perfRootRelative}/`)
        )
    ),
  ];
}

export function collectChangedFiles() {
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

  return filterChangedFiles([
    ...tracked.stdout.split('\n'),
    ...untracked.stdout.split('\n'),
  ]);
}

export async function measureCurrentState(
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
      for (let run = 0; run < config.runsPerSample; run += 1) {
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
    for (let run = 0; run < config.runsPerSample; run += 1) {
      const result = measureDashboardSample(
        config.baseUrl,
        config.authPath,
        config.route,
        config.routeId
      );
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
