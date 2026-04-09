import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type GuardSummary,
  runPerformanceBudgetsGuard,
} from './performance-budgets-guard';
import {
  getGroupPriority,
  type PerfRouteGroup,
} from './performance-route-manifest';

export interface PerfRouteQueueEntry {
  readonly configuredPath: string;
  readonly group: PerfRouteGroup;
  readonly id: string;
  readonly overshootPct: number;
  readonly primaryBudget: number;
  readonly primaryMetric: string;
  readonly primaryMeasured: number;
  readonly resolvedPath: string;
  readonly violationCount: number;
}

export interface PerfMeasurementSnapshot {
  readonly artifactPath: string;
  readonly checkedAt: string;
  readonly status: 'fail' | 'pass';
  readonly violationCount: number;
}

export interface PerfOvernightState {
  readonly acceptedChanges: number;
  readonly artifactDir: string;
  readonly attempts: number;
  readonly authStatePath?: string;
  readonly buildPort: number;
  readonly completedRoutes: readonly string[];
  readonly currentRoute: string | null;
  readonly failingRoutes: readonly string[];
  readonly lastMeasurement?: PerfMeasurementSnapshot;
  readonly routeQueue: readonly PerfRouteQueueEntry[];
}

interface PerfOvernightCliOptions {
  readonly authPath?: string;
  readonly json: boolean;
  readonly manifestPath?: string;
  readonly resume: boolean;
  readonly runs: number;
  readonly scope: 'end-user';
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
const overnightStatePath = resolve(perfRoot, 'end-user-state.json');
const defaultAuthOutputPath = resolve(perfRoot, 'auth', 'user.json');

function timestampLabel() {
  return new Date().toISOString().replaceAll(':', '-');
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

function parseCliArgs(args: readonly string[]): PerfOvernightCliOptions {
  let authPath: string | undefined;
  let json = false;
  let manifestPath: string | undefined;
  let resume = false;
  let runs = 3;
  let scope: 'end-user' = 'end-user';

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      continue;
    }

    if (arg === '--scope') {
      const value = args[index + 1];
      if (value !== 'end-user') {
        throw new TypeError('Expected --scope end-user');
      }
      scope = value;
      index += 1;
      continue;
    }

    if (arg === '--resume') {
      resume = true;
      continue;
    }

    if (arg === '--manifest') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --manifest');
      }
      manifestPath = value;
      index += 1;
      continue;
    }

    if (arg === '--auth-path') {
      const value = args[index + 1];
      if (!value) {
        throw new TypeError('Missing value for --auth-path');
      }
      authPath = value;
      index += 1;
      continue;
    }

    if (arg === '--runs') {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0 || value % 2 === 0) {
        throw new TypeError('Expected a positive odd integer for --runs');
      }
      runs = value;
      index += 1;
      continue;
    }

    if (arg === '--json') {
      json = true;
      continue;
    }

    throw new TypeError(`Unknown argument: ${arg}`);
  }

  return {
    authPath,
    json,
    manifestPath,
    resume,
    runs,
    scope,
  };
}

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, 'utf8')) as T;
}

function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}

function runCommand(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
  }
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

export async function findFreePort() {
  return await new Promise<number>((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to determine a free port.'));
        return;
      }

      const { port } = address;
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }

        resolvePromise(port);
      });
    });
  });
}

function resolveArtifactDir(options: PerfOvernightCliOptions) {
  ensureDir(perfRoot);
  if (options.resume && existsSync(overnightStatePath)) {
    const previousState = readJsonFile<PerfOvernightState>(overnightStatePath);
    if (previousState.artifactDir) {
      ensureDir(previousState.artifactDir);
      return previousState.artifactDir;
    }
  }

  const artifactDir = resolve(perfRoot, `end-user-${timestampLabel()}`);
  ensureDir(artifactDir);
  return artifactDir;
}

function buildProject() {
  const buildResult = runCommand(
    'doppler',
    ['run', '--', 'pnpm', '--filter', 'web', 'build'],
    { cwd: repoRoot }
  );
  assertSuccess(buildResult, 'Performance overnight build failed.');
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

async function startServer(
  artifactDir: string,
  port: number,
  extraEnv?: NodeJS.ProcessEnv
) {
  const baseUrl = `http://127.0.0.1:${port}`;
  const logPath = resolve(artifactDir, 'server.log');
  writeFileSync(logPath, '');
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
      ...extraEnv,
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

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

export function buildRouteQueue(summary: GuardSummary): PerfRouteQueueEntry[] {
  return summary.pages
    .filter(page => page.violations.length > 0)
    .map(page => {
      const primaryBudget =
        page.timings.find(metric => metric.name === page.primaryMetric)
          ?.budget ?? 0;
      const primaryMeasured =
        page.rawTimings[page.primaryMetric as keyof typeof page.rawTimings];
      const overshootPct =
        page.violations.length > 0
          ? Math.max(
              ...page.violations.map(violation => violation.overshootPct)
            )
          : 0;

      return {
        configuredPath: page.configuredPath,
        group: page.group as PerfRouteGroup,
        id: page.id,
        overshootPct,
        primaryBudget,
        primaryMeasured,
        primaryMetric: page.primaryMetric,
        resolvedPath: page.resolvedPath,
        violationCount: page.violations.length,
      };
    })
    .sort((left, right) => {
      const groupDelta =
        getGroupPriority(left.group) - getGroupPriority(right.group);
      if (groupDelta !== 0) {
        return groupDelta;
      }

      if (left.overshootPct !== right.overshootPct) {
        return right.overshootPct - left.overshootPct;
      }

      return left.id.localeCompare(right.id);
    });
}

export function buildOvernightState(options: {
  readonly artifactDir: string;
  readonly attempts: number;
  readonly authStatePath?: string;
  readonly buildPort: number;
  readonly previousState?: PerfOvernightState;
  readonly summary: GuardSummary;
  readonly summaryArtifactPath: string;
}): PerfOvernightState {
  const routeQueue = buildRouteQueue(options.summary);
  const completedRoutes = options.summary.pages
    .filter(page => page.violations.length === 0)
    .map(page => page.id);
  const failingRoutes = routeQueue.map(entry => entry.id);

  return {
    acceptedChanges: options.previousState?.acceptedChanges ?? 0,
    artifactDir: options.artifactDir,
    attempts: options.attempts,
    authStatePath: options.authStatePath,
    buildPort: options.buildPort,
    completedRoutes,
    currentRoute: routeQueue[0]?.id ?? null,
    failingRoutes,
    lastMeasurement: {
      artifactPath: options.summaryArtifactPath,
      checkedAt: options.summary.checkedAt,
      status: options.summary.status,
      violationCount: options.summary.violationCount,
    },
    routeQueue,
  };
}

function bootstrapAuthState(
  artifactDir: string,
  baseUrl: string,
  explicitAuthPath?: string
) {
  const authPath = explicitAuthPath
    ? resolve(repoRoot, explicitAuthPath)
    : defaultAuthOutputPath;

  ensureDir(dirname(authPath));

  return runPerfAuth(baseUrl, authPath);
}

function writeOutput(
  options: PerfOvernightCliOptions,
  state: PerfOvernightState
) {
  const serialized = JSON.stringify(state, null, 2);
  if (options.json) {
    process.stdout.write(`${serialized}\n`);
    return;
  }

  console.log(serialized);
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.scope !== 'end-user') {
    throw new Error(`Unsupported scope: ${options.scope}`);
  }

  const previousState =
    options.resume && existsSync(overnightStatePath)
      ? readJsonFile<PerfOvernightState>(overnightStatePath)
      : undefined;

  const artifactDir = resolveArtifactDir(options);
  const measurementsDir = resolve(artifactDir, 'measurements');
  ensureDir(measurementsDir);

  buildProject();

  const buildPort = await findFreePort();
  let server = await startServer(artifactDir, buildPort);

  try {
    let authStatePath: string;

    try {
      authStatePath = bootstrapAuthState(
        artifactDir,
        server.baseUrl,
        options.authPath
      );
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
      server = await startServer(artifactDir, buildPort, {
        E2E_USE_TEST_AUTH_BYPASS: '1',
        NEXT_PUBLIC_CLERK_MOCK: '1',
        NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
      });
      authStatePath = bootstrapAuthState(
        artifactDir,
        server.baseUrl,
        options.authPath
      );
    }

    const summary = await runPerformanceBudgetsGuard({
      authPath: authStatePath,
      baseUrl: server.baseUrl,
      groupIds: [],
      json: true,
      manifestPath: options.manifestPath,
      paths: [],
      routeIds: [],
      runs: options.runs,
    });

    const summaryArtifactPath = resolve(
      measurementsDir,
      `attempt-${String((previousState?.attempts ?? 0) + 1).padStart(3, '0')}.json`
    );
    writeJsonFile(summaryArtifactPath, summary);

    const state = buildOvernightState({
      artifactDir,
      attempts: (previousState?.attempts ?? 0) + 1,
      authStatePath,
      buildPort,
      previousState,
      summary,
      summaryArtifactPath,
    });

    writeJsonFile(overnightStatePath, state);
    writeOutput(options, state);

    if (summary.status === 'fail') {
      process.exitCode = 1;
    }
  } finally {
    await stopServer(server.child);
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
}
