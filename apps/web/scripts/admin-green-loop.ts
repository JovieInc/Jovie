import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { type FSWatcher, watch } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_REDIRECT_SURFACES,
  ADMIN_RENDER_SURFACES,
} from '@/tests/e2e/utils/admin-surface-manifest';

type AdminGreenMode = 'record' | 'verify' | 'watch';
type GoalStatus = 'green' | 'red';

interface GoalDefinition {
  readonly id: string;
  readonly label: string;
  readonly command: readonly string[];
}

interface GoalResult {
  readonly id: string;
  readonly label: string;
  readonly command: readonly string[];
  readonly status: GoalStatus;
  readonly exitCode: number;
  readonly durationMs: number;
}

interface AdminGreenRuntime {
  readonly serverPort: string;
  readonly serverBaseUrl: string;
  readonly sharedEnv: NodeJS.ProcessEnv;
  readonly serverEnv: NodeJS.ProcessEnv;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const WEB_ROOT = resolve(REPO_ROOT, 'apps/web');
const REPORT_PATH = resolve(REPO_ROOT, '.context/admin-green/latest.json');
const DEFAULT_SERVER_PORT = Number.parseInt(
  process.env.ADMIN_GREEN_PORT ?? '3110',
  10
);
const SERVER_READY_TIMEOUT_MS = Number(
  process.env.ADMIN_GREEN_SERVER_TIMEOUT_MS ?? 300_000
);
const SERVER_HEALTHCHECK_TIMEOUT_MS = 5_000;
const SERVER_SHUTDOWN_TIMEOUT_MS = 15_000;
const SERVER_LOG_LIMIT = 200;

const VERIFY_GOALS: readonly GoalDefinition[] = [
  {
    id: 'seed-admin-data',
    label: 'Seed Admin Fixtures',
    command: ['pnpm', 'run', 'admin:seed'],
  },
  {
    id: 'admin-dashboard',
    label: 'Admin Dashboard Smoke',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      'tests/e2e/admin-dashboard.spec.ts',
    ],
  },
  {
    id: 'admin-navigation',
    label: 'Admin Navigation Smoke',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      'tests/e2e/admin-navigation.spec.ts',
    ],
  },
  {
    id: 'admin-gtm-health',
    label: 'Admin GTM Health Smoke',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      'tests/e2e/admin-gtm-health.spec.ts',
    ],
  },
  {
    id: 'admin-visual-goldens',
    label: 'Admin Visual Goldens',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      'tests/e2e/admin-visual-regression.spec.ts',
    ],
  },
] as const;

const RECORD_GOALS: readonly GoalDefinition[] = [
  {
    id: 'seed-admin-data',
    label: 'Seed Admin Fixtures',
    command: ['pnpm', 'run', 'admin:seed'],
  },
  {
    id: 'record-admin-visual-goldens',
    label: 'Record Admin Visual Goldens',
    command: [
      'pnpm',
      'exec',
      'playwright',
      'test',
      'tests/e2e/admin-visual-regression.spec.ts',
      '--update-snapshots',
    ],
  },
] as const;

function parseMode(input: string | undefined): AdminGreenMode {
  if (input === 'record' || input === 'verify' || input === 'watch') {
    return input;
  }

  return 'verify';
}

function getGoals(mode: AdminGreenMode): readonly GoalDefinition[] {
  return mode === 'record' ? RECORD_GOALS : VERIFY_GOALS;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolvePort => {
    const probe = createServer();

    probe.once('error', () => {
      resolvePort(false);
    });

    probe.once('listening', () => {
      probe.close(() => resolvePort(true));
    });

    probe.listen(port);
  });
}

async function resolveServerPort(): Promise<string> {
  for (
    let candidate = DEFAULT_SERVER_PORT;
    candidate < DEFAULT_SERVER_PORT + 50;
    candidate += 1
  ) {
    if (await isPortAvailable(candidate)) {
      return String(candidate);
    }
  }

  throw new Error(
    `Unable to find an open port for admin green loop starting at ${DEFAULT_SERVER_PORT}.`
  );
}

function createRuntime(serverPort: string): AdminGreenRuntime {
  const serverBaseUrl = `http://localhost:${serverPort}`;
  const sharedEnv = {
    ...process.env,
    BASE_URL: serverBaseUrl,
    E2E_SKIP_WEB_SERVER: '1',
    E2E_USE_TEST_AUTH_BYPASS: '1',
    E2E_TEST_AUTH_PERSONA: 'admin',
    NEXT_PUBLIC_CLERK_MOCK: '1',
    NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
  } satisfies NodeJS.ProcessEnv;

  return {
    serverPort,
    serverBaseUrl,
    sharedEnv,
    serverEnv: {
      ...sharedEnv,
      NODE_ENV: 'test',
      PORT: serverPort,
      NEXT_PUBLIC_E2E_MODE: '1',
      NEXT_DISABLE_TOOLBAR: '1',
      E2E_FAST_ONBOARDING: '1',
      E2E_ALLOW_DEV_CSP: '1',
      NODE_OPTIONS:
        `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=8192`.trim(),
    } satisfies NodeJS.ProcessEnv,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolveSleep => {
    setTimeout(resolveSleep, ms);
  });
}

function pushServerLog(
  buffer: string[],
  chunk: Buffer | string,
  stream: 'stdout' | 'stderr'
) {
  const lines = chunk
    .toString()
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => `[${stream}] ${line}`);

  if (lines.length === 0) {
    return;
  }

  buffer.push(...lines);
  if (buffer.length > SERVER_LOG_LIMIT) {
    buffer.splice(0, buffer.length - SERVER_LOG_LIMIT);
  }
}

function getServerLogSnippet(buffer: readonly string[]): string {
  if (buffer.length === 0) {
    return 'No server logs captured.';
  }

  return buffer.join('\n');
}

function extractConflictingNextDevPid(
  buffer: readonly string[]
): number | null {
  const joinedLogs = buffer.join('\n');
  if (!joinedLogs.includes('Another next dev server is already running.')) {
    return null;
  }

  const match = joinedLogs.match(/PID:\s+(\d+)/);
  if (!match) {
    return null;
  }

  const pid = Number.parseInt(match[1], 10);
  return Number.isFinite(pid) ? pid : null;
}

async function forceKillPid(pid: number): Promise<void> {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }

  await sleep(1_000);

  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
  } catch {
    // Process is already gone.
  }
}

async function cleanupLingeringNextServers(): Promise<void> {
  const result = spawnSync('ps', ['-axo', 'pid=,command='], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  if (result.status !== 0 || !result.stdout) {
    return;
  }

  const matchingPids = result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => {
      const [pidText, ...commandParts] = line.split(/\s+/);
      const command = commandParts.join(' ');

      if (!command.includes(WEB_ROOT) || !command.includes('next-server')) {
        return [];
      }

      const pid = Number.parseInt(pidText, 10);
      return Number.isFinite(pid) ? [pid] : [];
    });

  if (matchingPids.length === 0) {
    return;
  }

  for (const pid of matchingPids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Best effort cleanup.
    }
  }

  await sleep(1_000);

  for (const pid of matchingPids) {
    try {
      process.kill(pid, 0);
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process is already gone.
    }
  }
}

async function waitForServerReady(
  server: ChildProcess,
  recentLogs: readonly string[],
  runtime: AdminGreenRuntime
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SERVER_READY_TIMEOUT_MS) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(
        [
          'Admin green loop server exited before becoming ready.',
          `exitCode=${server.exitCode ?? 'null'}`,
          `signal=${server.signalCode ?? 'null'}`,
          getServerLogSnippet(recentLogs),
        ].join('\n')
      );
    }

    try {
      const response = await fetch(runtime.serverBaseUrl, {
        signal: AbortSignal.timeout(SERVER_HEALTHCHECK_TIMEOUT_MS),
      });

      if (response.status < 500) {
        return;
      }
    } catch {
      // Keep polling until the timeout expires.
    }

    await sleep(1_000);
  }

  throw new Error(
    [
      `Timed out waiting for admin green loop server at ${runtime.serverBaseUrl}.`,
      getServerLogSnippet(recentLogs),
    ].join('\n')
  );
}

async function stopServer(server: ChildProcess | null): Promise<void> {
  if (!server || server.exitCode !== null || server.signalCode !== null) {
    return;
  }

  const signalTarget =
    typeof server.pid === 'number' && process.platform !== 'win32'
      ? -server.pid
      : server.pid;
  const exited = new Promise<void>(resolveExit => {
    server.once('exit', () => resolveExit());
  });

  if (typeof signalTarget === 'number') {
    try {
      process.kill(signalTarget, 'SIGTERM');
    } catch {
      // Best effort shutdown.
    }
  }

  await Promise.race([
    exited,
    sleep(SERVER_SHUTDOWN_TIMEOUT_MS).then(async () => {
      if (
        server.exitCode === null &&
        server.signalCode === null &&
        typeof signalTarget === 'number'
      ) {
        try {
          process.kill(signalTarget, 'SIGKILL');
        } catch {
          // Best effort shutdown.
        }
        await exited;
      }
    }),
  ]);
}

function createManagedServer(runtime: AdminGreenRuntime) {
  let server: ChildProcess | null = null;
  let startPromise: Promise<void> | null = null;
  const recentLogs: string[] = [];

  const start = async () => {
    if (server && server.exitCode === null && server.signalCode === null) {
      return;
    }

    const bootServer = async () => {
      await cleanupLingeringNextServers();
      recentLogs.length = 0;
      server = spawn('pnpm', ['run', 'dev:local:playwright'], {
        cwd: WEB_ROOT,
        env: runtime.serverEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });

      server.stdout?.on('data', chunk => {
        pushServerLog(recentLogs, chunk, 'stdout');
      });
      server.stderr?.on('data', chunk => {
        pushServerLog(recentLogs, chunk, 'stderr');
      });

      await waitForServerReady(server, recentLogs, runtime);
    };

    try {
      await bootServer();
    } catch (error) {
      const conflictPid = extractConflictingNextDevPid(recentLogs);
      if (!conflictPid) {
        throw error;
      }

      await forceKillPid(conflictPid);
      server = null;
      await bootServer();
    }
  };

  const ensure = async () => {
    if (startPromise) {
      await startPromise;
      return;
    }

    if (server && server.exitCode === null && server.signalCode === null) {
      try {
        const response = await fetch(runtime.serverBaseUrl, {
          signal: AbortSignal.timeout(SERVER_HEALTHCHECK_TIMEOUT_MS),
        });

        if (response.status < 500) {
          return;
        }
      } catch {
        // Restart unhealthy server below.
      }

      await stopServer(server);
      server = null;
    }

    startPromise = start().finally(() => {
      startPromise = null;
    });
    await startPromise;
  };

  const dispose = async () => {
    await stopServer(server);
    server = null;
  };

  return {
    ensure,
    dispose,
  };
}

async function runGoal(
  goal: GoalDefinition,
  runtime: AdminGreenRuntime
): Promise<GoalResult> {
  const startedAt = Date.now();

  const exitCode = await new Promise<number>(resolveExit => {
    const child = spawn(goal.command[0], [...goal.command.slice(1)], {
      cwd: WEB_ROOT,
      env: runtime.sharedEnv,
      stdio: 'inherit',
    });

    child.on('close', code => resolveExit(code ?? 1));
    child.on('error', () => resolveExit(1));
  });

  return {
    id: goal.id,
    label: goal.label,
    command: goal.command,
    status: exitCode === 0 ? 'green' : 'red',
    exitCode,
    durationMs: Date.now() - startedAt,
  };
}

async function writeReport(
  mode: AdminGreenMode,
  results: readonly GoalResult[],
  runtime: AdminGreenRuntime
): Promise<void> {
  const green = results.every(result => result.status === 'green');
  const payload = {
    mode,
    green,
    generatedAt: new Date().toISOString(),
    auth: {
      baseUrl: runtime.serverBaseUrl,
      E2E_USE_TEST_AUTH_BYPASS: runtime.sharedEnv.E2E_USE_TEST_AUTH_BYPASS,
      E2E_TEST_AUTH_PERSONA: runtime.sharedEnv.E2E_TEST_AUTH_PERSONA,
      NEXT_PUBLIC_CLERK_MOCK: runtime.sharedEnv.NEXT_PUBLIC_CLERK_MOCK,
      NEXT_PUBLIC_CLERK_PROXY_DISABLED:
        runtime.sharedEnv.NEXT_PUBLIC_CLERK_PROXY_DISABLED,
    },
    manifest: {
      renderCount: ADMIN_RENDER_SURFACES.length,
      redirectCount: ADMIN_REDIRECT_SURFACES.length,
      renderSurfaces: ADMIN_RENDER_SURFACES.map(surface => ({
        id: surface.id,
        path: surface.path,
        testId: surface.rootTestId,
      })),
      redirects: ADMIN_REDIRECT_SURFACES.map(surface => ({
        id: surface.id,
        path: surface.path,
        destination: surface.destination,
      })),
    },
    results,
  };

  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function printGoalMatrix(
  mode: AdminGreenMode,
  goals: readonly GoalDefinition[],
  runtime: AdminGreenRuntime
) {
  console.log(`Admin green loop mode: ${mode}`);
  console.log(`Managed server: ${runtime.serverBaseUrl}`);
  console.log('Render surfaces:');
  for (const surface of ADMIN_RENDER_SURFACES) {
    console.log(`  - ${surface.id}: ${surface.path} -> ${surface.rootTestId}`);
  }
  console.log('Redirect surfaces:');
  for (const surface of ADMIN_REDIRECT_SURFACES) {
    console.log(`  - ${surface.id}: ${surface.path} -> ${surface.destination}`);
  }
  console.log('Execution goals:');
  for (const goal of goals) {
    console.log(`  - ${goal.id}: ${goal.command.join(' ')}`);
  }
}

async function runPass(
  mode: AdminGreenMode,
  runtime: AdminGreenRuntime
): Promise<readonly GoalResult[]> {
  const goals = getGoals(mode);
  printGoalMatrix(mode, goals, runtime);

  const results: GoalResult[] = [];

  for (const goal of goals) {
    if (goal.id === 'seed-admin-data') {
      results.push(await runGoal(goal, runtime));
      continue;
    }

    const managedServer = createManagedServer(runtime);
    await managedServer.ensure();

    try {
      results.push(await runGoal(goal, runtime));
    } finally {
      await managedServer.dispose();
    }
  }

  await writeReport(mode, results, runtime);
  return results;
}

async function watchUntilGreen(runtime: AdminGreenRuntime) {
  let running = false;
  let queued = false;
  let watcher: FSWatcher | null = null;
  let resolveWatch: (() => void) | null = null;
  let rejectWatch: ((error: unknown) => void) | null = null;
  let completed = false;

  const finish = () => {
    if (completed) {
      return;
    }

    completed = true;
    watcher?.close();
    watcher = null;
    resolveWatch?.();
  };

  const runVerifyPass = async () => {
    if (completed) {
      return;
    }

    if (running) {
      queued = true;
      return;
    }

    running = true;

    try {
      const results = await runPass('verify', runtime);
      if (results.every(result => result.status === 'green')) {
        finish();
        return;
      }
    } catch (error) {
      completed = true;
      watcher?.close();
      watcher = null;
      rejectWatch?.(error);
      return;
    } finally {
      running = false;
    }

    if (queued) {
      queued = false;
      await runVerifyPass();
    }
  };

  await new Promise<void>((resolvePromise, rejectPromise) => {
    resolveWatch = resolvePromise;
    rejectWatch = rejectPromise;

    watcher = watch(
      REPO_ROOT,
      {
        recursive: true,
      },
      (_eventType, filename) => {
        if (!filename || completed) {
          return;
        }

        if (
          filename.includes('/.git/') ||
          filename.includes('/node_modules/') ||
          filename.includes('/.next/') ||
          filename.includes('/test-results/') ||
          filename.includes('.context/')
        ) {
          return;
        }

        void runVerifyPass();
      }
    );

    void runVerifyPass();
  });
}

async function main() {
  const mode = parseMode(process.argv[2]);
  const runtime = createRuntime(await resolveServerPort());

  process.once('SIGINT', () => {
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    process.exit(143);
  });

  if (mode === 'watch') {
    await watchUntilGreen(runtime);
    process.exitCode = 0;
    return;
  }

  const results = await runPass(mode, runtime);
  const exitCode = results.every(result => result.status === 'green') ? 0 : 1;
  process.exitCode = exitCode;
}

main().catch(async error => {
  console.error('[admin-green-loop] failed', error);
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(
    REPORT_PATH,
    `${JSON.stringify(
      {
        mode: parseMode(process.argv[2]),
        green: false,
        generatedAt: new Date().toISOString(),
        fatalError: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  process.exitCode = 1;
});
