import { type ChildProcess, spawn } from 'node:child_process';
import { type FSWatcher, watch } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
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

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..', '..');
const WEB_ROOT = resolve(REPO_ROOT, 'apps/web');
const REPORT_PATH = resolve(REPO_ROOT, '.context/admin-green/latest.json');
const SERVER_PORT = process.env.ADMIN_GREEN_PORT ?? '3100';
const SERVER_BASE_URL =
  process.env.BASE_URL ?? `http://localhost:${SERVER_PORT}`;
const SERVER_READY_TIMEOUT_MS = Number(
  process.env.ADMIN_GREEN_SERVER_TIMEOUT_MS ?? 300_000
);
const SERVER_HEALTHCHECK_TIMEOUT_MS = 5_000;
const SERVER_SHUTDOWN_TIMEOUT_MS = 15_000;
const SERVER_LOG_LIMIT = 200;

const SHARED_ENV = {
  ...process.env,
  BASE_URL: SERVER_BASE_URL,
  E2E_SKIP_WEB_SERVER: '1',
  E2E_USE_TEST_AUTH_BYPASS: '1',
  E2E_TEST_AUTH_PERSONA: 'admin',
  NEXT_PUBLIC_CLERK_MOCK: '1',
  NEXT_PUBLIC_CLERK_PROXY_DISABLED: '1',
} satisfies NodeJS.ProcessEnv;

const SERVER_ENV = {
  ...SHARED_ENV,
  NODE_ENV: 'test',
  PORT: SERVER_PORT,
  NEXT_PUBLIC_E2E_MODE: '1',
  NEXT_DISABLE_TOOLBAR: '1',
  E2E_FAST_ONBOARDING: '1',
  E2E_ALLOW_DEV_CSP: '1',
  NODE_OPTIONS:
    `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=8192`.trim(),
} satisfies NodeJS.ProcessEnv;

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

async function waitForServerReady(
  server: ChildProcess,
  recentLogs: readonly string[]
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
      const response = await fetch(SERVER_BASE_URL, {
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
      `Timed out waiting for admin green loop server at ${SERVER_BASE_URL}.`,
      getServerLogSnippet(recentLogs),
    ].join('\n')
  );
}

async function stopServer(server: ChildProcess | null): Promise<void> {
  if (!server || server.exitCode !== null || server.signalCode !== null) {
    return;
  }

  server.kill('SIGTERM');

  await Promise.race([
    new Promise<void>(resolveExit => {
      server.once('exit', () => resolveExit());
    }),
    sleep(SERVER_SHUTDOWN_TIMEOUT_MS).then(() => {
      if (server.exitCode === null && server.signalCode === null) {
        server.kill('SIGKILL');
      }
    }),
  ]);
}

function createManagedServer() {
  let server: ChildProcess | null = null;
  let startPromise: Promise<void> | null = null;
  const recentLogs: string[] = [];

  const start = async () => {
    if (server && server.exitCode === null && server.signalCode === null) {
      return;
    }

    recentLogs.length = 0;
    server = spawn('pnpm', ['run', 'dev:local:playwright'], {
      cwd: WEB_ROOT,
      env: SERVER_ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    server.stdout?.on('data', chunk => {
      pushServerLog(recentLogs, chunk, 'stdout');
    });
    server.stderr?.on('data', chunk => {
      pushServerLog(recentLogs, chunk, 'stderr');
    });

    await waitForServerReady(server, recentLogs);
  };

  const ensure = async () => {
    if (startPromise) {
      await startPromise;
      return;
    }

    if (server && server.exitCode === null && server.signalCode === null) {
      try {
        const response = await fetch(SERVER_BASE_URL, {
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

async function runGoal(goal: GoalDefinition): Promise<GoalResult> {
  const startedAt = Date.now();

  const exitCode = await new Promise<number>(resolveExit => {
    const child = spawn(goal.command[0], [...goal.command.slice(1)], {
      cwd: WEB_ROOT,
      env: SHARED_ENV,
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
  results: readonly GoalResult[]
): Promise<void> {
  const green = results.every(result => result.status === 'green');
  const payload = {
    mode,
    green,
    generatedAt: new Date().toISOString(),
    auth: {
      E2E_USE_TEST_AUTH_BYPASS: SHARED_ENV.E2E_USE_TEST_AUTH_BYPASS,
      E2E_TEST_AUTH_PERSONA: SHARED_ENV.E2E_TEST_AUTH_PERSONA,
      NEXT_PUBLIC_CLERK_MOCK: SHARED_ENV.NEXT_PUBLIC_CLERK_MOCK,
      NEXT_PUBLIC_CLERK_PROXY_DISABLED:
        SHARED_ENV.NEXT_PUBLIC_CLERK_PROXY_DISABLED,
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
  goals: readonly GoalDefinition[]
) {
  console.log(`Admin green loop mode: ${mode}`);
  console.log(`Managed server: ${SERVER_BASE_URL}`);
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

async function runPass(mode: AdminGreenMode): Promise<readonly GoalResult[]> {
  const goals = getGoals(mode);
  printGoalMatrix(mode, goals);

  const results: GoalResult[] = [];

  for (const goal of goals) {
    results.push(await runGoal(goal));
  }

  await writeReport(mode, results);
  return results;
}

async function watchUntilGreen(
  managedServer: ReturnType<typeof createManagedServer>
) {
  let running = false;
  let queued = false;
  let watcher: FSWatcher | null = null;

  const runVerifyPass = async () => {
    if (running) {
      queued = true;
      return;
    }

    running = true;
    await managedServer.ensure();
    const results = await runPass('verify');
    const allGreen = results.every(result => result.status === 'green');
    running = false;

    if (allGreen) {
      watcher?.close();
      return;
    }

    if (queued) {
      queued = false;
      await runVerifyPass();
    }
  };

  await runVerifyPass();
  const initialResults = await runPass('verify');
  if (initialResults.every(result => result.status === 'green')) {
    return;
  }

  await new Promise<void>(resolveWatch => {
    watcher = watch(
      REPO_ROOT,
      {
        recursive: true,
      },
      (_eventType, filename) => {
        if (!filename) {
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

        void runVerifyPass().then(() => {
          void writeReport('verify', []);
        });
      }
    );

    const pollForCompletion = async () => {
      while (watcher) {
        await sleep(500);
        const report = await runPass('verify');
        if (report.every(result => result.status === 'green')) {
          watcher.close();
          watcher = null;
          resolveWatch();
          return;
        }
      }
    };

    void pollForCompletion();
  });
}

async function main() {
  const mode = parseMode(process.argv[2]);
  const managedServer = createManagedServer();

  const cleanup = async () => {
    await managedServer.dispose();
  };

  process.once('SIGINT', () => {
    void cleanup().finally(() => process.exit(130));
  });
  process.once('SIGTERM', () => {
    void cleanup().finally(() => process.exit(143));
  });

  try {
    await managedServer.ensure();

    if (mode === 'watch') {
      await watchUntilGreen(managedServer);
      process.exit(0);
      return;
    }

    const results = await runPass(mode);
    const allGreen = results.every(result => result.status === 'green');
    process.exit(allGreen ? 0 : 1);
  } finally {
    await cleanup();
  }
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
  process.exit(1);
});
